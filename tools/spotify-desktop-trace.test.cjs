const Modules = Object.freeze({ test: 'node:test', assertion: 'node:assert/strict', events: 'node:events',
  implementation: './trace-spotify-desktop.cjs' });
const test = require(Modules.test);
const assertion = require(Modules.assertion);
const { EventEmitter } = require(Modules.events);
const { Protocol, Limits, Labels, classifyEndpoint, NetworkTraceSanitizer, validateDebuggerAddress,
  parseArguments, capture } = require(Modules.implementation);
const Fixture = Object.freeze({ privateValue: 'PRIVATE_ACCOUNT_TRACK_TOKEN', requestIdentifier: 'PRIVATE_REQUEST',
  fixedTimeMilliseconds: 1000, elapsedMilliseconds: 17, successStatus: 200, textOpcode: 1, binaryOpcode: 2,
  invalidOpcode: 20, one: 1, zero: 0, shortDurationSeconds: 2, binaryPayload: 'YWJj', binaryBytes: 3,
  partner: 'https://api-partner.spotify.com/pathfinder/v2/query',
  connect: 'https://guc-spclient.spotify.com/connect-state/v1/devices/',
  connectCommand: 'https://guc-spclient.spotify.com/connect-state/v1/player/command/from/',
  clientToken: 'https://clienttoken.spotify.com/v1/clienttoken', dealer: 'wss://guc.dealer.spotify.com/',
  unknown: 'https://private.invalid/', debuggerAddress: 'ws://127.0.0.1:9222/devtools/page/private',
  privateOutput: 'private-output.jsonl', invalidDuration: '1.2', externalDebugger: 'ws://external.invalid:9222/',
  zeroDuration: '0', page: 'https://xpui.app.spotify.com/index.html', newline: '\n' });
function request(address = Fixture.partner) {
  return { method: Protocol.request, params: { requestId: Fixture.requestIdentifier,
    request: { url: address + '?token=' + Fixture.privateValue, method: 'POST',
      headers: { Authorization: Fixture.privateValue }, postData: Fixture.privateValue } } };
}
function sanitizer() { return new NetworkTraceSanitizer(() => Fixture.fixedTimeMilliseconds); }
function assertPrivate(output) {
  assertion.equal(JSON.stringify(output).includes(Fixture.privateValue), false);
  assertion.equal(JSON.stringify(output).includes(Fixture.requestIdentifier), false);
}
test('Known endpoints become fixed origin and operation labels without URL fields', () => {
  const cases = [[Fixture.partner, Labels.partner, Labels.pathfinder],
    [Fixture.connect + Fixture.privateValue, Labels.connect, Labels.connectDevice],
    [Fixture.clientToken, Labels.clientToken, Labels.clientTokenExchange],
    [Fixture.connectCommand + Fixture.privateValue + '/to/' + Fixture.privateValue, Labels.connect, Labels.connectPlayer],
    [Fixture.dealer + Fixture.privateValue, Labels.dealer, Labels.dealerSocket],
    [Fixture.unknown + Fixture.privateValue, Labels.other, Labels.unknownEndpoint],
    [Fixture.partner + '/' + Fixture.privateValue, Labels.partner, Labels.unknownEndpoint]];
  for (const [address, origin, endpoint] of cases) {
    assertion.deepEqual(classifyEndpoint(address), { origin, endpoint });
    assertPrivate(classifyEndpoint(address));
  }
  assertion.deepEqual(classifyEndpoint(Fixture.privateValue), { origin: Labels.other, endpoint: Labels.unknownEndpoint });
});
test('Request and response mapping omits body headers query identifiers and response URL', () => {
  let elapsed = Fixture.zero;
  const current = new NetworkTraceSanitizer(() => Fixture.fixedTimeMilliseconds + elapsed);
  const outgoing = current.sanitize(request());
  elapsed = Fixture.elapsedMilliseconds;
  const incoming = current.sanitize({ method: Protocol.response, params: { requestId: Fixture.requestIdentifier,
    response: { status: Fixture.successStatus, url: Fixture.privateValue, headers: { private: Fixture.privateValue } } } });
  assertion.deepEqual(Object.keys(outgoing).sort(), ['elapsedMilliseconds', 'endpoint', 'event', 'identifier', 'method', 'origin']);
  assertion.equal(outgoing.identifier, incoming.identifier);
  assertion.equal(incoming.elapsedMilliseconds, Fixture.elapsedMilliseconds);
  assertion.equal(incoming.status, Fixture.successStatus);
  assertPrivate([outgoing, incoming]);
});
test('Unknown methods and redirect destinations cannot leak arbitrary strings', () => {
  const current = sanitizer();
  const event = request();
  event.params.request.method = Fixture.privateValue;
  assertion.equal(current.sanitize(event).method, Labels.unknownMethod);
  const redirect = current.sanitize(request(Fixture.unknown + Fixture.privateValue));
  assertion.equal(redirect.identifier, Fixture.one);
  assertion.equal(redirect.origin, Labels.other);
  assertPrivate(redirect);
});
test('WebSocket frames retain direction opcode byte count and no payload or message kind', () => {
  const current = sanitizer();
  const opened = current.sanitize({ method: Protocol.socket,
    params: { requestId: Fixture.requestIdentifier, url: Fixture.dealer + Fixture.privateValue } });
  const outgoing = current.sanitize({ method: Protocol.sent, params: { requestId: Fixture.requestIdentifier,
    response: { opcode: Fixture.textOpcode, payloadData: Fixture.privateValue, mask: true } } });
  const incoming = current.sanitize({ method: Protocol.received, params: { requestId: Fixture.requestIdentifier,
    response: { opcode: Fixture.binaryOpcode, payloadData: Fixture.binaryPayload } } });
  assertion.equal(outgoing.event, Labels.sent);
  assertion.equal(incoming.event, Labels.received);
  assertion.equal(outgoing.byteCount, Buffer.byteLength(Fixture.privateValue));
  assertion.equal(incoming.byteCount, Fixture.binaryBytes);
  assertion.equal(opened.identifier, outgoing.identifier);
  assertPrivate([opened, outgoing, incoming]);
});
test('Malformed unknown or oversized frames and unregistered responses are dropped', () => {
  const current = sanitizer();
  assertion.equal(current.sanitize(null), null);
  assertion.equal(current.sanitize({ method: Protocol.response, params: { requestId: Fixture.requestIdentifier,
    response: { status: Fixture.successStatus } } }), null);
  current.sanitize(request());
  for (const response of [{ opcode: Fixture.invalidOpcode, payloadData: Fixture.privateValue },
    { opcode: Fixture.textOpcode, payloadData: Fixture.privateValue.repeat(Limits.maximumPayloadCharacters) },
    { opcode: Fixture.textOpcode }]) {
    assertion.equal(current.sanitize({ method: Protocol.sent,
      params: { requestId: Fixture.requestIdentifier, response } }), null);
  }
  assertion.equal(current.sanitize({ method: Fixture.privateValue, params: { requestId: Fixture.requestIdentifier } }), null);
});
test('Capture addresses remain fixed loopback and durations stay bounded', () => {
  assertion.equal(validateDebuggerAddress(Fixture.debuggerAddress), true);
  assertion.equal(validateDebuggerAddress(Fixture.externalDebugger), false);
  assertion.equal(validateDebuggerAddress(Fixture.privateValue), false);
  assertion.equal(parseArguments([]).durationSeconds, Limits.defaultDurationSeconds);
  for (const duration of [Fixture.invalidDuration, Fixture.zeroDuration, String(Limits.maximumDurationSeconds + Fixture.one)]) {
    assertion.throws(() => parseArguments([duration]));
  }
});
function captureFixture() {
  const records = [];
  const scheduled = [];
  const interruptions = new EventEmitter();
  let socket;
  class FakeSocket extends EventEmitter {
    constructor() { super(); socket = this; }
    addEventListener(kind, handler) { this.on(kind, handler); }
    send(message) { this.command = JSON.parse(message); }
    close() { this.closed = true; }
  }
  const dependencies = { clock: () => Fixture.fixedTimeMilliseconds, WebSocket: FakeSocket, interruptions,
    fetch: async () => ({ ok: true, text: async () => JSON.stringify([{ type: Protocol.pageType,
      url: Fixture.page, webSocketDebuggerUrl: Fixture.debuggerAddress }]) }),
    schedule: callback => { scheduled.push(callback); return callback; }, cancel: () => {},
    write: record => records.push(record) };
  return { dependencies, records, scheduled, get socket() { return socket; } };
}
test('Bounded capture enables events without requests or bodies and closes after deadline', async () => {
  const current = captureFixture();
  const pending = capture({ durationSeconds: Fixture.shortDurationSeconds }, current.dependencies);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  current.socket.emit('open');
  assertion.deepEqual(current.socket.command, { id: Limits.commandIdentifier, method: Protocol.enableNetwork });
  current.socket.emit('message', { data: JSON.stringify(request()) });
  current.scheduled.at(-Fixture.one)();
  const result = await pending;
  assertion.equal(result.reason, Labels.finished);
  assertion.equal(result.eventCount, Fixture.one);
  assertion.equal(current.socket.closed, true);
  assertion.equal(current.dependencies.interruptions.listenerCount('SIGINT'), Fixture.zero);
  assertPrivate(current.records);
});
test('Interrupt and malformed messages terminate without persisting sensitive errors', async () => {
  for (const interrupted of [true, false]) {
    const current = captureFixture();
    const pending = capture({ durationSeconds: Fixture.shortDurationSeconds }, current.dependencies);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    current.socket.emit('open');
    if (interrupted) current.dependencies.interruptions.emit('SIGINT');
    else current.socket.emit('message', { data: Fixture.privateValue });
    const result = await pending;
    assertion.equal(result.reason, interrupted ? Labels.interrupted : Labels.failed);
    assertion.equal(result.eventCount, Fixture.zero);
    assertPrivate(result);
  }
});
test('Rejected Network enable fails without persisting debugger error details', async () => {
  const current = captureFixture();
  const pending = capture({ durationSeconds: Fixture.shortDurationSeconds }, current.dependencies);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  current.socket.emit(Protocol.openEvent);
  current.socket.emit(Protocol.messageEvent, { data: JSON.stringify({ id: Limits.commandIdentifier,
    error: { message: Fixture.privateValue } }) });
  const result = await pending;
  assertion.equal(result.reason, Labels.failed);
  assertion.equal(result.eventCount, Fixture.zero);
  assertPrivate(result);
});
test('Request identifiers stay local sequential integers with a bounded lookup map', () => {
  const current = sanitizer();
  for (let requestNumber = Fixture.zero; requestNumber < Limits.maximumEvents; requestNumber += Fixture.one) {
    const event = request();
    event.params.requestId = Fixture.privateValue + requestNumber;
    assertion.equal(current.sanitize(event).identifier, requestNumber + Fixture.one);
  }
  assertion.equal(current.sanitize(request()), null);
  assertion.equal(current.identifiers.size, Limits.maximumEvents);
});
