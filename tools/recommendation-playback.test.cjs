const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  RecommendationPlaybackController,
  RecommendationPlaybackPolicy,
} = require('../.build/recommendations/recommendations/RecommendationPlaybackController');
const {
  RecommendationModes,
} = require('../.build/recommendations/recommendations/RecommendationContracts');
const Policy = Object.freeze({
  owner: 'owner',
  otherOwner: 'other-owner',
  queue: 'queue',
  otherQueue: 'other-queue',
  cursor: 'cursor',
  nextCursor: 'next-cursor',
  seed: 'seed',
  next: 'next',
  manual: 'manual',
  initialTime: 0,
});
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function recording(identifier) {
  return {
    id: identifier,
    title: identifier,
    artistName: 'fixture artist',
    releaseTitle: 'fixture album',
  };
}
function page(identifiers = [Policy.seed], cursor = Policy.cursor) {
  return {
    tracks: identifiers.map(recording),
    continuationToken: cursor,
    mode: RecommendationModes.songRadio,
    explanation: '',
    featureGeneration: 'generation',
  };
}
function fixture(storage) {
  const listeners = new Set();
  const requests = [];
  const appends = [];
  let queue = {
    account: Policy.owner,
    queueIdentifier: Policy.queue,
    entryIdentifiers: [],
    recordingIdentifiers: [],
    currentIndex: 0,
  };
  let replacement = null;
  let appendWait = null;
  let time = Policy.initialTime;
  const controller = new RecommendationPlaybackController({
    ...(storage ? { storage } : {}),
    snapshot: () => queue,
    replace: async (tracks, index, current) => {
      if (replacement) await replacement.promise;
      if (!current()) return false;
      queue = {
        ...queue,
        entryIdentifiers: tracks.map(track => track.id),
        recordingIdentifiers: tracks.map(track => track.id),
        currentIndex: index,
      };
      return true;
    },
    append: async (tracks, current) => {
      if (appendWait) await appendWait.promise;
      if (!current()) throw new Error('superseded');
      appends.push(...tracks);
      queue = {
        ...queue,
        entryIdentifiers: [
          ...queue.entryIdentifiers,
          ...tracks.map(track => track.id),
        ],
        recordingIdentifiers: [
          ...queue.recordingIdentifiers,
          ...tracks.map(track => track.id),
        ],
      };
    },
    generate: (request, signal) => {
      const pending = deferred();
      requests.push({ request, signal, ...pending });
      return pending.promise;
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    now: () => time,
  });
  return {
    controller,
    requests,
    appends,
    snapshot: () => queue,
    change(values) {
      queue = { ...queue, ...values };
      for (const listener of listeners) listener();
    },
    replaceWait(value) {
      replacement = value;
    },
    appendWait(value) {
      appendWait = value;
    },
    advance() {
      time += RecommendationPlaybackPolicy.retryDelayMilliseconds;
    },
    listeners,
  };
}
async function started(value, firstPage = page()) {
  const operation = value.controller.start(
    { mode: RecommendationModes.songRadio },
    firstPage,
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return operation;
}
async function flush() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve();
}

test('prefetch excludes queued and previously delivered recordings and removes duplicates', async () => {
  const value = fixture();
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  assert.equal(value.requests.length, 1);
  assert.deepEqual(value.requests[0].request.exclude, [Policy.seed]);
  value.requests[0].resolve(
    page([Policy.seed, Policy.next, Policy.next], null),
  );
  await playing;
  assert.deepEqual(
    value.appends.map(track => track.id),
    [Policy.next],
  );
  assert.equal(value.controller.getSnapshot().active, false);
  assert.equal(value.controller.ownsCurrentQueue(), true);
});

test('manual queue replacement aborts pending continuation and rejects late response', async () => {
  const value = fixture();
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  value.change({ queueIdentifier: Policy.otherQueue });
  assert.equal(value.requests[0].signal.aborted, true);
  value.requests[0].resolve(page([Policy.next], null));
  await playing;
  assert.deepEqual(value.appends, []);
  assert.equal(value.controller.getSnapshot().active, false);
});

test('manual edits during HTTP preserve queue and leave the cursor available for retry', async () => {
  const value = fixture();
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  value.change({
    entryIdentifiers: [Policy.seed, Policy.manual],
    recordingIdentifiers: [Policy.seed, Policy.manual],
  });
  value.requests[0].resolve(page([Policy.next], null));
  await playing;
  assert.deepEqual(value.appends, []);
  assert.deepEqual(value.snapshot().recordingIdentifiers, [
    Policy.seed,
    Policy.manual,
  ]);
  const retry = value.controller.retry();
  await flush();
  assert.equal(value.requests[1].request.continuationToken, Policy.cursor);
  assert.deepEqual(value.requests[1].request.exclude, [
    Policy.seed,
    Policy.manual,
  ]);
  value.requests[1].resolve(page([Policy.next], null));
  await retry;
  assert.deepEqual(
    value.appends.map(track => track.id),
    [Policy.next],
  );
});

test('source preparation rechecks generation and queue edits before append', async () => {
  const value = fixture();
  const wait = deferred();
  value.appendWait(wait);
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  value.requests[0].resolve(page([Policy.next], null));
  await flush();
  value.change({
    entryIdentifiers: [Policy.seed, Policy.manual],
    recordingIdentifiers: [Policy.seed, Policy.manual],
  });
  wait.resolve();
  await playing;
  assert.deepEqual(value.appends, []);
});

test('stop while waiting for initial readiness prevents a late replacement', async () => {
  const value = fixture();
  const wait = deferred();
  value.replaceWait(wait);
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  value.controller.stop();
  wait.resolve();
  await playing;
  assert.deepEqual(value.snapshot().entryIdentifiers, []);
  assert.deepEqual(value.requests, []);
});

test('account switch during continuation cannot receive tracks or retain session state', async () => {
  const value = fixture();
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  value.change({ account: Policy.otherOwner });
  value.requests[0].resolve(page([Policy.next], null));
  await playing;
  assert.deepEqual(value.appends, []);
  assert.equal(value.controller.ownsCurrentQueue(), false);
  assert.equal(value.listeners.size, 0);
});

test('failures back off and explicit retry keeps the original cursor', async () => {
  const value = fixture();
  const playing = value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(),
  );
  await flush();
  value.requests[0].reject(new Error('private provider detail'));
  await playing;
  assert.equal(
    value.controller.getSnapshot().failure,
    RecommendationPlaybackPolicy.failure,
  );
  value.change({ currentIndex: 0 });
  await flush();
  assert.equal(value.requests.length, 1);
  const retry = value.controller.retry();
  await flush();
  value.requests[1].resolve(page([Policy.next], null));
  await retry;
  assert.deepEqual(
    value.appends.map(track => track.id),
    [Policy.next],
  );
});

test('large remaining queue does not request continuation until near the end', async () => {
  const value = fixture();
  const tracks = Array.from({ length: 20 }, (_, index) => 'track-' + index);
  await value.controller.start(
    { mode: RecommendationModes.songRadio },
    page(tracks),
  );
  assert.equal(value.requests.length, 0);
  value.change({ currentIndex: 18 });
  await flush();
  assert.equal(value.requests.length, 1);
  value.requests[0].resolve(page([Policy.next], null));
  await flush();
  assert.deepEqual(
    value.appends.map(track => track.id),
    [Policy.next],
  );
});

test('finished radio session still clears on logout and does not use generic suggestions', async () => {
  const value = fixture();
  await value.controller.start(
    { mode: RecommendationModes.songRadio },
    page([Policy.seed], null),
  );
  assert.equal(value.controller.ownsCurrentQueue(), true);
  value.change({ account: null });
  await flush();
  assert.equal(value.controller.ownsCurrentQueue(), false);
  assert.equal(value.listeners.size, 0);
});

test('restoration only resumes a matching account and native queue without replacing tracks', async () => {
  const identifiers = Array.from(
    { length: 20 },
    (_, index) => 'restored-' + index,
  );
  const stored = {
    account: Policy.owner,
    queueIdentifier: Policy.queue,
    request: { mode: RecommendationModes.songRadio },
    cursor: Policy.cursor,
    seen: identifiers,
  };
  const storage = {
    async load() {
      return stored;
    },
    async save() {},
  };
  const value = fixture(storage);
  value.change({
    entryIdentifiers: identifiers,
    recordingIdentifiers: identifiers,
  });
  await value.controller.restore();
  assert.equal(value.controller.getSnapshot().active, true);
  assert.equal(value.controller.ownsCurrentQueue(), true);
  assert.deepEqual(value.snapshot().entryIdentifiers, identifiers);
  assert.equal(value.requests.length, 0);
  value.controller.stop();
});

test('stored sessions from a different account are discarded without fetching recommendations', async () => {
  const saved = [];
  const storage = {
    async load() {
      return {
        account: Policy.otherOwner,
        queueIdentifier: Policy.queue,
        request: { mode: RecommendationModes.songRadio },
        cursor: Policy.cursor,
        seen: [],
      };
    },
    async save(session) {
      saved.push(session);
    },
  };
  const value = fixture(storage);
  await value.controller.restore();
  await flush();
  assert.equal(value.controller.ownsCurrentQueue(), false);
  assert.equal(value.requests.length, 0);
  assert.deepEqual(saved, [null]);
});

test('serialized storage writes cannot resurrect a stopped session', async () => {
  const saved = [];
  const firstWrite = deferred();
  const storage = {
    async load() {
      return null;
    },
    async save(session) {
      saved.push(session);
      if (saved.length === 1) await firstWrite.promise;
    },
  };
  const value = fixture(storage);
  await value.controller.start(
    { mode: RecommendationModes.songRadio },
    page([Policy.seed], null),
  );
  value.controller.stop();
  firstWrite.resolve();
  await flush();
  assert.equal(saved.at(-1), null);
  assert.ok(saved.some(session => session?.account === Policy.owner));
});

const {
  RecommendationPageLoader,
} = require('../.build/recommendations/recommendations/RecommendationPageLoader');
test('expired cursors restart once while preserving the seed and accumulated exclusions', async () => {
  const expired = new Error('expired');
  const calls = [];
  const loader = new RecommendationPageLoader({
    async generate(request) {
      calls.push(request);
      if (calls.length === 1) throw expired;
      return page([Policy.next], Policy.nextCursor);
    },
    isExpiredSession: failure => failure === expired,
  });
  const result = await loader.load(
    {
      mode: RecommendationModes.songRadio,
      recordingId: Policy.seed,
      continuationToken: Policy.cursor,
      exclude: [Policy.seed],
    },
    new AbortController().signal,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].continuationToken, undefined);
  assert.equal(calls[1].recordingId, Policy.seed);
  assert.deepEqual(calls[1].exclude, [Policy.seed]);
  assert.equal(result.continuationToken, Policy.nextCursor);
});
test('a failed fresh radio session is not retried in a loop', async () => {
  const expired = new Error('expired');
  let calls = 0;
  const loader = new RecommendationPageLoader({
    async generate() {
      calls++;
      throw expired;
    },
    isExpiredSession: failure => failure === expired,
  });
  await assert.rejects(
    loader.load(
      { mode: RecommendationModes.songRadio, continuationToken: Policy.cursor },
      new AbortController().signal,
    ),
    expired,
  );
  assert.equal(calls, 2);
});
