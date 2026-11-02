const Modules = Object.freeze({ filesystem: 'node:fs', path: 'node:path' });
const Filesystem = require(Modules.filesystem);
const Path = require(Modules.path);
const Protocol = Object.freeze({
  discoveryAddress: 'http://127.0.0.1:9222/json/list',
  loopbackHostname: '127.0.0.1', debugPort: '9222', websocketScheme: 'ws:',
  pageType: 'page', pageMarker: 'xpui', enableNetwork: 'Network.enable',
  interruptSignal: 'SIGINT', openEvent: 'open', messageEvent: 'message', closeEvent: 'close', errorEvent: 'error',
  request: 'Network.requestWillBeSent', response: 'Network.responseReceived',
  socket: 'Network.webSocketCreated', sent: 'Network.webSocketFrameSent',
  received: 'Network.webSocketFrameReceived', closed: 'Network.webSocketClosed',
  detached: 'Inspector.detached', binaryOpcode: 2,
  methods: Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
});
const Limits = Object.freeze({ defaultDurationSeconds: 90, maximumDurationSeconds: 300,
  minimumDurationSeconds: 1, millisecondsPerSecond: 1000, maximumEvents: 10000,
  maximumPayloadCharacters: 1048576, connectionTimeoutMilliseconds: 5000,
  maximumDiscoveryBytes: 1048576, minimumStatus: 100, maximumStatus: 599,
  maximumOpcode: 15, initialIdentifier: 1, initialCount: 0, commandIdentifier: 1,
  initialArgumentsOffset: 2, maximumArguments: 2, fileMode: 0o600 });
const Labels = Object.freeze({ other: 'other', partner: 'partner', connect: 'connect', dealer: 'dealer',
  clientToken: 'client-token', request: 'request', response: 'response', socket: 'socket-open',
  sent: 'socket-sent', received: 'socket-received', closed: 'socket-closed', unknownMethod: 'OTHER',
  unknownEndpoint: 'unclassified', pathfinder: 'pathfinder-query', clientTokenExchange: 'client-token-exchange',
  connectDevice: 'connect-device', connectPlayer: 'connect-player-command', connectTransfer: 'connect-transfer',
  dealerSocket: 'dealer-socket', finished: 'duration-completed', eventLimit: 'event-limit',
  disconnected: 'debugger-disconnected', failed: 'capture-failed', interrupted: 'interrupted',
  usage: 'Usage: node tools/trace-spotify-desktop.cjs [duration-seconds] [output.jsonl]',
  defaultOutput: 'spotify-desktop-safe-trace.jsonl', schema: 'spotify-desktop-safe-trace-v1',
});
const Hostnames = Object.freeze({ partner: 'api-partner.spotify.com', clientToken: 'clienttoken.spotify.com',
  connectPattern: /(?:^|[-.])spclient\.spotify\.com$/, dealer: 'dealer.spotify.com', dealerSuffix: '.dealer.spotify.com' });
const EndpointPatterns = Object.freeze({ pathfinder: /^\/pathfinder\/v[12]\/query\/?$/,
  clientToken: /^\/v1\/clienttoken\/?$/, connectDevice: /^\/connect-state\/v1\/devices\/[^/]+\/?$/,
  connectPlayer: /^\/connect-state\/v1\/player\/command(?:\/from\/[^/]+\/to\/[^/]+)?\/?$/, connectTransfer: /^\/connect-state\/v1\/connect\/transfer\/?$/ });

function classifyEndpoint(address) {
  const fallback = { origin: Labels.other, endpoint: Labels.unknownEndpoint };
  try {
    const parsedAddress = new URL(address);
    const hostname = parsedAddress.hostname;
    if (hostname === Hostnames.partner) return { origin: Labels.partner,
      endpoint: EndpointPatterns.pathfinder.test(parsedAddress.pathname) ? Labels.pathfinder : Labels.unknownEndpoint };
    if (hostname === Hostnames.clientToken) return { origin: Labels.clientToken,
      endpoint: EndpointPatterns.clientToken.test(parsedAddress.pathname) ? Labels.clientTokenExchange : Labels.unknownEndpoint };
    if (hostname === Hostnames.dealer || hostname.endsWith(Hostnames.dealerSuffix)) {
      return { origin: Labels.dealer, endpoint: Labels.dealerSocket };
    }
    if (Hostnames.connectPattern.test(hostname)) {
      const endpoint = EndpointPatterns.connectDevice.test(parsedAddress.pathname) ? Labels.connectDevice
        : EndpointPatterns.connectPlayer.test(parsedAddress.pathname) ? Labels.connectPlayer
          : EndpointPatterns.connectTransfer.test(parsedAddress.pathname) ? Labels.connectTransfer : Labels.unknownEndpoint;
      return { origin: Labels.connect, endpoint };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

class NetworkTraceSanitizer {
  constructor(clock) {
    this.clock = clock;
    this.startedAtMilliseconds = clock();
    this.identifiers = new Map();
    this.nextIdentifier = Limits.initialIdentifier;
  }

  register(requestIdentifier, address) {
    if (typeof requestIdentifier !== 'string') return null;
    const existing = this.identifiers.get(requestIdentifier);
    if (existing) {
      Object.assign(existing, classifyEndpoint(address));
      return existing;
    }
    if (this.identifiers.size >= Limits.maximumEvents) return null;
    const entry = { identifier: this.nextIdentifier, ...classifyEndpoint(address) };
    this.nextIdentifier += Limits.initialIdentifier;
    this.identifiers.set(requestIdentifier, entry);
    return entry;
  }

  sanitize(event) {
    const parameters = event?.params;
    if (!parameters || typeof parameters !== 'object') return null;
    const kind = event.method;
    const isRequest = kind === Protocol.request;
    const isSocket = kind === Protocol.socket;
    const entry = isRequest || isSocket
      ? this.register(parameters.requestId, isRequest ? parameters.request?.url : parameters.url)
      : this.identifiers.get(parameters.requestId);
    if (!entry) return null;
    const record = { elapsedMilliseconds: Math.max(Limits.initialCount, this.clock() - this.startedAtMilliseconds), ...entry };
    if (isRequest) return { ...record, event: Labels.request,
      method: Protocol.methods.includes(parameters.request?.method) ? parameters.request.method : Labels.unknownMethod };
    if (isSocket) return { ...record, event: Labels.socket };
    if (kind === Protocol.response) {
      const status = parameters.response?.status;
      return Number.isInteger(status) && status >= Limits.minimumStatus && status <= Limits.maximumStatus
        ? { ...record, event: Labels.response, status } : null;
    }
    if (kind === Protocol.closed) return { ...record, event: Labels.closed };
    if (kind !== Protocol.sent && kind !== Protocol.received) return null;
    const frame = parameters.response;
    if (!Number.isInteger(frame?.opcode) || frame.opcode < Limits.initialCount || frame.opcode > Limits.maximumOpcode
      || typeof frame.payloadData !== 'string' || frame.payloadData.length > Limits.maximumPayloadCharacters) return null;
    const byteCount = frame.opcode === Protocol.binaryOpcode
      ? Buffer.from(frame.payloadData, 'base64').byteLength : Buffer.byteLength(frame.payloadData);
    return { ...record, event: kind === Protocol.sent ? Labels.sent : Labels.received, opcode: frame.opcode, byteCount };
  }
}

function validateDebuggerAddress(address) {
  try {
    const parsedAddress = new URL(address);
    return parsedAddress.protocol === Protocol.websocketScheme && parsedAddress.hostname === Protocol.loopbackHostname
      && parsedAddress.port === Protocol.debugPort && !parsedAddress.username && !parsedAddress.password;
  } catch {
    return false;
  }
}

function parseArguments(argumentsList) {
  const durationSeconds = argumentsList.length ? Number(argumentsList[Limits.initialCount]) : Limits.defaultDurationSeconds;
  if (argumentsList.length > Limits.maximumArguments || !Number.isInteger(durationSeconds)
    || durationSeconds < Limits.minimumDurationSeconds || durationSeconds > Limits.maximumDurationSeconds) throw new Error(Labels.usage);
  return { durationSeconds, outputPath: Path.resolve(argumentsList[Limits.initialIdentifier] || Labels.defaultOutput) };
}

async function capture(configuration, dependencies) {
  const discoveryResponse = await dependencies.fetch(Protocol.discoveryAddress,
    { signal: AbortSignal.timeout(Limits.connectionTimeoutMilliseconds) });
  if (!discoveryResponse.ok) throw new Error(Labels.failed);
  const discoveryText = await discoveryResponse.text();
  if (Buffer.byteLength(discoveryText) > Limits.maximumDiscoveryBytes) throw new Error(Labels.failed);
  const targets = JSON.parse(discoveryText);
  const target = Array.isArray(targets) && targets.find(candidate => candidate.type === Protocol.pageType
    && typeof candidate.url === 'string' && candidate.url.includes(Protocol.pageMarker)
    && validateDebuggerAddress(candidate.webSocketDebuggerUrl));
  if (!target) throw new Error(Labels.failed);
  const sanitizer = new NetworkTraceSanitizer(dependencies.clock);
  return new Promise(resolve => {
    let eventCount = Limits.initialCount;
    let completed = false;
    const socket = new dependencies.WebSocket(target.webSocketDebuggerUrl);
    let durationTimer;
    const connectionTimer = dependencies.schedule(() => finish(Labels.failed), Limits.connectionTimeoutMilliseconds);
    function finish(reason) {
      if (completed) return;
      completed = true;
      dependencies.cancel(connectionTimer);
      dependencies.cancel(durationTimer);
      dependencies.interruptions.removeListener(Protocol.interruptSignal, interrupt);
      socket.close();
      resolve({ schema: Labels.schema, eventCount, reason });
    }
    function interrupt() { finish(Labels.interrupted); }
    dependencies.interruptions.once(Protocol.interruptSignal, interrupt);
    socket.addEventListener(Protocol.openEvent, () => {
      if (completed) return;
      dependencies.cancel(connectionTimer);
      socket.send(JSON.stringify({ id: Limits.commandIdentifier, method: Protocol.enableNetwork }));
      durationTimer = dependencies.schedule(() => finish(Labels.finished), configuration.durationSeconds * Limits.millisecondsPerSecond);
    });
    socket.addEventListener(Protocol.messageEvent, message => {
      if (completed || typeof message.data !== 'string') return;
      try {
        const event = JSON.parse(message.data);
        if (event.id === Limits.commandIdentifier && event.error) return finish(Labels.failed);
        if (event.method === Protocol.detached) return finish(Labels.disconnected);
        const record = sanitizer.sanitize(event);
        if (!record) return;
        dependencies.write(record);
        eventCount += Limits.initialIdentifier;
        if (eventCount >= Limits.maximumEvents) finish(Labels.eventLimit);
      } catch {
        finish(Labels.failed);
      }
    });
    socket.addEventListener(Protocol.closeEvent, () => finish(Labels.disconnected));
    socket.addEventListener(Protocol.errorEvent, () => finish(Labels.failed));
  });
}

async function main() {
  const configuration = parseArguments(process.argv.slice(Limits.initialArgumentsOffset));
  const descriptor = Filesystem.openSync(configuration.outputPath, 'wx', Limits.fileMode);
  try {
    const summary = await capture(configuration, { fetch, WebSocket, clock: Date.now, interruptions: process, schedule: setTimeout, cancel: clearTimeout,
      write: record => Filesystem.writeSync(descriptor, JSON.stringify(record) + '\n') });
    process.stdout.write(JSON.stringify({ ...summary, outputPath: configuration.outputPath }) + '\n');
    if (summary.reason !== Labels.finished && summary.reason !== Labels.interrupted) process.exitCode = Limits.initialIdentifier;
  } finally {
    Filesystem.closeSync(descriptor);
  }
}

module.exports = { Protocol, Limits, Labels, classifyEndpoint, NetworkTraceSanitizer,
  validateDebuggerAddress, parseArguments, capture };
if (require.main === module) main().catch(() => {
  process.stderr.write(Labels.failed + '\n');
  process.exitCode = Limits.initialIdentifier;
});
