import contextlib
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock

MODULE_PATH = pathlib.Path(__file__).with_name('trace-spotify-native.py')
MODULE_NAME = 'spotify_native_debugger_launcher'
DEPENDENCY_DIRECTORY = '/tmp/streaming-service-spotify-trace-dependencies'
PROCESS_IDENTIFIER = 4321
CONNECTION_POINTER = 123456
BUFFER_POINTER = 234567
LENGTH_POINTER = 345678
POINTER_BYTES = 8
SUCCESSFUL_RETURN = 1
INITIAL_COUNT = 0
ONE = 1
DURATION_SECONDS = '90'
PRIVATE_VALUE = 'PRIVATE_ACCOUNT_TITLE_BEARER_DEVICE'
REQUEST = ('POST /connect-state/v1/player/command/from/' + PRIVATE_VALUE + '/to/' + PRIVATE_VALUE +
    ' HTTP/1.1\r\nHost: guc-spclient.spotify.com\r\nAuthorization: ' + PRIVATE_VALUE + '\r\nContent-Length: 0\r\n\r\n').encode()
RESPONSE = b'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'


def load_launcher():
    specification = importlib.util.spec_from_file_location(MODULE_NAME, MODULE_PATH)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


class FakeTimer:
    def __init__(self, duration, callback):
        self.callback = callback
        self.daemon = False
    def start(self):
        pass
    def cancel(self):
        pass


class FakeDebugger:
    def __init__(self):
        self.commands = []
        self.registered = []
        self.payload = REQUEST
        self.detached = False
        self.events = self
        self.cont = self
        owner = self
        class FakeBreakpoint:
            def __init__(self, symbol=None, internal=False):
                self.symbol = symbol
                self.valid = True
                owner.registered.append(self)
            def is_valid(self):
                return self.valid
            def delete(self):
                self.valid = False
        class FakeFinishBreakpoint(FakeBreakpoint):
            def __init__(self, frame, internal=False):
                super().__init__(internal=internal)
                self.return_value = None
        self.Breakpoint = FakeBreakpoint
        self.FinishBreakpoint = FakeFinishBreakpoint
    def connect(self, callback):
        self.continuation = callback
    def disconnect(self, callback):
        self.continuation = None
    def newest_frame(self):
        return None
    def selected_inferior(self):
        return self
    @property
    def pid(self):
        return PROCESS_IDENTIFIER
    def read_memory(self, pointer, length):
        return memoryview(len(self.payload).to_bytes(POINTER_BYTES, 'little') if pointer == LENGTH_POINTER else self.payload[:length])
    def parse_and_eval(self, expression):
        return {'$rdi': CONNECTION_POINTER, '$rsi': BUFFER_POINTER, '$rdx': len(self.payload), '$rcx': LENGTH_POINTER, '$rax': SUCCESSFUL_RETURN}[expression]
    def breakpoints(self):
        return self.registered
    def execute(self, command, to_string=False):
        self.commands.append(command)
        if command == 'show architecture':
            return 'The target architecture is set to auto (currently i386:x86-64).'
        if command == 'run':
            self.continuation(None)
            for symbol, payload in [('ssl_write_internal', REQUEST), ('ssl_read_internal', RESPONSE)]:
                self.payload = payload
                entry = next(breakpoint for breakpoint in self.registered if breakpoint.symbol == '*' + symbol)
                entry.stop()
                self.registered[-ONE].stop()
        elif command == 'detach':
            self.detached = True
        return ''


class DebuggerLifecycleTests(unittest.TestCase):
    def test_stripped_symbols_with_none_return_value_capture_successful_rax_calls_and_detach(self):
        launcher = load_launcher()
        debugger = FakeDebugger()
        output = io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            output_path = str(pathlib.Path(directory) / 'safe.jsonl')
            environment = {launcher.OUTPUT_ENVIRONMENT: output_path, launcher.DURATION_ENVIRONMENT: DURATION_SECONDS,
                launcher.DEPENDENCY_ENVIRONMENT: DEPENDENCY_DIRECTORY}
            with mock.patch.dict(os.environ, environment), mock.patch.object(launcher.threading, 'Timer', FakeTimer), contextlib.redirect_stdout(output):
                launcher.run_debugger(debugger)
            records = [json.loads(line) for line in pathlib.Path(output_path).read_text().splitlines()]
            self.assertEqual(len(records), ONE + ONE)
            self.assertEqual(records[-ONE]['status'], 200)
            self.assertEqual(records[-ONE]['endpoint'], 'connect-player-command')
            self.assertEqual(pathlib.Path(output_path).stat().st_mode & 0o777, launcher.FILE_MODE)
            self.assertNotIn(PRIVATE_VALUE, json.dumps(records))
            self.assertNotIn(str(CONNECTION_POINTER), json.dumps(records))
        self.assertTrue(debugger.detached)
        self.assertTrue(all(not breakpoint.valid for breakpoint in debugger.registered))
        self.assertIsNone(debugger.continuation)
        self.assertIn('set inferior-tty /dev/null', debugger.commands)
        self.assertIn('set detach-on-fork on', debugger.commands)
        self.assertEqual(json.loads(output.getvalue())['errorCount'], INITIAL_COUNT)

    def test_running_client_is_refused_without_starting_or_stopping_any_process(self):
        launcher = load_launcher()
        with mock.patch.object(launcher, 'spotify_running', return_value=True), mock.patch.object(launcher.sys, 'argv',
                [str(MODULE_PATH), '--output', '/tmp/not-written.jsonl']), mock.patch.object(launcher.subprocess, 'call') as launch_process:
            with self.assertRaises(ValueError):
                launcher.launch()
            launch_process.assert_not_called()


class NativeReturnAndArchitectureTests(unittest.TestCase):
    def test_native_return_register_uses_signed_int_result_instead_of_stripped_debug_types(self):
        launcher = load_launcher()
        self.assertTrue(launcher.successful_native_return(SUCCESSFUL_RETURN))
        self.assertFalse(launcher.successful_native_return(INITIAL_COUNT))
        self.assertFalse(launcher.successful_native_return(launcher.RETURN_INTEGER_MASK))
        self.assertFalse(launcher.successful_native_return(-ONE))

    def test_unsupported_host_architecture_refuses_before_process_actions(self):
        launcher = load_launcher()
        with mock.patch.object(launcher.platform, 'machine', return_value='aarch64'), mock.patch.object(launcher.subprocess, 'call') as launch_process:
            with self.assertRaises(ValueError):
                launcher.launch()
            launch_process.assert_not_called()

    def test_unsupported_debugger_target_refuses_before_opening_output_or_breakpoints(self):
        launcher = load_launcher()
        debugger = FakeDebugger()
        debugger.execute = lambda command, to_string=False: 'currently aarch64'
        with mock.patch.object(launcher.os, 'open') as open_output:
            with self.assertRaises(ValueError):
                launcher.run_debugger(debugger)
            open_output.assert_not_called()
        self.assertEqual(debugger.registered, [])
