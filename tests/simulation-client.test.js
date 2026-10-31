import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine.js';
import { configurePlayers } from '../src/players.js';
import { newSession } from '../src/flow.js';
import { createSeries, seriesGameId } from '../src/series.js';
import { createSimulationClient } from '../src/simulation-client.js';
import { advanceSimulationBatch } from '../src/simulation-worker.js';
import { configureStartingPosition, startingAnglesFor } from '../src/starting-position.js';
import { GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS } from '../src/geometry.js';
import { tokenTotal } from '../src/tokens.js';

function session(geometryVersion = GEOMETRY_VERSION) {
  const game = configurePlayers(createGame(['IA 1', 'IA 2'], 0, geometryVersion), [
    { controller: 'ai', level: 'normal' }, { controller: 'ai', level: 'hard' },
  ]);
  game.starter = 0;
  game.series = createSeries(10, { id: 'client-test' });
  game.statsId = seriesGameId(game.series);
  return newSession(game);
}

function step(value) {
  value.game.turn += 1;
  value.game.active = 1 - value.game.active;
  value.recipient = value.game.active;
  return { status: 'turn' };
}

function progressed(worker, count = 1) {
  const value = structuredClone(worker.message.session);
  for (let index = 0; index < count; index += 1) step(value);
  return { session: value, status: 'turn', turns: count };
}

function rig(options = {}) {
  const workers = [];
  const timers = new Map();
  let timerId = 0;
  let fallbackCalls = 0;
  class FakeWorker {
    constructor(url, settings) {
      this.url = url; this.settings = settings; this.terminated = false; this.requests = [];
      workers.push(this);
    }
    postMessage(message) { this.message = message; this.requests.push(message); }
    terminate() { this.terminated = true; }
    reply(result = progressed(this), requestId = this.message.requestId) {
      this.onmessage?.({ data: { requestId, ...result } });
    }
  }
  const client = createSimulationClient({
    WorkerClass: FakeWorker,
    step(value) { fallbackCalls += 1; return step(value); },
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    ...options,
  });
  return { client, workers, timers,
    get fallbackCalls() { return fallbackCalls; },
    fire(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        timers.delete(id); timer.callback();
      }
    },
  };
}

test('simulation client reuses one module worker across sequential batches', async () => {
  const r = rig();
  const first = r.client.advance(session());
  const worker = r.workers[0];
  assert.ok(worker.url.pathname.endsWith('/simulation-worker.js'));
  assert.deepEqual(worker.settings, { type: 'module' });
  worker.reply(progressed(worker, 8));
  const progress = await first;
  assert.equal(progress.turns, 8);
  assert.equal(worker.terminated, false);
  assert.equal(r.timers.size, 0);
  const next = r.client.advance(progress.session);
  assert.equal(r.workers.length, 1);
  assert.equal(worker.requests.length, 2);
  worker.reply();
  assert.equal((await next).session.game.turn, 10);
  r.client.cancel();
  assert.equal(worker.terminated, true);
});

test('simulation input and accepted output are independent structured copies', async () => {
  const r = rig();
  const original = session();
  const snapshot = structuredClone(original);
  const pending = r.client.advance(original);
  const worker = r.workers[0];
  original.game.angles[0] = 123;
  original.game.faces[0].queue.pop();
  assert.deepEqual(worker.message.session, snapshot);
  const response = progressed(worker);
  response.extra = 'discard';
  worker.reply(response);
  const result = await pending;
  response.session.game.angles[0] = 321;
  assert.equal(result.session.game.angles[0], 0);
  assert.deepEqual(Object.keys(result).sort(), ['session', 'status', 'turns']);
  assert.equal(result.session.game.faces[0].queue.length, 10);
});

test('cancellation settles pending work and rejects a late worker callback', async () => {
  const r = rig();
  assert.doesNotThrow(() => r.client.cancel());
  const pending = r.client.advance(session());
  const old = r.workers[0];
  const stale = old.onmessage;
  const oldResponse = progressed(old);
  r.client.cancel();
  assert.equal(await pending, null);
  assert.equal(old.terminated, true);
  assert.equal(r.timers.size, 0);
  const next = r.client.advance(session());
  stale({ data: { requestId: old.message.requestId, ...oldResponse } });
  r.workers[1].reply();
  assert.equal((await next).turns, 1);
});

test('overlapping requests cancel the previous calculation before replacing it', async () => {
  const r = rig();
  const first = r.client.advance(session());
  const second = r.client.advance(session());
  assert.equal(await first, null);
  assert.equal(r.workers[0].terminated, true);
  r.workers[1].reply();
  assert.equal((await second).status, 'turn');
});

test('wrong request IDs and old batch replies cannot settle the current request', async () => {
  const r = rig();
  const first = r.client.advance(session());
  const worker = r.workers[0];
  const firstId = worker.message.requestId;
  worker.reply(progressed(worker), firstId + 100);
  assert.equal(r.timers.size, 1);
  worker.reply();
  const next = r.client.advance((await first).session);
  worker.reply(progressed(worker), firstId);
  assert.equal(r.timers.size, 1);
  worker.reply();
  assert.equal((await next).session.game.turn, 3);
});

test('worker errors and timeouts pause without using a fallback or inventing results', async () => {
  for (const kind of ['error', 'messageerror', 'reported', 'timeout']) {
    const r = rig();
    const pending = r.client.advance(session());
    const worker = r.workers[0];
    if (kind === 'error') worker.onerror({ preventDefault() {} });
    if (kind === 'messageerror') worker.onmessageerror();
    if (kind === 'reported') worker.reply({ error: true });
    if (kind === 'timeout') r.fire(10000);
    assert.equal(await pending, null, kind);
    assert.equal(worker.terminated, true, kind);
    assert.equal(r.fallbackCalls, 0, kind);
    assert.equal(r.timers.size, 0, kind);
  }
});

test('unavailable workers defer exactly one turn, with cancellable fallback', async () => {
  const r = rig({ WorkerClass: null });
  const cancelled = r.client.advance(session());
  assert.equal(r.fallbackCalls, 0);
  r.client.cancel(); r.fire(0);
  assert.equal(await cancelled, null);
  assert.equal(r.fallbackCalls, 0);
  const original = session();
  const snapshot = structuredClone(original);
  const pending = r.client.advance(original);
  assert.equal(r.fallbackCalls, 0);
  r.fire(0);
  const result = await pending;
  assert.equal(r.fallbackCalls, 1);
  assert.equal(result.turns, 1);
  assert.equal(result.session.game.turn, 2);
  assert.deepEqual(original, snapshot);
});

test('worker construction failure can use one deferred turn, sending failure pauses', async () => {
  const unavailable = rig({ WorkerClass: class { constructor() { throw new Error('unavailable'); } } });
  const pending = unavailable.client.advance(session());
  unavailable.fire(0);
  assert.equal((await pending).turns, 1);
  assert.equal(unavailable.fallbackCalls, 1);
  const broken = rig({ WorkerClass: class {
    postMessage() { throw new Error('clone failed'); }
    terminate() {}
  } });
  assert.equal(await broken.client.advance(session()), null);
  assert.equal(broken.fallbackCalls, 0);
  assert.equal(broken.timers.size, 0);
});

test('malformed positions and replies cannot overwrite the accepted game', async () => {
  for (const change of [
    value => { value.status = 'complete'; },
    value => { value.turns = 9; value.session.game.turn = 10; value.session.game.active = 1; value.session.recipient = 1; },
    value => { value.turns = -1; },
    value => { value.turns = 0; },
    value => { value.session.game.statsId = 'another-match'; },
    value => { value.session.game.starter = 1; },
    value => { value.session.game.simulationMode = 'changed'; },
    value => { value.session.game.players[0].level = 'easy'; },
    value => { value.session.game.active = 0; value.session.recipient = 0; },
    value => { value.session.game.faces[0].queue.pop(); },
    value => { value.status = 'result'; },
    value => { value.status = 'blocked'; value.reason = ''; },
  ]) {
    const r = rig();
    const pending = r.client.advance(session());
    const reply = progressed(r.workers[0]);
    change(reply); r.workers[0].reply(reply);
    assert.equal(await pending, null);
    assert.equal(r.workers[0].terminated, true);
  }
  const r = rig();
  const pending = r.client.advance(session());
  assert.equal(await r.client.advance({}), null);
  assert.equal(await pending, null);
  assert.equal(r.workers[0].terminated, true);
});

test('a blocked calculation returns its accepted position and reason without a fake verdict', async () => {
  const r = rig();
  const pending = r.client.advance(session());
  const value = progressed(r.workers[0], 2);
  value.status = 'blocked'; value.reason = 'no-legal-move';
  r.workers[0].reply(value);
  const result = await pending;
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'no-legal-move');
  assert.equal(result.session.game.verdict, null);
  assert.equal(result.session.game.series.completed, 0);
});

test('a terminal batch remains on the same match for the page to save', async () => {
  const r = rig();
  const pending = r.client.advance(session());
  const value = progressed(r.workers[0]);
  value.status = 'result';
  value.session.phase = 'revealed-result';
  value.session.game.verdict = { winner: 0, reason: 'complete' };
  Object.assign(value.session.game.series, { completed: 1, wins: [1, 0], totalTurns: 1,
    lastGameId: value.session.game.statsId });
  r.workers[0].reply(value);
  const result = await pending;
  assert.equal(result.status, 'result');
  assert.equal(result.session.game.series.round, 1);
  assert.equal(result.session.game.series.completed, 1);
  assert.equal(result.session.game.statsId, 'series:client-test:1');
});

test('fallback failures or invalid output pause safely', async () => {
  for (const fallback of [() => null, () => ({ status: 'turn' }),
    () => { throw new Error('failed'); }]) {
    const r = rig({ WorkerClass: null, step: fallback });
    const pending = r.client.advance(session()); r.fire(0);
    assert.equal(await pending, null);
  }
});

test('worker batches stop after eight turns or the time budget between turns', () => {
  let calls = 0;
  const first = advanceSimulationBatch(session(), { step(value) { calls += 1; return step(value); }, now: () => 0 });
  assert.equal(calls, 8);
  assert.equal(first.turns, 8);
  assert.equal(first.status, 'turn');
  let clock = 0;
  const timed = advanceSimulationBatch(session(), { step(value) { clock += 70; return step(value); }, now: () => clock });
  assert.equal(timed.turns, 2);
});

test('worker batches stop immediately on a result or a blocked step', () => {
  for (const status of ['result', 'blocked']) {
    let calls = 0;
    const result = advanceSimulationBatch(session(), {
      step(value) {
        calls += 1;
        if (calls < 3) return step(value);
        return { status, ...(status === 'blocked' ? { reason: 'no-legal-move' } : {}) };
      },
      now: () => 0,
    });
    assert.equal(calls, 3);
    assert.equal(result.turns, 2);
    assert.equal(result.status, status);
  }
  assert.throws(() => advanceSimulationBatch({}), TypeError);
});

test('worker progress preserves reproducible starting metadata and rejects a coherent replacement', async () => {
  const original = session();
  configureStartingPosition(original.game, { mode: 'varied', seed: 42 }, 1);
  original.game.angles = [1, 2, 3, 4, 5];
  const r = rig();
  const pending = r.client.advance(original);
  const reply = progressed(r.workers[0]);
  r.workers[0].reply(reply);
  const accepted = await pending;
  assert.deepEqual(accepted.session.game.startConfig, original.game.startConfig);
  assert.deepEqual(accepted.session.game.startingAngles, original.game.startingAngles);
  assert.deepEqual(accepted.session.game.angles, [1, 2, 3, 4, 5]);
  reply.session.game.startingAngles[0] = -1;
  assert.deepEqual(accepted.session.game.startingAngles, original.game.startingAngles);
  for (const change of [
    value => {
      value.session.game.startConfig = { mode: 'varied', seed: 43 };
      value.session.game.startingAngles = startingAnglesFor(43, 1);
    },
    value => { delete value.session.game.startConfig; delete value.session.game.startingAngles; },
  ]) {
    const alternate = rig();
    const wait = alternate.client.advance(original);
    const value = progressed(alternate.workers[0]);
    change(value);
    alternate.workers[0].reply(value);
    assert.equal(await wait, null);
  }
  r.client.cancel();
});

test('worker progress cannot change an accepted mechanical profile', async () => {
  for (const geometryVersion of SUPPORTED_GEOMETRY_VERSIONS) {
    const original = session(geometryVersion);
    const acceptedRig = rig();
    const pending = acceptedRig.client.advance(original);
    acceptedRig.workers[0].reply();
    assert.equal((await pending).session.game.geometryVersion, geometryVersion);
    acceptedRig.client.cancel();
    const invalidRig = rig();
    const changed = invalidRig.client.advance(original);
    const response = progressed(invalidRig.workers[0]);
    response.session.game.geometryVersion = geometryVersion === GEOMETRY_VERSION ? LEGACY_GEOMETRY_VERSION : GEOMETRY_VERSION;
    invalidRig.workers[0].reply(response);
    assert.equal(await changed, null);
  }
});

test('a ten-token worker reply cannot hide a missing or duplicate token behind displayed numbers', async () => {
  for (const change of [
    value => { value.session.game.faces[0].queue[5] = 1; },
    value => { value.session.game.faces[0].queue = [1, 2, 3, 4, 5]; },
    value => { value.session.game.faces[0].queue[9] = 11; },
  ]) {
    const r = rig();
    const pending = r.client.advance(session());
    const response = progressed(r.workers[0]);
    change(response); r.workers[0].reply(response);
    assert.equal(await pending, null);
    assert.equal(r.workers[0].terminated, true);
  }
  for (const geometryVersion of SUPPORTED_GEOMETRY_VERSIONS) {
    const r = rig();
    const pending = r.client.advance(session(geometryVersion));
    r.workers[0].reply();
    const result = await pending;
    assert.equal(result.session.game.faces[0].queue.length, tokenTotal(geometryVersion));
    r.client.cancel();
  }
});
