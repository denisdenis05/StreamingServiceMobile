import json
import sys
import unittest

DEPENDENCY_DIRECTORY = '/tmp/streaming-service-spotify-trace-dependencies'
sys.path.insert(0, DEPENDENCY_DIRECTORY)
from hpack import Encoder, Decoder
from spotify_native_trace import NativeTraceDecoder, classify_endpoint, project_headers, SENT, RECEIVED, HTTP2_PREFACE, MAXIMUM_BUFFER_BYTES

PRIVATE_VALUE = b'PRIVATE_ACCOUNT_SONG_AUTH_DEVICE'
PRIVATE_POINTER = 0x123456
OTHER_POINTER = 0x654321
SUCCESS_STATUS = 200
REQUEST_METHOD = b'POST'
CONNECT_HOST = b'guc-spclient.spotify.com'
CONNECT_PATH = b'/connect-state/v1/player/command/from/' + PRIVATE_VALUE + b'/to/' + PRIVATE_VALUE
PARTNER_HOST = b'api-partner.spotify.com'
PARTNER_PATH = b'/pathfinder/v2/query?secret=' + PRIVATE_VALUE
HEADER_END = b'\r\n\r\n'
HEADERS_FRAME = 1
CONTINUATION_FRAME = 9
DATA_FRAME = 0
END_HEADERS = 4
FIRST_STREAM = 1
OTHER_STREAM = 3
HEADER_LENGTH_BYTES = 3
STREAM_BYTES = 4
FRAME_HEADER_BYTES = 9
INITIAL_COUNT = 0
SINGLE_COUNT = 1
PAIR_COUNT = 2
SPLIT_OFFSET = 7
PREFACE_SPLIT = 18
LARGE_LENGTH = MAXIMUM_BUFFER_BYTES + SINGLE_COUNT


def make_frame(kind, flags, stream, payload):
    return len(payload).to_bytes(HEADER_LENGTH_BYTES, 'big') + bytes((kind, flags)) + stream.to_bytes(STREAM_BYTES, 'big') + payload


def request_headers(host=CONNECT_HOST, target=CONNECT_PATH):
    return [(b':method', REQUEST_METHOD), (b':scheme', b'https'), (b':authority', host), (b':path', target),
        (b'authorization', PRIVATE_VALUE), (b'cookie', PRIVATE_VALUE)]


class NativeTraceTests(unittest.TestCase):
    def setUp(self):
        self.records = []
        self.decoder = NativeTraceDecoder(self.records.append, Decoder)

    def assert_private(self):
        encoded = json.dumps(self.records)
        self.assertNotIn(PRIVATE_VALUE.decode(), encoded)
        self.assertNotIn(str(PRIVATE_POINTER), encoded)

    def test_endpoint_and_header_projection_discard_private_fields(self):
        result = project_headers(request_headers())
        self.assertEqual(result, {'event': 'request', 'method': 'POST', 'origin': 'connect', 'endpoint': 'connect-player-command'})
        self.records.append(result)
        self.assert_private()
        self.assertEqual(classify_endpoint('private.invalid', '/private'), {'origin': 'other', 'endpoint': 'unclassified'})
        self.assertIsNone(project_headers([(b':method', PRIVATE_VALUE)]))

    def test_http1_fragmented_headers_and_bodies_preserve_only_request_and_status(self):
        body = PRIVATE_VALUE
        request = b'POST ' + CONNECT_PATH + b' HTTP/1.1\r\nHost: ' + CONNECT_HOST + b'\r\nAuthorization: ' + PRIVATE_VALUE
        request += b'\r\nContent-Length: ' + str(len(body)).encode() + HEADER_END + body
        self.decoder.feed(PRIVATE_POINTER, SENT, request[:SPLIT_OFFSET])
        self.decoder.feed(PRIVATE_POINTER, SENT, request[SPLIT_OFFSET:])
        response = b'HTTP/1.1 200 OK\r\nContent-Length: ' + str(len(body)).encode() + HEADER_END + body
        self.decoder.feed(PRIVATE_POINTER, RECEIVED, response)
        self.assertEqual(len(self.records), PAIR_COUNT)
        self.assertEqual(self.records[-SINGLE_COUNT]['status'], SUCCESS_STATUS)
        self.assertEqual(self.records[-SINGLE_COUNT]['endpoint'], 'connect-player-command')
        self.assert_private()

    def test_http2_fragmented_preface_continuation_and_dynamic_hpack_tables(self):
        encoder = Encoder()
        first = encoder.encode(request_headers())
        second = encoder.encode(request_headers(PARTNER_HOST, PARTNER_PATH))
        outbound = HTTP2_PREFACE + make_frame(HEADERS_FRAME, INITIAL_COUNT, FIRST_STREAM, first[:SPLIT_OFFSET])
        outbound += make_frame(CONTINUATION_FRAME, END_HEADERS, FIRST_STREAM, first[SPLIT_OFFSET:])
        outbound += make_frame(DATA_FRAME, INITIAL_COUNT, FIRST_STREAM, PRIVATE_VALUE)
        outbound += make_frame(HEADERS_FRAME, END_HEADERS, OTHER_STREAM, second)
        self.decoder.feed(PRIVATE_POINTER, SENT, outbound[:PREFACE_SPLIT])
        self.decoder.feed(PRIVATE_POINTER, SENT, outbound[PREFACE_SPLIT:])
        incoming = Encoder().encode([(b':status', b'200'), (b'set-cookie', PRIVATE_VALUE)])
        self.decoder.feed(PRIVATE_POINTER, RECEIVED, make_frame(HEADERS_FRAME, END_HEADERS, OTHER_STREAM, incoming))
        self.assertEqual(len(self.records), PAIR_COUNT + SINGLE_COUNT)
        self.assertEqual(self.records[-SINGLE_COUNT]['endpoint'], 'pathfinder-query')
        self.assertEqual(self.records[-SINGLE_COUNT]['protocol'], 'http2')
        self.assert_private()

    def test_server_frames_before_client_preface_are_decoded_after_protocol_detection(self):
        incoming = Encoder().encode([(b':status', b'200')])
        self.decoder.feed(PRIVATE_POINTER, RECEIVED, make_frame(HEADERS_FRAME, END_HEADERS, FIRST_STREAM, incoming))
        outgoing = Encoder().encode(request_headers())
        self.decoder.feed(PRIVATE_POINTER, SENT, HTTP2_PREFACE + make_frame(HEADERS_FRAME, END_HEADERS, FIRST_STREAM, outgoing))
        self.assertEqual(len(self.records), PAIR_COUNT)
        self.assert_private()

    def test_invalid_hpack_and_oversized_buffers_do_not_emit_private_errors(self):
        self.decoder.feed(PRIVATE_POINTER, SENT, HTTP2_PREFACE + make_frame(HEADERS_FRAME, END_HEADERS, FIRST_STREAM, b'\xff'))
        self.decoder.feed(OTHER_POINTER, SENT, PRIVATE_VALUE * LARGE_LENGTH)
        self.assertEqual(self.records, [])
        self.assertEqual(len(self.decoder.connections[OTHER_POINTER].directions[SENT].buffer), INITIAL_COUNT)
        self.assert_private()

    def test_unknown_protocol_and_chunked_http1_stop_without_guessing_body_events(self):
        self.decoder.feed(PRIVATE_POINTER, SENT, PRIVATE_VALUE + b'\r\n')
        self.assertEqual(self.records, [])
        chunked = b'POST ' + CONNECT_PATH + b' HTTP/1.1\r\nHost: ' + CONNECT_HOST
        chunked += b'\r\nTransfer-Encoding: chunked' + HEADER_END + PRIVATE_VALUE
        self.decoder.feed(OTHER_POINTER, SENT, chunked)
        self.assertEqual(len(self.records), SINGLE_COUNT)
        self.assertTrue(self.decoder.connections[OTHER_POINTER].directions[SENT].opaque)
        self.assert_private()

    def test_unknown_frame_payloads_are_never_exposed(self):
        self.decoder.feed(PRIVATE_POINTER, SENT, HTTP2_PREFACE + make_frame(DATA_FRAME, INITIAL_COUNT, FIRST_STREAM, PRIVATE_VALUE))
        self.assertEqual(self.records, [])

    def test_invalid_continuation_cannot_join_headers_from_another_stream(self):
        block = Encoder().encode(request_headers())
        outbound = HTTP2_PREFACE + make_frame(HEADERS_FRAME, INITIAL_COUNT, FIRST_STREAM, block[:SPLIT_OFFSET])
        outbound += make_frame(CONTINUATION_FRAME, END_HEADERS, OTHER_STREAM, block[SPLIT_OFFSET:])
        self.decoder.feed(PRIVATE_POINTER, SENT, outbound)
        self.assertEqual(self.records, [])

class CompletedTransferTests(unittest.TestCase):
    def test_actual_completed_length_limits_payload_and_failed_calls_do_not_read_memory(self):
        from spotify_native_trace import read_completed_payload, POINTER_BYTES
        actual_pointer = FIRST_STREAM
        buffer_pointer = OTHER_STREAM
        calls = []
        def read_memory(pointer, length):
            calls.append((pointer, length))
            return memoryview(SINGLE_COUNT.to_bytes(POINTER_BYTES, 'little') if pointer == actual_pointer else PRIVATE_VALUE[:length])
        self.assertIsNone(read_completed_payload(read_memory, False, len(PRIVATE_VALUE), actual_pointer, buffer_pointer))
        self.assertEqual(calls, [])
        self.assertEqual(read_completed_payload(read_memory, True, len(PRIVATE_VALUE), actual_pointer, buffer_pointer), PRIVATE_VALUE[:SINGLE_COUNT])
        self.assertEqual(calls[-SINGLE_COUNT], (buffer_pointer, SINGLE_COUNT))

    def test_impossible_or_oversized_completed_length_is_discarded_before_payload_read(self):
        from spotify_native_trace import read_completed_payload, POINTER_BYTES
        calls = []
        def read_memory(pointer, length):
            calls.append((pointer, length))
            return memoryview(LARGE_LENGTH.to_bytes(POINTER_BYTES, 'little'))
        self.assertIsNone(read_completed_payload(read_memory, True, LARGE_LENGTH, FIRST_STREAM, OTHER_STREAM))
        self.assertEqual(len(calls), SINGLE_COUNT)

class MissingTransferTests(unittest.TestCase):
    def test_a_missing_transfer_invalidates_its_direction_without_retaining_partial_data(self):
        records = []
        decoder = NativeTraceDecoder(records.append, Decoder)
        decoder.feed(PRIVATE_POINTER, SENT, HTTP2_PREFACE + make_frame(HEADERS_FRAME, INITIAL_COUNT, FIRST_STREAM, PRIVATE_VALUE))
        decoder.invalidate_direction(PRIVATE_POINTER, SENT)
        state = decoder.connections[PRIVATE_POINTER].directions[SENT]
        self.assertTrue(state.opaque)
        self.assertEqual(len(state.buffer), INITIAL_COUNT)
        self.assertEqual(len(state.header_block), INITIAL_COUNT)
        decoder.feed(PRIVATE_POINTER, SENT, PRIVATE_VALUE)
        self.assertEqual(records, [])


if __name__ == '__main__':
    unittest.main()
