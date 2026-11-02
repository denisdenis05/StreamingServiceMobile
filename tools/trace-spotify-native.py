import argparse
import importlib.util
import json
import os
import pathlib
import platform
import resource
import signal
import subprocess
import sys
import threading
import time

DEFAULT_DURATION_SECONDS = 90
MAXIMUM_DURATION_SECONDS = 300
MAXIMUM_EVENTS = 10000
MAXIMUM_ACTIVE_RETURN_BREAKPOINTS = 256
INITIAL_COUNT = 0
INITIAL_IDENTIFIER = 1
FILE_MODE = 0o600
SPOTIFY_EXECUTABLE = '/opt/spotify/spotify'
DEFAULT_DEPENDENCY_DIRECTORY = '/tmp/streaming-service-spotify-trace-dependencies'
OUTPUT_ENVIRONMENT = 'STREAMING_SPOTIFY_NATIVE_TRACE_OUTPUT'
DURATION_ENVIRONMENT = 'STREAMING_SPOTIFY_NATIVE_TRACE_DURATION_SECONDS'
DEPENDENCY_ENVIRONMENT = 'STREAMING_SPOTIFY_NATIVE_TRACE_DEPENDENCY_DIRECTORY'
SCHEMA = 'spotify-native-safe-trace-v1'
MILLISECONDS_PER_SECOND = 1000
GDB_SETTINGS = (
    'set pagination off', 'set confirm off', 'set print thread-events off',
    'set print frame-arguments none', 'set auto-load off', 'set startup-with-shell off',
    'set logging enabled off', 'set detach-on-fork on', 'set inferior-tty /dev/null', 'handle SIGINT stop noprint nopass',
)
WRITE_SYMBOL = 'ssl_write_internal'
READ_SYMBOL = 'ssl_read_internal'
FREE_SYMBOL = 'SSL_free'
BREAKPOINT_ADDRESS_PREFIX = '*'
RETURN_REGISTER = '$rax'
RETURN_INTEGER_MASK = 0xffffffff
RETURN_INTEGER_SIGN_BIT = 0x80000000
SUPPORTED_HOST_ARCHITECTURES = frozenset(('x86_64', 'amd64'))
DEBUGGER_ARCHITECTURE_COMMAND = 'show architecture'
SUPPORTED_DEBUGGER_ARCHITECTURE = 'i386:x86-64'
MAXIMUM_SUMMARY_COUNTER = 1000000000
SUMMARY_COUNTER_FIELDS = ('eventCount', 'errorCount', 'completedTransferCount', 'discardedTransferCount')
SUMMARY_REASONS = frozenset(('duration-completed', 'event-limit', 'debugger-stopped', 'process-exited', 'detach-failed'))
COMPLETED_REASONS = frozenset(('duration-completed', 'event-limit'))
DEBUGGER_FAILED = 'debugger-failed'
SUMMARY_MISSING = 'debugger-summary-missing'


def successful_native_return(return_register):
    integer_return = return_register & RETURN_INTEGER_MASK
    return INITIAL_COUNT < integer_return < RETURN_INTEGER_SIGN_BIT


def project_debugger_result(completed_process, output_path):
    projected = None
    for line in (completed_process.stdout or '').splitlines():
        try:
            candidate = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(candidate, dict) or candidate.get('schema') != SCHEMA or candidate.get('reason') not in SUMMARY_REASONS:
            continue
        if not all(type(candidate.get(field)) is int and INITIAL_COUNT <= candidate[field] <= MAXIMUM_SUMMARY_COUNTER
                for field in SUMMARY_COUNTER_FIELDS):
            continue
        projected = {field: candidate[field] for field in SUMMARY_COUNTER_FIELDS}
        projected['reason'] = candidate['reason']
    result = {'schema': SCHEMA, 'outputPath': output_path, 'debuggerExitCode': completed_process.returncode,
        'captureComplete': False}
    if completed_process.returncode != INITIAL_COUNT:
        return {**result, 'reason': DEBUGGER_FAILED}
    if projected is None:
        return {**result, 'reason': SUMMARY_MISSING}
    return {**result, **projected, 'captureComplete': projected['reason'] in COMPLETED_REASONS}


def launch():
    if platform.machine().lower() not in SUPPORTED_HOST_ARCHITECTURES:
        raise ValueError('unsupported-host-architecture')
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument('--duration-seconds', type=int, default=DEFAULT_DURATION_SECONDS)
    argument_parser.add_argument('--output', required=True)
    argument_parser.add_argument('--dependency-directory', default=DEFAULT_DEPENDENCY_DIRECTORY)
    configuration = argument_parser.parse_args()
    if not INITIAL_IDENTIFIER <= configuration.duration_seconds <= MAXIMUM_DURATION_SECONDS:
        raise ValueError('invalid-duration')
    if spotify_running():
        raise ValueError('spotify-already-running-stop-gracefully-first')
    output_path = str(pathlib.Path(configuration.output).resolve())
    if pathlib.Path(output_path).exists():
        raise ValueError('output-already-exists')
    environment = dict(os.environ)
    environment[OUTPUT_ENVIRONMENT] = output_path
    environment[DURATION_ENVIRONMENT] = str(configuration.duration_seconds)
    environment[DEPENDENCY_ENVIRONMENT] = str(pathlib.Path(configuration.dependency_directory).resolve())
    resource.setrlimit(resource.RLIMIT_CORE, (INITIAL_COUNT, INITIAL_COUNT))
    script_path = str(pathlib.Path(__file__).resolve())
    command = ['gdb', '-nx', '-q', '-batch', '-ex', 'source ' + script_path,
        '--args', SPOTIFY_EXECUTABLE, '--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1']
    completed_process = subprocess.run(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    summary = project_debugger_result(completed_process, output_path)
    print(json.dumps(summary))
    return INITIAL_COUNT if summary['captureComplete'] else INITIAL_IDENTIFIER


def spotify_running():
    for process_path in pathlib.Path('/proc').iterdir():
        if not process_path.name.isdigit():
            continue
        try:
            if str((process_path / 'exe').resolve()) == SPOTIFY_EXECUTABLE:
                return True
        except (OSError, PermissionError):
            continue
    return False


def run_debugger(debugger):
    if SUPPORTED_DEBUGGER_ARCHITECTURE not in debugger.execute(DEBUGGER_ARCHITECTURE_COMMAND, to_string=True):
        raise ValueError('unsupported-debugger-architecture')
    sys.path.insert(INITIAL_COUNT, str(pathlib.Path(__file__).resolve().parent))
    sys.path.insert(INITIAL_COUNT, os.environ[DEPENDENCY_ENVIRONMENT])
    from hpack import Decoder
    from spotify_native_trace import NativeTraceDecoder, MAXIMUM_HEADER_BYTES, MAXIMUM_HEADER_TABLE_BYTES, SENT, RECEIVED, read_completed_payload
    descriptor = os.open(os.environ[OUTPUT_ENVIRONMENT], os.O_WRONLY | os.O_CREAT | os.O_EXCL, FILE_MODE)
    started_at = time.monotonic()
    state = {'events': INITIAL_COUNT, 'errors': INITIAL_COUNT, 'active_returns': INITIAL_COUNT,
        'finished': False, 'reason': 'debugger-stopped', 'process_identifier': INITIAL_COUNT, 'transfers': INITIAL_COUNT, 'discarded_transfers': INITIAL_COUNT}

    def create_header_decoder():
        decoder = Decoder(max_header_list_size=MAXIMUM_HEADER_BYTES)
        decoder.max_allowed_table_size = MAXIMUM_HEADER_TABLE_BYTES
        return decoder

    def emit(record):
        if state['events'] >= MAXIMUM_EVENTS:
            return
        enriched = {'elapsedMilliseconds': round((time.monotonic() - started_at) * MILLISECONDS_PER_SECOND), **record}
        os.write(descriptor, (json.dumps(enriched, separators=(',', ':')) + '\n').encode())
        state['events'] += INITIAL_IDENTIFIER
        if state['events'] >= MAXIMUM_EVENTS:
            state['reason'] = 'event-limit'
            request_stop()

    decoder = NativeTraceDecoder(emit, create_header_decoder)

    def request_stop():
        if state['finished']:
            return
        try:
            process_identifier = state['process_identifier']
            if process_identifier:
                os.kill(process_identifier, signal.SIGINT)
        except Exception:
            state['errors'] += INITIAL_IDENTIFIER

    class CompletedTransfer(debugger.FinishBreakpoint):
        def __init__(self, connection_pointer, buffer_pointer, requested_bytes, actual_bytes_pointer, direction):
            super().__init__(debugger.newest_frame(), internal=True)
            self.connection_pointer = connection_pointer
            self.buffer_pointer = buffer_pointer
            self.requested_bytes = requested_bytes
            self.actual_bytes_pointer = actual_bytes_pointer
            self.direction = direction
            state['active_returns'] += INITIAL_IDENTIFIER

        def finish_accounting(self):
            state['active_returns'] = max(INITIAL_COUNT, state['active_returns'] - INITIAL_IDENTIFIER)

        def stop(self):
            self.finish_accounting()
            try:
                inferior = debugger.selected_inferior()
                successful_return = successful_native_return(int(debugger.parse_and_eval(RETURN_REGISTER)))
                payload = read_completed_payload(inferior.read_memory,
                    successful_return,
                    self.requested_bytes, self.actual_bytes_pointer, self.buffer_pointer)
                if payload is not None:
                    state['transfers'] += INITIAL_IDENTIFIER
                    decoder.feed(self.connection_pointer, self.direction, payload)
                elif successful_return:
                    state['discarded_transfers'] += INITIAL_IDENTIFIER
                    decoder.invalidate_direction(self.connection_pointer, self.direction)
            except Exception:
                state['errors'] += INITIAL_IDENTIFIER
            return False

        def out_of_scope(self):
            self.finish_accounting()

    class TransferEntry(debugger.Breakpoint):
        def __init__(self, symbol, direction):
            super().__init__(BREAKPOINT_ADDRESS_PREFIX + symbol, internal=True)
            self.direction = direction

        def stop(self):
            try:
                if state['active_returns'] < MAXIMUM_ACTIVE_RETURN_BREAKPOINTS:
                    CompletedTransfer(int(debugger.parse_and_eval('$rdi')), int(debugger.parse_and_eval('$rsi')),
                        int(debugger.parse_and_eval('$rdx')), int(debugger.parse_and_eval('$rcx')), self.direction)
            except Exception:
                state['errors'] += INITIAL_IDENTIFIER
            return False

    class FreeConnection(debugger.Breakpoint):
        def __init__(self):
            super().__init__(BREAKPOINT_ADDRESS_PREFIX + FREE_SYMBOL, internal=True)

        def stop(self):
            try:
                decoder.connections.pop(int(debugger.parse_and_eval('$rdi')), None)
            except Exception:
                state['errors'] += INITIAL_IDENTIFIER
            return False

    def record_process(event):
        state['process_identifier'] = debugger.selected_inferior().pid

    debugger.events.cont.connect(record_process)
    for setting in GDB_SETTINGS:
        debugger.execute(setting, to_string=True)
    breakpoints = [TransferEntry(WRITE_SYMBOL, SENT), TransferEntry(READ_SYMBOL, RECEIVED), FreeConnection()]
    def deadline():
        state['reason'] = 'duration-completed'
        request_stop()

    duration_seconds = int(os.environ[DURATION_ENVIRONMENT])
    timer = threading.Timer(duration_seconds, deadline)
    timer.daemon = True
    timer.start()
    try:
        debugger.execute('run', to_string=True)
        if not debugger.selected_inferior().pid:
            state['reason'] = 'process-exited'
    except Exception:
        state['reason'] = 'debugger-stopped'
    finally:
        state['finished'] = True
        timer.cancel()
        debugger.events.cont.disconnect(record_process)
        for breakpoint in debugger.breakpoints() or ():
            if breakpoint.is_valid():
                breakpoint.delete()
        try:
            if debugger.selected_inferior().pid:
                debugger.execute('detach', to_string=True)
        except Exception:
            state['errors'] += INITIAL_IDENTIFIER
            state['reason'] = 'detach-failed'
        os.close(descriptor)
        print(json.dumps({'schema': SCHEMA, 'eventCount': state['events'], 'errorCount': state['errors'], 'completedTransferCount': state['transfers'], 'discardedTransferCount': state['discarded_transfers'],
            'reason': state['reason'], 'outputPath': os.environ[OUTPUT_ENVIRONMENT]}))


if __name__ == '__main__':
    try:
        debugger_specification = importlib.util.find_spec('gdb')
        if debugger_specification is None:
            sys.exit(launch())
        else:
            import gdb
            run_debugger(gdb)
    except Exception:
        print('native-capture-failed', file=sys.stderr)
        sys.exit(INITIAL_IDENTIFIER)
