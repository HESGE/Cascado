import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView } from '../src/engine.js';
import { createAIClient } from '../src/ai-client.js';
import { GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS, LEGACY_GEOMETRY_VERSION } from '../src/geometry.js';
import { tokenTotal } from '../src/tokens.js';

const move = { wheel: 2, localDelta: -30 };
const view = () => getView(createGame(), 0);
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function rig(options = {}) {
  const workers = [];
  const timers = new Map();
  const fallbackCalls = [];
  let timerId = 0;
  class FakeWorker {
    constructor(url, settings) {
      this.url = url; this.settings = settings; this.terminated = false;
      workers.push(this);
    }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
    reply(value = move, requestId = this.message.requestId) {
      this.onmessage?.({ data: { requestId, move: value } });
    }
  }
  const client = createAIClient({
    WorkerClass: FakeWorker,
    fallback: (projection, level) => { fallbackCalls.push({ projection, level }); return move; },
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    ...options,
  });
  return { client, workers, timers, fallbackCalls,
    fire(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== delay) continue;
        timers.delete(id); timer.callback();
      }
    },
  };
}

test('AI client: cancellation before any work is harmless and reusable', async () => {
  const r = rig();
  assert.doesNotThrow(() => r.client.cancel());
  const pending = r.client.choose(view());
  r.client.cancel();
  assert.equal(await pending, null);
  assert.equal(r.workers[0].terminated, true);
  assert.equal(r.timers.size, 0);
  const next = r.client.choose(view());
  r.workers[1].reply();
  assert.deepEqual(await next, move);
});

test('AI client: a module worker receives only an immutable face projection', async () => {
  const r = rig();
  const original = view();
  original.faces = [{ secret: true }]; original.verdict = { winner: 1 };
  original.events = [{ secret: true }]; original.name = 'Private';
  const pending = r.client.choose(original, 'hard');
  const worker = r.workers[0];
  assert.ok(worker.url instanceof URL);
  assert.ok(worker.url.pathname.endsWith('/ai-worker.js'));
  assert.deepEqual(worker.settings, { type: 'module' });
  assert.deepEqual(Object.keys(worker.message).sort(), ['level', 'requestId', 'view']);
  assert.deepEqual(Object.keys(worker.message.view).sort(),
    ['allowedWheels', 'angles', 'engaged', 'exited', 'faceIndex', 'geometryVersion', 'lastWheel', 'nextBySeries', 'queue', 'queues', 'slots', 'totalTokens']);
  assert.equal(worker.message.level, 'hard');
  original.angles[0] = 99; original.queue.pop(); original.slots[0][0] = 5;
  assert.equal(worker.message.view.angles[0], 45);
  assert.equal(worker.message.view.queue.length, 10);
  assert.equal(worker.message.view.slots[0][0], null);
  worker.reply({ ...move, secret: 'discarded' });
  assert.deepEqual(await pending, move);
  assert.equal(worker.terminated, true);
  assert.equal(r.timers.size, 0);
});

test('AI client: overlapping requests resolve the old one and ignore its late callback', async () => {
  const r = rig();
  const first = r.client.choose(view(), 'easy');
  const firstWorker = r.workers[0];
  const stale = firstWorker.onmessage;
  const second = r.client.choose(view(), 'hard');
  assert.equal(await first, null);
  assert.equal(firstWorker.terminated, true);
  stale({ data: { requestId: firstWorker.message.requestId, move: { wheel: 1, localDelta: 99 } } });
  r.workers[1].reply();
  assert.deepEqual(await second, move);
  assert.equal(r.fallbackCalls.length, 0);
});

test('AI client: a wrong request ID is ignored until the current worker replies', async () => {
  const r = rig();
  const pending = r.client.choose(view());
  const worker = r.workers[0];
  worker.reply({ wheel: 5, localDelta: 80 }, worker.message.requestId + 1);
  assert.equal(worker.terminated, false);
  worker.reply();
  assert.deepEqual(await pending, move);
});

test('AI client: a supported null result terminates without unnecessary fallback', async () => {
  const r = rig();
  const pending = r.client.choose(view());
  r.workers[0].reply(null);
  assert.equal(await pending, null);
  assert.equal(r.fallbackCalls.length, 0);
  assert.equal(r.workers[0].terminated, true);
});

test('AI client: unsupported workers defer the fallback and can cancel it first', async () => {
  const r = rig({ WorkerClass: null });
  const cancelled = r.client.choose(view());
  assert.equal(r.fallbackCalls.length, 0);
  r.client.cancel();
  r.fire(0);
  assert.equal(await cancelled, null);
  assert.equal(r.fallbackCalls.length, 0);
  const pending = r.client.choose(view(), 'invalid-level');
  r.fire(0); await tick();
  assert.deepEqual(await pending, move);
  assert.equal(r.fallbackCalls[0].level, 'normal');
});

test('AI client: worker construction or sending failures use the bounded fallback', async () => {
  for (const WorkerClass of [
    class { constructor() { throw new Error('blocked'); } },
    class { postMessage() { throw new Error('clone refused'); } terminate() {} },
  ]) {
    const r = rig({ WorkerClass });
    const pending = r.client.choose(view());
    assert.equal(r.fallbackCalls.length, 0);
    r.fire(0); await tick();
    assert.deepEqual(await pending, move);
  }
});

test('AI client: worker errors terminate once and schedule only one fallback', async () => {
  for (const kind of ['error', 'messageerror', 'reported-error']) {
    const r = rig();
    const pending = r.client.choose(view());
    const worker = r.workers[0];
    const failed = worker.onerror;
    if (kind === 'error') failed({ preventDefault() {} });
    if (kind === 'messageerror') worker.onmessageerror();
    if (kind === 'reported-error') worker.onmessage({ data: { requestId: worker.message.requestId, error: true } });
    failed({});
    assert.equal(worker.terminated, true);
    assert.equal(r.timers.size, 1);
    r.fire(0); await tick();
    assert.deepEqual(await pending, move);
    assert.equal(r.fallbackCalls.length, 1);
  }
});

test('AI client: a timed out worker is terminated before a single fallback', async () => {
  const r = rig();
  const pending = r.client.choose(view());
  assert.equal([...r.timers.values()][0].delay, 5000);
  const worker = r.workers[0];
  const stale = worker.onmessage;
  r.fire(5000);
  assert.equal(worker.terminated, true);
  stale({ data: { requestId: worker.message.requestId, move: { wheel: 5, localDelta: 88 } } });
  r.fire(0); await tick();
  assert.deepEqual(await pending, move);
  assert.equal(r.fallbackCalls.length, 1);
});

test('AI client: malformed current worker responses fall back to a validated move', async () => {
  for (const invalid of [undefined, {}, { wheel: 0, localDelta: 1 }, { wheel: 6, localDelta: 1 },
    { wheel: 1.5, localDelta: 1 }, { wheel: '1', localDelta: 1 },
    { wheel: 1, localDelta: 0 }, { wheel: 1, localDelta: Infinity }, { wheel: 1, localDelta: NaN },
    { wheel: 1, localDelta: '4' }]) {
    const r = rig();
    const pending = r.client.choose(view());
    r.workers[0].onmessage({ data: { requestId: r.workers[0].message.requestId, move: invalid } });
    assert.equal(r.workers[0].terminated, true);
    r.fire(0); await tick();
    assert.deepEqual(await pending, move);
  }
});

test('AI client: invalid or failing fallback results always resolve to null', async () => {
  for (const fallback of [() => null, () => ({}), () => ({ wheel: 1, localDelta: 0 }),
    () => { throw new Error('planner failed'); }, () => Promise.reject(new Error('planner failed'))]) {
    const r = rig({ WorkerClass: null, fallback });
    const pending = r.client.choose(view());
    r.fire(0); await tick();
    assert.equal(await pending, null);
  }
});

test('AI client: cancellation also settles an asynchronous fallback and ignores its late result', async () => {
  let finishFallback;
  const r = rig({ WorkerClass: null, fallback: () => new Promise(resolve => { finishFallback = resolve; }) });
  const pending = r.client.choose(view());
  r.fire(0);
  r.client.cancel();
  assert.equal(await pending, null);
  finishFallback(move); await tick();
  assert.equal(r.timers.size, 0);
});

test('AI client: invalid projection cancels previous work without launching new calculation', async () => {
  const r = rig();
  const first = r.client.choose(view());
  assert.equal(await r.client.choose(createGame()), null);
  assert.equal(await first, null);
  assert.equal(r.workers[0].terminated, true);
  assert.equal(r.workers.length, 1);
  assert.equal(r.timers.size, 0);
  assert.equal(r.fallbackCalls.length, 0);
});

test('AI client: nested non-projection data cannot travel inside a numeric field', async () => {
  for (const alter of [
    value => { value.engaged = { secret: true }; },
    value => { value.lastWheel = { secret: true }; },
    value => { value.queue[0] = { secret: true }; },
    value => { value.exited = [{ secret: true }]; },
    value => { value.slots[0][0] = { secret: true }; },
    value => { value.allowedWheels = [{ secret: true }]; },
  ]) {
    const r = rig();
    const invalid = view(); alter(invalid);
    assert.equal(await r.client.choose(invalid), null);
    assert.equal(r.workers.length, 0);
  }
});

test('AI client transmits only supported public geometry and defaults old payloads to legacy', async () => {
  for (const geometryVersion of [...SUPPORTED_GEOMETRY_VERSIONS, undefined]) {
    const r = rig();
    const projection = getView(createGame(['A', 'B'], 0, geometryVersion ?? LEGACY_GEOMETRY_VERSION), 0);
    if (geometryVersion === undefined) delete projection.geometryVersion;
    else projection.geometryVersion = geometryVersion;
    const pending = r.client.choose(projection);
    assert.equal(r.workers[0].message.view.geometryVersion, geometryVersion ?? LEGACY_GEOMETRY_VERSION);
    assert.equal(r.workers[0].message.view.totalTokens, tokenTotal(geometryVersion ?? LEGACY_GEOMETRY_VERSION));
    r.workers[0].reply();
    assert.deepEqual(await pending, move);
  }
  for (const geometryVersion of ['future', 'ddc-v1.2', null, {}, 4]) {
    const r = rig();
    assert.equal(await r.client.choose({ ...view(), geometryVersion }), null);
    assert.equal(r.workers.length, 0);
  }
});

test('AI client derives two public queues and next numbers from the flat authorised IDs', async () => {
  const r = rig();
  const original = view();
  original.queue = [2, 3, 4, 5, 7, 8, 9, 10];
  original.exited = [1, 6];
  original.queues = [[{ secret: true }]];
  original.nextBySeries = [{ secret: true }];
  original.totalTokens = { secret: true };
  const pending = r.client.choose(original);
  const sent = r.workers[0].message.view;
  assert.deepEqual(sent.queues, [[2, 3, 4, 5], [7, 8, 9, 10]]);
  assert.deepEqual(sent.nextBySeries, [2, 2]);
  assert.equal(sent.totalTokens, 10);
  original.queue.pop(); original.exited.push(2);
  assert.equal(sent.queues[1].length, 4);
  assert.deepEqual(sent.nextBySeries, [2, 2]);
  r.workers[0].reply();
  assert.deepEqual(await pending, move);
});

test('AI client keeps wheel IDs limited to five even when token IDs reach ten', async () => {
  for (const change of [
    value => { value.allowedWheels = [6]; },
    value => { value.engaged = 10; },
    value => { value.lastWheel = 7; },
    value => { value.queue[0] = 11; },
  ]) {
    const r = rig();
    const invalid = view(); change(invalid);
    assert.equal(await r.client.choose(invalid), null);
    assert.equal(r.workers.length, 0);
  }
});
