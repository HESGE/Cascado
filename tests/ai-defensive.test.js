import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIMove } from '../src/ai.js';
import { createGame, getView, rotate, endTurn, allowedWheels } from '../src/engine.js';
import { getGameSet } from '../src/game-sets.js';
import { OUTPUT_GATE, physicalAngleFor, normalizeAngle, wheelsFor } from '../src/geometry.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function ownGame(owner = 0, set = 'reference') {
  const game = createGame(['A', 'B'], owner, getGameSet(set, 5).geometryVersion);
  game.faces[1 - owner].queue = [];
  return game;
}

function apply(game, move) {
  assert.ok(move && allowedWheels(game).includes(move.wheel));
  assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0 && Math.abs(move.localDelta) <= 360);
  assert.equal(rotate(game, move.wheel, move.localDelta * (game.active === 0 ? 1 : -1), { stopOnVerdict: true }), true);
}

function exposedPosition(owner = 0, set = 'reference') {
  const game = ownGame(owner, set);
  game.faces[owner].queue = [3, 4, 5];
  game.faces[owner].slots[1][0] = 1;
  game.faces[owner].slots[3][0] = 2;
  game.angles = [348, 22, 116, 155.71853990448903, 10.718539904489035];
  if (owner === 1) game.angles = game.angles.map((angle, index) =>
    normalizeAngle(angle - wheelsFor(game.geometryVersion)[index].delta));
  game.lastWheel = 5;
  return game;
}

/** Opposing moves are executed through the public engine after a real endTurn.
 * There are no opposing pions, so the fifth-pion exception does not apply. */
function opposingOrderThreats(game, owner, move) {
  const after = structuredClone(game);
  apply(after, move);
  assert.equal(after.verdict, null);
  assert.equal(endTurn(after), true);
  assert.equal(after.active, 1 - owner);
  assert.equal(after.lastWheel, move.wheel);
  const threats = [];
  for (const wheel of allowedWheels(after)) for (const delta of [-360, 360]) {
    const reply = structuredClone(after);
    assert.equal(rotate(reply, wheel, delta, { stopOnVerdict: true }), true);
    if (reply.verdict?.reason === 'order' && reply.verdict.winner === 1 - owner) threats.push({ wheel, delta });
  }
  return threats;
}

for (const set of ['reference', 'miroir-50']) for (const owner of [0, 1]) {
  test(`${set}, face ${owner}: defensive play avoids a real opposing wheel-five trap`, () => {
    const game = exposedPosition(owner, set);
    // Captured from the pre-defensive 1.54 Difficile policy on this own view.
    // This legal move advances pion1 but exposes pion2 to a bad opposing exit.
    const oldMove = { wheel: 2, localDelta: 33.20016388609531 * (owner === 0 ? 1 : -1) };
    assert.ok(opposingOrderThreats(game, owner, oldMove).some(move => move.wheel === 5));
    for (const level of ['hard', 'expert']) {
      const view = freeze(getView(game, owner));
      const before = JSON.stringify(view);
      const move = chooseAIMove(view, level);
      assert.deepEqual(opposingOrderThreats(game, owner, move), [],
        'the selected move must survive every legal monotonic opposing full sweep');
      assert.equal(JSON.stringify(view), before);
    }
  });

  test(`${set}, face ${owner}: hidden opposing pions and verdicts cannot influence defense`, () => {
    const game = exposedPosition(owner, set);
    const hidden = structuredClone(game);
    hidden.faces[1 - owner].queue = [1, 2];
    hidden.faces[1 - owner].slots[4][0] = 3;
    hidden.faces[1 - owner].exited = [4, 5];
    hidden.verdict = { winner: owner, reason: 'order', snapshot: { secret: true } };
    hidden.events = [{ secret: true }];
    const view = freeze(getView(game, owner));
    const before = JSON.stringify(view);
    assert.deepEqual(getView(hidden, owner), view);
    for (const level of ['hard', 'expert']) {
      assert.deepEqual(chooseAIMove(view, level), chooseAIMove(getView(hidden, owner), level));
    }
    assert.equal(JSON.stringify(view), before);
  });

  test(`${set}, face ${owner}: the fifth pion wins immediately despite the last-wheel prohibition`, () => {
    const game = ownGame(owner, set);
    game.faces[owner].queue = [];
    game.faces[owner].exited = [1, 2, 3, 4];
    game.faces[owner].slots[4][2] = 5;
    game.lastWheel = 5;
    game.angles[4] = physicalAngleFor(owner, 5, 2, OUTPUT_GATE - 25, game.geometryVersion);
    assert.ok(allowedWheels(game).includes(5), 'the own fifth-pion exception is real');
    for (const level of ['hard', 'expert']) {
      const copy = structuredClone(game);
      const move = chooseAIMove(getView(copy, owner), level);
      assert.equal(move.wheel, 5);
      apply(copy, move);
      assert.equal(copy.verdict.reason, 'complete');
      assert.equal(copy.verdict.winner, owner);
      assert.deepEqual(copy.faces[owner].exited, [1, 2, 3, 4, 5]);
      assert.equal(copy.turn, 1, 'the win happens during the rotation, before endTurn');
    }
  });
}

for (const owner of [0, 1]) {
  test(`face ${owner}: actual opposing turns determine the next forbidden wheel`, () => {
    const game = ownGame(owner);
    apply(game, { wheel: 2, localDelta: 1 });
    assert.equal(endTurn(game), true);
    assert.equal(game.active, 1 - owner);
    assert.equal(allowedWheels(game).includes(2), false);
    assert.equal(rotate(game, 2, 6), false, 'the opponent cannot reuse our selected wheel');
    assert.equal(rotate(game, 3, 1), true);
    assert.equal(endTurn(game), true);
    assert.equal(game.active, owner);
    assert.equal(game.lastWheel, 3);
    const move = chooseAIMove(freeze(getView(game, owner)), 'hard');
    assert.notEqual(move.wheel, 3);
    apply(game, move);
  });

  test(`face ${owner}: a forced risky engaged wheel still returns a bounded legal move`, () => {
    const game = ownGame(owner);
    game.faces[owner].queue = [1, 3, 4, 5];
    game.faces[owner].slots[4][0] = 2;
    game.angles[4] = physicalAngleFor(owner, 5, 0, OUTPUT_GATE - 90, game.geometryVersion);
    game.engaged = 5;
    const view = freeze(getView(game, owner));
    const before = JSON.stringify(view);
    const started = performance.now();
    const move = chooseAIMove(view, 'hard');
    assert.ok(performance.now() - started < 2000, 'the forced-risk fallback remains bounded');
    assert.equal(move.wheel, 5);
    apply(game, move);
    assert.equal(game.verdict, null, 'do not deliberately release pion2 during our own rotation');
    assert.equal(JSON.stringify(view), before);
  });
}

// Frozen pre-defensive 1.54 decisions for the shuffled five-pion strategy.
const unchanged = [
  ['reference', 0, 'hard', 6.5], ['reference', 0, 'expert', 6.5],
  ['reference', 1, 'hard', 68.5], ['reference', 1, 'expert', 68.5],
  ['miroir-50', 0, 'hard', 6.5], ['miroir-50', 0, 'expert', 6.5],
  ['miroir-50', 1, 'hard', 173.5], ['miroir-50', 1, 'expert', 173.5],
];
test('shuffled five-pion decisions retain their frozen pre-defensive actions', () => {
  for (const [set, owner, level, delta] of unchanged) {
    const game = createGame(['A', 'B'], owner, getGameSet(set, 5).geometryVersion);
    game.angles = [218.5, 149, 54, 317, 205];
    game.tokenStart = { mode: 'shuffled', seed: 1 };
    game.faces[owner].queue = [3, 1, 5, 4, 2];
    assert.deepEqual(chooseAIMove(freeze(getView(game, owner)), level), { wheel: 1, localDelta: delta });
  }
});
