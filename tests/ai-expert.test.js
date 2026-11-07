import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_LEVELS, chooseAIMove } from '../src/ai.js';
import { createGame, getView, rotate, endTurn } from '../src/engine.js';
import { GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, OUTPUT_GATE, gates, physicalAngleFor, notchAngle, angularDistance } from '../src/geometry.js';
import { nextBySeries, tokenNumber, tokenSeries, tokenTotal } from '../src/tokens.js';

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function apply(game, move) {
  const view = getView(game, game.active);
  assert.ok(move && view.allowedWheels.includes(move.wheel));
  assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0 && Math.abs(move.localDelta) <= 360);
  assert.equal(rotate(game, move.wheel, move.localDelta * (game.active === 0 ? 1 : -1)), true);
}

function assertOwnConservation(game, faceIndex) {
  const face = game.faces[faceIndex];
  const actual = [...face.queue, ...face.slots.flat().filter(token => token !== null), ...face.exited];
  assert.deepEqual(actual.sort((a, b) => a - b),
    Array.from({ length: tokenTotal(game.geometryVersion) }, (_, index) => index + 1));
  for (const lane of [0, 1]) {
    const numbers = face.exited.filter(token => tokenSeries(token) === lane).map(tokenNumber);
    assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => index + 1));
  }
}

function ownExercise(initial, level, limit = 100) {
  const game = structuredClone(initial);
  const faceIndex = game.active;
  let commands = 0;
  while (!game.verdict && commands < limit) {
    apply(game, chooseAIMove(getView(game, faceIndex), level));
    assertOwnConservation(game, faceIndex);
    assert.equal(endTurn(game), true);
    // Deliberately isolated exercise: no hidden opponent action is supplied.
    game.active = faceIndex;
    game.lastWheel = null;
    commands++;
  }
  assert.equal(game.verdict?.reason, 'complete', `${level}: no order error or preparation loop`);
  assert.equal(game.verdict.winner, faceIndex);
  assert.deepEqual(nextBySeries(game.faces[faceIndex], game.geometryVersion), [6, 6]);
  return commands;
}

function gameFromOwnView(view) {
  const game = createGame(['A', 'B'], view.faceIndex, view.geometryVersion);
  game.angles = view.angles.map((angle, index) =>
    physicalAngleFor(view.faceIndex, index + 1, 0, angle, view.geometryVersion));
  game.faces[view.faceIndex] = {
    queue: [...view.queue], slots: view.slots.map(slots => [...slots]), exited: [...view.exited],
  };
  game.faces[1 - view.faceIndex].queue = [];
  game.lastWheel = view.lastWheel;
  game.engaged = view.engaged;
  return game;
}

function assertProgressOrPreparation(game, move) {
  const owner = game.active;
  const ownTransfer = game.events.some(event => event.transfers.some(transfer => transfer.face === owner));
  const receivingSeat = gates(owner).some(gate => gate.to === move.wheel &&
    game.faces[owner].slots[move.wheel - 1].some((token, seat) => token === null &&
      angularDistance(notchAngle(owner, move.wheel, seat, game.angles[move.wheel - 1], game.geometryVersion),
        gate.targetAngle) < 1e-6));
  assert.ok(ownTransfer || receivingSeat, 'advance a pion or center a free receiver on a real passage');
  assert.equal(game.verdict, null);
  assertOwnConservation(game, owner);
}

test('Expert adds a stable saved identifier while preserving the three existing levels', () => {
  assert.deepEqual(AI_LEVELS.map(({ id, label }) => ({ id, label })), [
    { id: 'easy', label: 'Facile' }, { id: 'normal', label: 'Normal' },
    { id: 'hard', label: 'Difficile' }, { id: 'expert', label: 'Expert' },
  ]);
  assert.ok(Object.isFrozen(AI_LEVELS) && AI_LEVELS.every(Object.isFrozen));
});

test('Expert is deterministic, accepts a frozen own view and cannot use a hidden opponent', () => {
  for (const geometryVersion of [GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION]) {
    const ordinary = createGame(['A', 'B'], 1, geometryVersion);
    ordinary.angles = [27, 119, 41, 209, 311];
    const hidden = structuredClone(ordinary);
    hidden.faces[0].queue = [];
    hidden.faces[0].exited = [3, 5, 8];
    hidden.faces[0].slots[4][2] = 2;
    hidden.verdict = { winner: 0, reason: 'order', snapshot: { private: true } };
    hidden.events = [{ private: true }];
    const view = freeze(getView(ordinary, 1));
    const before = JSON.stringify(view);
    let draws = 0;
    const first = chooseAIMove(view, 'expert', { random() { draws++; return 0.99; } });
    assert.deepEqual(first, chooseAIMove(getView(hidden, 1), 'expert'));
    assert.deepEqual(first, chooseAIMove(view, 'expert'));
    assert.equal(draws, 0, 'search uses a fixed work budget, not randomness');
    assert.equal(JSON.stringify(view), before);
  }
});

for (const faceIndex of [0, 1]) {
  test(`Expert face ${faceIndex}: prepares a real receiver and follows its cascading transfer`, () => {
    const game = createGame(['A', 'B'], faceIndex);
    game.faces[1 - faceIndex].queue = [];
    game.faces[faceIndex].queue = game.faces[faceIndex].queue.filter(token => token !== 1);
    game.faces[faceIndex].slots[0][0] = 1;
    const gate = gates(faceIndex)[0];
    game.angles[0] = physicalAngleFor(faceIndex, 1, 0, gate.sourceAngle, game.geometryVersion);
    game.angles[1] = physicalAngleFor(faceIndex, 2, 0, gate.targetAngle + 35, game.geometryVersion);
    const move = chooseAIMove(getView(game, faceIndex), 'expert');
    assert.equal(move.wheel, 2, 'the waiting token needs the receiving wheel prepared');
    apply(game, move);
    assert.equal(game.faces[faceIndex].slots[0][0], null);
    assert.ok(game.events.some(event => event.transfers.some(transfer =>
      transfer.face === faceIndex && transfer.token === 1 && transfer.from.wheel === 1 && transfer.to.wheel === 2)));
    assert.equal(game.verdict, null);
    assertOwnConservation(game, faceIndex);
  });

  test(`Expert face ${faceIndex}: does not release a premature number from the exit wheel`, () => {
    const game = createGame(['A', 'B'], faceIndex);
    game.faces[1 - faceIndex].queue = [];
    game.faces[faceIndex].queue = game.faces[faceIndex].queue.filter(token => token !== 2);
    game.faces[faceIndex].slots[4][0] = 2;
    game.angles[4] = physicalAngleFor(faceIndex, 5, 0, OUTPUT_GATE - 25, game.geometryVersion);
    const move = chooseAIMove(getView(game, faceIndex), 'expert');
    assert.notEqual(move.wheel, 5);
    apply(game, move);
    assert.equal(game.verdict, null);
    assert.deepEqual(game.faces[faceIndex].exited, []);
    assert.ok(game.faces[faceIndex].slots[4].includes(2));
    assertOwnConservation(game, faceIndex);
  });
}

test('Expert finishes two visible ordered tails on different faces without an order error', () => {
  // Two different faces and nonstandard angles exercise planning, rather than
  // memorizing the original start or inserting a prepared sequence of moves.
  for (const [faceIndex, angles] of [[0, [27, 119, 41, 209, 311]], [1, [218.5, 149, 54, 317, 205]]]) {
    const game = createGame(['A', 'B'], faceIndex);
    game.angles = angles;
    game.faces[1 - faceIndex].queue = [];
    game.faces[faceIndex].queue = [5, 10];
    game.faces[faceIndex].exited = [1, 2, 3, 4, 6, 7, 8, 9];
    ownExercise(game, 'expert', 40);
  }
});

test('Expert can resume its own real interrupted rotation on the engaged wheel', () => {
  for (const faceIndex of [0, 1]) {
    const game = createGame(['A', 'B'], faceIndex);
    game.faces[1 - faceIndex].queue = [];
    const original = chooseAIMove(getView(game, faceIndex), 'expert');
    apply(game, { ...original, localDelta: original.localDelta / 2 });
    const interrupted = freeze(getView(game, faceIndex));
    assert.deepEqual(interrupted.allowedWheels, [original.wheel]);
    const resumed = chooseAIMove(interrupted, 'expert');
    assert.equal(resumed.wheel, original.wheel);
    apply(game, resumed);
    assert.equal(game.verdict, null);
    assertOwnConservation(game, faceIndex);
  }
});

test('Difficile and Expert advance a waiting pion or prepare its downstream route', () => {
  // Own view from development duel 0001, turn 13. Wheel 2 can receive pion 1,
  // or another legal wheel can prepare the path it will need later.
  const view = freeze({ faceIndex: 0, geometryVersion: GEOMETRY_VERSION,
    angles: [60.56151032532847, 53.230975101190324, 14.145795494102913, 74.60000000000002, 284.14579549410314],
    queue: [2, 3, 4, 5, 7, 8, 9, 10], exited: [6],
    slots: [[1], [null, null, null], [null, null], [null, null, null, null], [null, null, null, null, null]],
    engaged: null, lastWheel: 3, allowedWheels: [1, 2, 4, 5] });
  for (const level of ['hard', 'expert']) {
    const game = gameFromOwnView(view);
    const move = chooseAIMove(view, level);
    apply(game, move);
    assertProgressOrPreparation(game, move);
  }
});

test('Expert can load the other series while preserving the waiting predecessor', () => {
  // Development duel0001, turn15: next yellow1 waits on wheel2, green2 can load.
  const view = freeze({ faceIndex: 0, geometryVersion: GEOMETRY_VERSION,
    angles: [60.56151032532847, 240.56151032532853, 14.145795494102913, 74.60000000000002, 53.14579549410291],
    queue: [2, 3, 4, 5, 7, 8, 9, 10], exited: [6],
    slots: [[null], [null, null, 1], [null, null], [null, null, null, null], [null, null, null, null, null]],
    engaged: null, lastWheel: 5, allowedWheels: [1, 2, 3, 4] });
  const expert = gameFromOwnView(view);
  apply(expert, chooseAIMove(view, 'expert'));
  assert.equal(expert.faces[0].slots[0][0], 7);
  assert.equal(expert.faces[0].slots[1][2], 1);
  assert.equal(expert.verdict, null);
  assertOwnConservation(expert, 0);
});

test('both Expert set profiles progress when one series waits on a forbidden wheel', () => {
  // Saved development Miroir duel 0005, turn 5. Loading series two and
  // preparing a receiver for series one are both useful legal responses.
  const view = freeze({ faceIndex: 0, geometryVersion: MIRROR_GEOMETRY_VERSION,
    angles: [60.56151032532847, 240.56151032532853, 158.5, 40.20016388609531, 268.70000000000005],
    queue: [2, 3, 4, 5, 6, 7, 8, 9, 10], exited: [],
    slots: [[null], [1, null, null], [null, null], [null, null, null, null], [null, null, null, null, null]],
    engaged: null, lastWheel: 2, allowedWheels: [1, 3, 4, 5] });
  for (const geometryVersion of [MIRROR_GEOMETRY_VERSION, GEOMETRY_VERSION]) {
    const ownView = { ...view, geometryVersion };
    const game = gameFromOwnView(ownView);
    const move = chooseAIMove(ownView, 'expert');
    apply(game, move);
    assertProgressOrPreparation(game, move);
  }
});

test('Difficile loads the other series before the forbidden wheel is released', () => {
  // Reference development duel B, pose 2, turn 46. Yellow 2 waits on
  // wheel 2, but green 3 (token 8) is ready at the other entrance.
  const game = gameFromOwnView({ faceIndex: 0, geometryVersion: GEOMETRY_VERSION,
    angles: [60.56151032532847, 355.2001638860953, 284.145795494103, 45.718539904489035, 335.71853990448903],
    queue: [3, 4, 5, 8, 9, 10], exited: [1, 6, 7],
    slots: [[null], [null, null, 2], [null, null], [null, null, null, null], [null, null, null, null, null]],
    engaged: null, lastWheel: 2 });
  const view = freeze(getView(game, 0));
  assert.deepEqual(view.nextBySeries, [2, 3]);
  assert.equal(view.allowedWheels.includes(2), false);
  const old = structuredClone(game);
  apply(old, { wheel: 4, localDelta: 39.481623981606276 });
  assert.ok(old.faces[0].queue.includes(8), 'the recorded 1.57 move leaves green 3 queued');

  const move = chooseAIMove(view, 'hard');
  apply(game, move);
  assert.equal(game.faces[0].slots[0][0], 8);
  assert.equal(game.faces[0].slots[1][2], 2);
  assertProgressOrPreparation(game, move);
});

test('Expert completes both full queues from unprepared angles through the real physics', () => {
  const game = createGame();
  game.angles = [180, 77, 245, 6, 319];
  game.faces[1].queue = [];
  const commands = ownExercise(game, 'expert');
  assert.ok(commands < 65, `ten ordered tokens needed ${commands} commands`);
});

test('Expert keeps bounded practical cost and a legal safe action on a busy board', () => {
  const game = createGame();
  game.faces[1].queue = [];
  for (const [token, wheel, notch] of [[1, 2, 0], [2, 3, 1], [3, 4, 2], [4, 5, 3], [5, 1, 0]]) {
    game.faces[0].queue = game.faces[0].queue.filter(value => value !== token);
    game.faces[0].slots[wheel - 1][notch] = token;
  }
  game.angles = [218.5, 149, 54, 317, 205];
  game.lastWheel = 2;
  const start = performance.now();
  const move = chooseAIMove(getView(game, 0), 'expert');
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1500, `bounded Expert search took ${elapsed.toFixed(1)}ms`);
  assert.notEqual(move.wheel, 2);
  apply(game, move);
  assert.equal(game.verdict, null);
  assertOwnConservation(game, 0);
});
