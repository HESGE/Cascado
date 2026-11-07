import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIMove } from '../src/ai.js';
import { aiStagnation } from '../src/ai-memory.js';
import { createGame, getView, allowedWheels, rotate, endTurn } from '../src/engine.js';
import { physicalAngleFor, gates, notchAngle, angularDistance } from '../src/geometry.js';

// Real own observations from 1.55 matches. No opposing state or external
// simulation artifact is needed: the next pion is on forbidden wheel 2,
// while a later pion can be loaded now rather than waiting for a stall.
const scenarios = [
  {
    name: 'the second pion, before the first has exited',
    origin: 'p4-s0-n0-t5',
    angles: [60.56151032532847, 53.230975101190324, 287.70000000000005, 349, 124.89999999999998],
    queue: [2, 3, 4, 5], exited: [], nextSeat: 1,
    oldMove: { wheel: 1, localDelta: -6 },
  },
  {
    name: 'the fourth pion, while the third waits on wheel two',
    origin: 'p1-s1-n0-t32',
    angles: [60.56151032532847, 30.561510325328527, 104.14579549410303, 135.71853990448903, 176.71853990448903],
    queue: [4, 5], exited: [1, 2], nextSeat: 2,
    oldMove: { wheel: 3, localDelta: 39.0851796070873 },
  },
];

function position(scenario) {
  const game = createGame(['A', 'B'], 0, 'ddc-v1.5-five');
  game.faces[1].queue = [];
  game.faces[0] = {
    queue: [...scenario.queue], exited: [...scenario.exited],
    slots: [[null], [null, null, null], [null, null],
      [null, null, null, null], [null, null, null, null, null]],
  };
  game.faces[0].slots[1][scenario.nextSeat] = scenario.exited.length + 1;
  game.angles = scenario.angles.map((angle, index) => physicalAngleFor(0, index + 1, 0, angle, game.geometryVersion));
  game.lastWheel = 2;
  return game;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function apply(game, move) {
  assert.ok(move && allowedWheels(game).includes(move.wheel), 'the real last-wheel prohibition must hold');
  assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0 && Math.abs(move.localDelta) <= 360);
  assert.equal(rotate(game, move.wheel, move.localDelta * (game.active === 0 ? 1 : -1), { stopOnVerdict: true }), true);
  assert.equal(game.verdict, null, 'loading a future pion must not lose by order');
}

function opposingOrderThreats(game) {
  const opposing = structuredClone(game);
  assert.equal(endTurn(opposing), true);
  const threats = [];
  for (const wheel of allowedWheels(opposing)) for (const delta of [-360, 360]) {
    const after = structuredClone(opposing);
    assert.equal(rotate(after, wheel, delta, { stopOnVerdict: true }), true);
    if (after.verdict?.reason === 'order' && after.verdict.winner === 1) threats.push({ wheel, delta });
  }
  return threats;
}

for (const scenario of scenarios) for (const level of ['hard', 'expert']) {
  test(`${level}: anticipates blocked wheel two by loading ${scenario.name}`, () => {
    const game = position(scenario);
    const view = freeze(getView(game, 0));
    const before = JSON.stringify(view);
    const later = view.queue[0];
    assert.equal(view.allowedWheels.includes(2), false);
    assert.equal(view.slots[1][scenario.nextSeat], view.next);
    assert.equal(aiStagnation(view, level).turns, 0, 'the decision needs no accumulated stagnation memory');

    const old = structuredClone(game);
    apply(old, scenario.oldMove);
    assert.ok(old.faces[0].queue.includes(later), 'the captured 1.56 move left this later pion queued');

    const move = chooseAIMove(view, level);
    apply(game, move);
    assert.deepEqual(game.faces[0].queue, scenario.queue.slice(1), 'prepare the next load before wheel two becomes available');
    assert.equal(game.faces[0].slots[0][0], later);
    assert.equal(game.faces[0].slots[1][scenario.nextSeat], view.next, 'the waiting priority pion stays on its real wheel');
    assert.deepEqual(game.faces[0].exited, scenario.exited);
    assert.deepEqual(opposingOrderThreats(game), [], 'a full opposing sweep must not expose an out-of-order exit');
    assert.equal(JSON.stringify(view), before, 'the planner must not mutate frozen own observations');
  });
}

for (const level of ['hard', 'expert']) {
  test(`${level}: prepares a downstream receiver before the first blocked inlet has accumulated a history`, () => {
    // The start of the long p25-s0-n1 stall, before its four-turn memory
    // detector could react. The old 1.56 move was wheel two +6 degrees.
    const game = createGame(['A', 'B'], 1, 'ddc-v1.5-five');
    game.faces[0].queue = [];
    game.angles = [195, 346.2, 244.4, 73.60000000000002, 306.2]
      .map((angle, index) => physicalAngleFor(1, index + 1, 0, angle, game.geometryVersion));
    game.lastWheel = 1;
    const view = freeze(getView(game, 1));
    const before = structuredClone(game.faces[1]);
    assert.equal(aiStagnation(view, level).turns, 0);
    assert.equal(view.allowedWheels.includes(1), false);
    const move = chooseAIMove(view, level);
    assert.ok(Math.abs(move.localDelta) > 6 + 1e-6, 'make a real receiving-seat preparation instead of the repeated six-degree nudge');
    apply(game, move);
    assert.deepEqual(game.faces[1], before, 'the inlet is still blocked, so progress must be downstream preparation');
    const incoming = gates(1).filter(gate => gate.to === move.wheel);
    assert.ok(incoming.some(gate => game.faces[1].slots[move.wheel - 1].some((token, notch) =>
      token === null && angularDistance(notchAngle(1, move.wheel, notch,
        game.angles[move.wheel - 1], game.geometryVersion), gate.targetAngle) < 1e-6)),
    'an empty receiving seat must be centered on an actual future transfer passage');
  });
}

test('early blockage anticipation ignores hidden opposing pions and untrusted options', () => {
  const game = position(scenarios[0]);
  const hidden = structuredClone(game);
  hidden.faces[1].queue = [5, 4];
  hidden.faces[1].slots[4][0] = 3;
  hidden.faces[1].exited = [1, 2];
  hidden.events = [{ secret: true }];
  hidden.verdict = { winner: 1, reason: 'complete', snapshot: { secret: true } };
  const own = freeze(getView(game, 0));
  const concealed = freeze(getView(hidden, 0));
  assert.deepEqual(concealed, own);
  const options = freeze({ recentPositions: ['not a valid own observation'], opponent: hidden.faces[1], seed: 7 });
  const before = JSON.stringify({ own, options });
  for (const level of ['hard', 'expert']) {
    assert.deepEqual(chooseAIMove(own, level), chooseAIMove(concealed, level, options));
  }
  assert.equal(JSON.stringify({ own, options }), before);
});
