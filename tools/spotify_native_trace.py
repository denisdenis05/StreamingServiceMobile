import collections
import re
import urllib.parse

MAXIMUM_CONNECTIONS = 256
MAXIMUM_BUFFER_BYTES = 65536
MAXIMUM_HEADER_BYTES = 32768
MAXIMUM_BODY_BYTES = 104857600
MAXIMUM_PENDING_REQUESTS = 1024
MAXIMUM_FRAME_BYTES = 65536
MAXIMUM_HEADER_TABLE_BYTES = 16384
INITIAL_IDENTIFIER = 1
INITIAL_COUNT = 0
HTTP_HEADER_END = b'\r\n\r\n'
HTTP_LINE_END = b'\r\n'
HTTP2_PREFACE = b'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
HTTP2_HEADER_BYTES = 9
HTTP2_HEADERS = 1
HTTP2_CONTINUATION = 9
HTTP2_PUSH_PROMISE = 5
HTTP2_END_HEADERS = 4
HTTP2_PADDED = 8
HTTP2_PRIORITY = 32
HTTP2_PRIORITY_BYTES = 5
HTTP2_STREAM_MASK = 0x7fffffff
HTTP2_LENGTH_BYTES = 3
HTTP2_TYPE_INDEX = 3
HTTP2_FLAGS_INDEX = 4
HTTP2_STREAM_OFFSET = 5
HTTP2_PADDING_BYTES = 1
HTTP_MINIMUM_STATUS = 100
HTTP_MAXIMUM_STATUS = 599
HTTP_SWITCHING_PROTOCOLS = 101
HTTP_BODYLESS_STATUSES = frozenset((100, 101, 102, 103, 204, 304))
METHODS = frozenset(('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT'))
HTTP1_REQUEST = re.compile(rb'^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT) ([^ ]+) HTTP/1\.[01]$')
HTTP1_RESPONSE = re.compile(rb'^HTTP/1\.[01] ([1-5][0-9][0-9])(?: |$)')
CONNECT_HOST = re.compile(r'(?:^|[-.])spclient\.spotify\.com$')
CONNECT_DEVICE = re.compile(r'^/connect-state/v1/devices/[^/]+/?$')
CONNECT_COMMAND = re.compile(r'^/connect-state/v1/player/command(?:/from/[^/]+/to/[^/]+)?/?$')
PARTNER_QUERY = re.compile(r'^/pathfinder/v[12]/query/?$')
ORIGIN_OTHER = 'other'
ORIGIN_PARTNER = 'partner'
ORIGIN_CLIENT_TOKEN = 'client-token'
ORIGIN_DEALER = 'dealer'
ORIGIN_CONNECT = 'connect'
ENDPOINT_UNKNOWN = 'unclassified'
ENDPOINT_PARTNER = 'pathfinder-query'
ENDPOINT_CLIENT_TOKEN = 'client-token-exchange'
ENDPOINT_DEALER = 'dealer-socket'
ENDPOINT_DEVICE = 'connect-device'
ENDPOINT_COMMAND = 'connect-player-command'
ENDPOINT_TRANSFER = 'connect-transfer'
HOST_PARTNER = 'api-partner.spotify.com'
HOST_CLIENT_TOKEN = 'clienttoken.spotify.com'
HOST_DEALER = 'dealer.spotify.com'
HOST_DEALER_SUFFIX = '.dealer.spotify.com'
CLIENT_TOKEN_PATH = '/v1/clienttoken'
CONNECT_TRANSFER_PATH = '/connect-state/v1/connect/transfer'
HEADER_METHOD = b':method'
HEADER_PATH = b':path'
HEADER_AUTHORITY = b':authority'
HEADER_STATUS = b':status'
HEADER_HOST = b'host'
HEADER_LENGTH = b'content-length'
HEADER_TRANSFER = b'transfer-encoding'
UNKNOWN = {'origin': ORIGIN_OTHER, 'endpoint': ENDPOINT_UNKNOWN}
POINTER_BYTES = 8
EMPTY_LENGTH = b'0'
CHARACTER_ENCODING = 'ascii'
DECODE_ERRORS = 'ignore'
BYTE_ORDER = 'big'
SENT = 'sent'
RECEIVED = 'received'
HTTP1 = 'http1'
HTTP2 = 'http2'
OPAQUE = 'opaque'
REQUEST = 'request'
RESPONSE = 'response'


def classify_endpoint(host, target):
    try:
        parsed_target = urllib.parse.urlsplit(target)
        hostname = (parsed_target.hostname or host.split(':', INITIAL_IDENTIFIER)[INITIAL_COUNT]).lower()
        path = parsed_target.path
        if hostname == HOST_PARTNER:
            return {'origin': ORIGIN_PARTNER, 'endpoint': ENDPOINT_PARTNER if PARTNER_QUERY.fullmatch(path) else ENDPOINT_UNKNOWN}
        if hostname == HOST_CLIENT_TOKEN:
            return {'origin': ORIGIN_CLIENT_TOKEN, 'endpoint': ENDPOINT_CLIENT_TOKEN if path.rstrip('/') == CLIENT_TOKEN_PATH else ENDPOINT_UNKNOWN}
        if hostname == HOST_DEALER or hostname.endswith(HOST_DEALER_SUFFIX):
            return {'origin': ORIGIN_DEALER, 'endpoint': ENDPOINT_DEALER}
        if CONNECT_HOST.search(hostname):
            endpoint = ENDPOINT_UNKNOWN
            if CONNECT_DEVICE.fullmatch(path):
                endpoint = ENDPOINT_DEVICE
            elif CONNECT_COMMAND.fullmatch(path):
                endpoint = ENDPOINT_COMMAND
            elif path.rstrip('/') == CONNECT_TRANSFER_PATH:
                endpoint = ENDPOINT_TRANSFER
            return {'origin': ORIGIN_CONNECT, 'endpoint': endpoint}
    except (ValueError, UnicodeError):
        pass
    return dict(UNKNOWN)


def project_headers(headers):
    selected = {}
    accepted = frozenset((HEADER_METHOD, HEADER_PATH, HEADER_AUTHORITY, HEADER_STATUS, HEADER_HOST))
    for name, value in headers:
        lowered_name = name.lower()
        if lowered_name in accepted:
            selected[lowered_name] = value
    if HEADER_STATUS in selected:
        status = selected[HEADER_STATUS]
        if len(status) == HTTP2_LENGTH_BYTES and status.isdigit():
            status_number = int(status)
            if HTTP_MINIMUM_STATUS <= status_number <= HTTP_MAXIMUM_STATUS:
                return {'event': RESPONSE, 'status': status_number}
        return None
    method = selected.get(HEADER_METHOD, b'').decode(CHARACTER_ENCODING, DECODE_ERRORS)
    if method not in METHODS:
        return None
    host = selected.get(HEADER_AUTHORITY, selected.get(HEADER_HOST, b'')).decode(CHARACTER_ENCODING, DECODE_ERRORS)
    path = selected.get(HEADER_PATH, b'').decode(CHARACTER_ENCODING, DECODE_ERRORS)
    return {'event': REQUEST, 'method': method, **classify_endpoint(host, path)}


class DirectionDecoder:
    def __init__(self, header_decoder_factory):
        self.buffer = bytearray()
        self.body_remaining = INITIAL_COUNT
        self.opaque = False
        self.header_block = bytearray()
        self.header_stream = None
        self.header_decoder = header_decoder_factory()


class ConnectionDecoder:
    def __init__(self, identifier, emit, header_decoder_factory):
        self.identifier = identifier
        self.emit = emit
        self.mode = None
        self.directions = {SENT: DirectionDecoder(header_decoder_factory), RECEIVED: DirectionDecoder(header_decoder_factory)}
        self.pending_requests = collections.deque()
        self.stream_requests = {}

    def publish(self, direction, record, stream=None):
        if record is None:
            return
        if record['event'] == REQUEST:
            safe_destination = {name: record[name] for name in ('origin', 'endpoint')}
            if stream is None and len(self.pending_requests) < MAXIMUM_PENDING_REQUESTS:
                self.pending_requests.append(safe_destination)
            elif stream is not None and len(self.stream_requests) < MAXIMUM_PENDING_REQUESTS:
                self.stream_requests[stream] = safe_destination
        elif record['event'] == RESPONSE:
            destination = self.stream_requests.pop(stream, dict(UNKNOWN)) if stream is not None else (
                self.pending_requests.popleft() if self.pending_requests else dict(UNKNOWN))
            record.update(destination)
        self.emit({'connection': self.identifier, 'direction': direction, 'protocol': self.mode, **record})

    def feed(self, direction, payload):
        state = self.directions[direction]
        if state.opaque:
            return
        if len(state.buffer) + len(payload) > MAXIMUM_BUFFER_BYTES:
            state.opaque = True
            state.buffer.clear()
            return
        state.buffer.extend(payload)
        if self.mode is None:
            outgoing = bytes(self.directions[SENT].buffer)
            if outgoing.startswith(HTTP2_PREFACE):
                self.mode = HTTP2
                del self.directions[SENT].buffer[:len(HTTP2_PREFACE)]
            elif HTTP2_PREFACE.startswith(outgoing):
                return
            elif HTTP_LINE_END in outgoing:
                self.mode = HTTP1 if HTTP1_REQUEST.match(outgoing.split(HTTP_LINE_END, INITIAL_IDENTIFIER)[INITIAL_COUNT]) else OPAQUE
            else:
                return
            for current_direction in (SENT, RECEIVED):
                self.process(current_direction)
        else:
            self.process(direction)

    def process(self, direction):
        state = self.directions[direction]
        if state.opaque:
            return
        if self.mode == HTTP1:
            self.process_http1(direction, state)
        elif self.mode == HTTP2:
            self.process_http2(direction, state)
        else:
            state.buffer.clear()
            state.opaque = True

    def process_http1(self, direction, state):
        while state.buffer:
            if state.body_remaining:
                skipped = min(state.body_remaining, len(state.buffer))
                del state.buffer[:skipped]
                state.body_remaining -= skipped
                continue
            boundary = state.buffer.find(HTTP_HEADER_END)
            if boundary < INITIAL_COUNT:
                if len(state.buffer) > MAXIMUM_HEADER_BYTES:
                    state.buffer.clear()
                    state.opaque = True
                return
            if boundary > MAXIMUM_HEADER_BYTES:
                state.buffer.clear()
                state.opaque = True
                return
            lines = bytes(state.buffer[:boundary]).split(HTTP_LINE_END)
            del state.buffer[:boundary + len(HTTP_HEADER_END)]
            headers = {}
            for line in lines[INITIAL_IDENTIFIER:]:
                name, separator, value = line.partition(b':')
                if separator and name.lower() in (HEADER_HOST, HEADER_LENGTH, HEADER_TRANSFER):
                    headers[name.lower()] = value.strip()
            outgoing = HTTP1_REQUEST.match(lines[INITIAL_COUNT])
            incoming = HTTP1_RESPONSE.match(lines[INITIAL_COUNT])
            if outgoing:
                method = outgoing.group(INITIAL_IDENTIFIER)
                target = outgoing.group(INITIAL_IDENTIFIER + INITIAL_IDENTIFIER)
                self.publish(direction, project_headers([(HEADER_METHOD, method), (HEADER_PATH, target),
                    (HEADER_AUTHORITY, headers.get(HEADER_HOST, b''))]))
            elif incoming:
                status = int(incoming.group(INITIAL_IDENTIFIER))
                self.publish(direction, {'event': RESPONSE, 'status': status})
                if status == HTTP_SWITCHING_PROTOCOLS:
                    state.opaque = True
            else:
                state.opaque = True
            if incoming and HEADER_LENGTH not in headers and status not in HTTP_BODYLESS_STATUSES:
                state.opaque = True
            length = headers.get(HEADER_LENGTH, EMPTY_LENGTH)
            if not length.isdigit() or int(length) > MAXIMUM_BODY_BYTES or HEADER_TRANSFER in headers:
                state.opaque = True
            else:
                state.body_remaining = int(length)
            if state.opaque:
                state.buffer.clear()
                return

    def process_http2(self, direction, state):
        while len(state.buffer) >= HTTP2_HEADER_BYTES:
            length = int.from_bytes(state.buffer[:HTTP2_LENGTH_BYTES], BYTE_ORDER)
            if length > MAXIMUM_FRAME_BYTES:
                state.buffer.clear()
                state.opaque = True
                return
            total = HTTP2_HEADER_BYTES + length
            if len(state.buffer) < total:
                return
            frame_type = state.buffer[HTTP2_TYPE_INDEX]
            flags = state.buffer[HTTP2_FLAGS_INDEX]
            stream = int.from_bytes(state.buffer[HTTP2_STREAM_OFFSET:HTTP2_HEADER_BYTES], BYTE_ORDER) & HTTP2_STREAM_MASK
            payload = bytes(state.buffer[HTTP2_HEADER_BYTES:total])
            del state.buffer[:total]
            if frame_type == HTTP2_PUSH_PROMISE:
                state.opaque = True
                state.buffer.clear()
                return
            if frame_type not in (HTTP2_HEADERS, HTTP2_CONTINUATION):
                continue
            if frame_type == HTTP2_HEADERS:
                if state.header_stream is not None:
                    state.opaque = True
                    return
                state.header_stream = stream
                if flags & HTTP2_PADDED:
                    if not payload or payload[INITIAL_COUNT] >= len(payload):
                        state.opaque = True
                        return
                    padding = payload[INITIAL_COUNT]
                    payload = payload[HTTP2_PADDING_BYTES:len(payload) - padding]
                if flags & HTTP2_PRIORITY:
                    if len(payload) < HTTP2_PRIORITY_BYTES:
                        state.opaque = True
                        return
                    payload = payload[HTTP2_PRIORITY_BYTES:]
            elif state.header_stream != stream:
                state.opaque = True
                return
            state.header_block.extend(payload)
            if len(state.header_block) > MAXIMUM_HEADER_BYTES:
                state.opaque = True
                state.header_block.clear()
                return
            if flags & HTTP2_END_HEADERS:
                try:
                    projected = project_headers(state.header_decoder.decode(bytes(state.header_block), raw=True))
                except Exception:
                    state.opaque = True
                    projected = None
                state.header_block.clear()
                state.header_stream = None
                self.publish(direction, projected, stream)


class NativeTraceDecoder:
    def __init__(self, emit, header_decoder_factory):
        self.emit = emit
        self.header_decoder_factory = header_decoder_factory
        self.connections = {}
        self.next_identifier = INITIAL_IDENTIFIER

    def invalidate_direction(self, connection_pointer, direction):
        connection = self.connections.get(connection_pointer)
        if connection is not None:
            state = connection.directions[direction]
            state.buffer.clear()
            state.header_block.clear()
            state.opaque = True

    def feed(self, connection_pointer, direction, payload):
        if direction not in (SENT, RECEIVED):
            return
        connection = self.connections.get(connection_pointer)
        if connection is None:
            if len(self.connections) >= MAXIMUM_CONNECTIONS:
                return
            connection = ConnectionDecoder(self.next_identifier, self.emit, self.header_decoder_factory)
            self.next_identifier += INITIAL_IDENTIFIER
            self.connections[connection_pointer] = connection
        connection.feed(direction, payload)


def read_completed_payload(read_memory, successful_return, requested_bytes, actual_bytes_pointer, buffer_pointer):
    if not successful_return or requested_bytes <= INITIAL_COUNT:
        return None
    actual_bytes = int.from_bytes(read_memory(actual_bytes_pointer, POINTER_BYTES).tobytes(), 'little')
    if not INITIAL_COUNT < actual_bytes <= min(requested_bytes, MAXIMUM_BUFFER_BYTES):
        return None
    return read_memory(buffer_pointer, actual_bytes).tobytes()
