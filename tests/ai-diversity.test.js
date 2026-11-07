import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIMove } from '../src/ai.js';
import { aiPositionKey, aiStagnation } from '../src/ai-memory.js';
import { createGame, getView, allowedWheels, rotate, endTurn } from '../src/engine.js';
import { physicalAngleFor } from '../src/geometry.js';

const emptySlots = () => [[null], [null, null, null], [null, null],
  [null, null, null, null], [null, null, null, null, null]];

// Own observations copied from the 1.55 loss p25-s0-n1, turns 2,4,6,8,10.
// No opposing state, external artifact, or training corpus is needed in CI.
const stalledAngles = [
  [195, 346.2, 244.4, 73.60000000000002, 306.2],
  [44.43848967467153, 352.2, 244.4, 73.60000000000002, 306.2],
  [38.43848967467153, 358.2, 244.4, 73.60000000000002, 306.2],
  [44.43848967467153, 4.199999999999989, 244.4, 73.60000000000002, 306.2],
  [38.43848967467153, 10.199999999999989, 244.4, 73.60000000000002, 306.2],
];

function ownView(angles, { queue = [1, 2, 3, 4, 5], slots = emptySlots(), lastWheel = 1 } = {}) {
  return {
    faceIndex: 1, geometryVersion: 'ddc-v1.5-five', angles: [...angles],
    queue: [...queue], queues: [[...queue]], nextBySeries: [1], totalTokens: 5,
    slots: structuredClone(slots), exited: [], next: 1, engaged: null, lastWheel,
    allowedWheels: [1, 2, 3, 4, 5].filter(wheel => wheel !== lastWheel),
  };
}

function stalled(index) {
  return {
    view: ownView(stalledAngles[index]),
    options: { recentPositions: stalledAngles.slice(0, index + 1).map(angles => aiPositionKey(ownView(angles))) },
  };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function ownGame(view) {
  const game = createGame(['A', 'B'], view.faceIndex, view.geometryVersion);
  game.faces[0].queue = [];
  game.faces[1] = { queue: [...view.queue], slots: structuredClone(view.slots), exited: [...view.exited] };
  game.angles = view.angles.map((angle, index) => physicalAngleFor(1, index + 1, 0, angle, view.geometryVersion));
  game.lastWheel = view.lastWheel;
  return game;
}

function apply(game, move) {
  assert.ok(move && allowedWheels(game).includes(move.wheel), 'the chosen wheel must actually be legal');
  assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0 && Math.abs(move.localDelta) <= 360);
  assert.equal(rotate(game, move.wheel, move.localDelta * (game.active === 0 ? 1 : -1), { stopOnVerdict: true }), true);
  assert.equal(game.verdict, null, 'a preparation must not deliberately lose by releasing a wrong pion');
}

test('a short unchanged history does not penalize useful structural preparation', () => {
  for (const index of [1, 2]) {
    const { view, options } = stalled(index);
    assert.equal(aiStagnation(view, 'hard', options).turns, index);
    const fresh = { recentPositions: [aiPositionKey(view)] };
    assert.deepEqual(chooseAIMove(freeze(view), 'hard', freeze(options)), chooseAIMove(view, 'hard', fresh));
    const game = ownGame(view);
    const before = structuredClone(game.faces[1]);
    const move = chooseAIMove(view, 'hard', options);
    assert.ok(Math.abs(move.localDelta) > 6 + 1e-6,
      'the blocked route should already prompt a receiving-seat preparation rather than the old nudge');
    apply(game, move);
    assert.deepEqual(game.faces[1], before, 'a short preparation is allowed before the first actual transfer');
  }
});

test('a prolonged changing-angle stall escapes the old repeated six-degree move', () => {
  const { view, options } = stalled(4);
  assert.deepEqual(aiStagnation(view, 'hard', options), { turns: 4, wheelCounts: [0, 4, 0, 0, 0] });
  const fresh = { recentPositions: [aiPositionKey(view)] };
  const freshGame = ownGame(view);
  apply(freshGame, chooseAIMove(view, 'hard', fresh));
  // A structural route obstruction may now be recognized even without a
  // history. Memory must still recognize the prolonged unchanged-pion suffix.
  const move = chooseAIMove(freeze(view), 'hard', freeze(options));
  assert.ok(move.wheel !== 2 || Math.abs(move.localDelta) > 6 + 1e-6,
    'remembered repeated wheel-two nudges should give way to a different wheel or a real preparation');
  const game = ownGame(view);
  const before = structuredClone(game.faces[1]);
  apply(game, move);
  assert.deepEqual(game.faces[1], before, 'escaping the stall may prepare an empty receiver before any transfer');
});

test('stagnation choices keep frozen own observations private and unchanged', () => {
  const { view, options } = stalled(4);
  const game = ownGame(view);
  const hidden = structuredClone(game);
  hidden.faces[0] = { queue: [1, 2], slots: emptySlots(), exited: [3, 4, 5] };
  hidden.faces[0].slots[4][0] = 4;
  hidden.faces[0].exited = [3, 5];
  hidden.verdict = { winner: 0, reason: 'order', secret: true };
  hidden.events = [{ secret: true }];
  const own = freeze(getView(game, 1));
  assert.deepEqual(getView(hidden, 1), own);
  const before = JSON.stringify({ own, options });
  const move = chooseAIMove(own, 'hard', freeze(options));
  const contaminated = freeze({ recentPositions: [
    'not an observation', aiPositionKey({ ...view, faceIndex: 0 }), ...options.recentPositions,
  ], hiddenOpponent: hidden.faces[0], seed: 12345 });
  assert.deepEqual(chooseAIMove(freeze(getView(hidden, 1)), 'hard', contaminated), move);
  assert.equal(JSON.stringify({ own, options }), before);
});

for (const kind of ['load', 'transfer']) {
  test(`a real ${kind} resets obsolete stagnation before the next legal own turn`, () => {
    // Captured own positions/actions immediately before turns 200 and 204 of
    // the same loss. The engine performs the load/transfer, not a mock update.
    const slots = emptySlots();
    if (kind === 'transfer') slots[0][0] = 1;
    const view = ownView(kind === 'load'
      ? [44.43848967467153, 329.4384896746715, 36.769024898809676, 73.60000000000002, 306.2]
      : [119.43848967467147, 329.4384896746715, 36.769024898809676, 184.28146009551097, 117.28146009551091], {
      queue: kind === 'load' ? [1, 2, 3, 4, 5] : [2, 3, 4, 5], slots, lastWheel: kind === 'load' ? 2 : 5,
    });
    const game = ownGame(view);
    const stale = { recentPositions: [...stalled(4).options.recentPositions, aiPositionKey(view)] };
    apply(game, kind === 'load' ? { wheel: 1, localDelta: -134.43848967467153 } : { wheel: 2, localDelta: 210 });
    if (kind === 'load') {
      assert.deepEqual(game.faces[1].queue, [2, 3, 4, 5]);
      assert.equal(game.faces[1].slots[0][0], 1);
    } else {
      assert.equal(game.faces[1].slots[0][0], null);
      assert.equal(game.faces[1].slots[2][1], 1);
    }
    assert.equal(endTurn(game), true);
    apply(game, { wheel: kind === 'load' ? 4 : 1, localDelta: 6 });
    assert.equal(endTurn(game), true);
    assert.equal(game.active, 1);
    const after = freeze(getView(game, 1));
    assert.deepEqual(aiStagnation(after, 'hard', stale), { turns: 0, wheelCounts: [0, 0, 0, 0, 0] });
    const move = chooseAIMove(after, 'hard', freeze(stale));
    assert.deepEqual(move, chooseAIMove(after, 'hard', { recentPositions: [aiPositionKey(after)] }),
      'previous pion locations must not keep penalizing a wheel after actual progress');
    apply(game, move);
  });
}
