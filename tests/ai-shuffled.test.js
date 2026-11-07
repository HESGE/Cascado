import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_LEVELS, chooseAIMove } from '../src/ai.js';
import { createGame, getView, rotate, endTurn } from '../src/engine.js';
import { getGameSet } from '../src/game-sets.js';
import { configureGameSet, ORIGINAL_START_MODE, MIROIR50_START_MODE } from '../src/starting-position.js';
import { gates, physicalAngleFor, OUTPUT_GATE } from '../src/geometry.js';
import { tokenNumber, tokenSeries, tokenTotal, nextBySeries } from '../src/tokens.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function shuffledGame(face, set = 'reference') {
  const game = createGame(['A', 'B'], face, getGameSet(set).geometryVersion);
  configureGameSet(game, set, { mode: set === 'reference' ? ORIGINAL_START_MODE : MIROIR50_START_MODE, seed: 1 });
  game.tokenStart = { mode: 'shuffled', seed: 1 };
  game.faces[1 - face].queue = [];
  return game;
}

function assertOwnTokens(game, face) {
  const own = game.faces[face];
  const tokens = [...own.queue, ...own.slots.flat().filter(token => token !== null), ...own.exited];
  assert.deepEqual(tokens.sort((a, b) => a - b),
    Array.from({ length: tokenTotal(game.geometryVersion) }, (_, index) => index + 1));
  for (const lane of [0, 1]) {
    const numbers = own.exited.filter(token => tokenSeries(token) === lane).map(tokenNumber);
    assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => index + 1));
  }
}

function apply(game, move) {
  const view = getView(game, game.active);
  assert.ok(move && view.allowedWheels.includes(move.wheel));
  assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0 && Math.abs(move.localDelta) <= 360);
  assert.equal(rotate(game, move.wheel, move.localDelta * (game.active === 0 ? 1 : -1), { stopOnVerdict: true }), true);
}

for (const face of [0, 1]) for (const { id: level } of AI_LEVELS) {
  test(`shuffled ${level}, face ${face}: frees a queued predecessor before placing a premature token on the exit wheel`, () => {
    const game = shuffledGame(face);
    const own = game.faces[face];
    // Yellow1 is hidden behind3. Yellow2 can stay safely on wheel4 while3
    // loads; bringing2 down to wheel5 would expose it to a shared rotation.
    own.queue = [3, 1, 4, 5];
    own.exited = [6, 7, 8, 9, 10];
    own.slots[3][0] = 2;
    const gate = gates(face).find(link => link.from === 4 && link.to === 5);
    game.angles[3] = physicalAngleFor(face, 4, 0, gate.sourceAngle, game.geometryVersion);
    game.angles[4] = physicalAngleFor(face, 5, 0, gate.targetAngle + 35, game.geometryVersion);
    const view = freeze(getView(game, face));
    const before = JSON.stringify(view);
    const move = chooseAIMove(view, level, { random: () => 0 });
    assert.equal(JSON.stringify(view), before);
    apply(game, move);
    assert.equal(own.slots[0][0], 3, 'loading the blocker exposes yellow1');
    assert.equal(own.queue[0], 1);
    assert.ok(own.slots[3].includes(2), 'yellow2 stays parked above the exit wheel');
    assert.ok(own.slots[4].every(token => token === null));
    assert.equal(game.verdict, null);
    assertOwnTokens(game, face);
  });

  test(`shuffled ${level}, face ${face}: unloads the single entry seat into a safe receiver`, () => {
    const game = shuffledGame(face);
    const own = game.faces[face];
    own.queue = [1, 3, 4, 5];
    own.exited = [6, 7, 8, 9, 10];
    own.slots[0][0] = 2;
    const gate = gates(face)[0];
    game.angles[0] = physicalAngleFor(face, 1, 0, gate.sourceAngle, game.geometryVersion);
    game.angles[1] = physicalAngleFor(face, 2, 0, gate.targetAngle + 35, game.geometryVersion);
    apply(game, chooseAIMove(getView(game, face), level, { random: () => 0 }));
    assert.equal(own.slots[0][0], null, 'yellow1 needs the only loading seat freed');
    assert.ok(own.slots[1].includes(2));
    assert.equal(own.queue[0], 1);
    assert.equal(game.verdict, null);
    assertOwnTokens(game, face);
  });

  test(`shuffled ${level}, face ${face}: still releases the next required number before parked later numbers`, () => {
    const game = shuffledGame(face);
    const own = game.faces[face];
    own.queue = [3, 4, 5];
    own.exited = [6, 7, 8, 9, 10];
    own.slots[1][0] = 2;
    own.slots[4][0] = 1;
    game.angles[4] = physicalAngleFor(face, 5, 0, OUTPUT_GATE - 25, game.geometryVersion);
    apply(game, chooseAIMove(getView(game, face), level, { random: () => 0 }));
    assert.deepEqual(own.exited, [6, 7, 8, 9, 10, 1]);
    assert.ok(own.slots[1].includes(2));
    assert.equal(game.verdict, null);
    assertOwnTokens(game, face);
  });
}

for (const set of ['reference', 'miroir-50']) for (const face of [0, 1]) {
  test(`${set}, shuffled face ${face}: a frozen own projection ignores every hidden opponent change`, () => {
    const game = shuffledGame(face, set);
    game.faces[face].queue = [2, 1, 3, 4, 5, 7, 6, 8, 9, 10];
    const hidden = structuredClone(game);
    hidden.faces[1 - face].queue = [5, 3, 1];
    hidden.faces[1 - face].slots[4][2] = 2;
    hidden.faces[1 - face].exited = [4, 9];
    hidden.verdict = { winner: 1 - face, reason: 'order', snapshot: { private: true } };
    hidden.events = [{ private: true }];
    const view = freeze(getView(game, face));
    assert.equal(view.tokenOrder, 'shuffled');
    assert.deepEqual(getView(hidden, face), view);
    const before = JSON.stringify(view);
    for (const { id: level } of AI_LEVELS) {
      assert.deepEqual(chooseAIMove(view, level, { random: () => 0.42 }),
        chooseAIMove(getView(hidden, face), level, { random: () => 0.42 }));
    }
    assert.equal(JSON.stringify(view), before);
  });
}

for (const [label, queue] of [
  ['swapped heads', [2, 1, 3, 4, 5, 7, 6, 8, 9, 10]],
  ['reversed lanes', [5, 4, 3, 2, 1, 10, 9, 8, 7, 6]],
]) for (const face of [0, 1]) {
  test(`shuffled Difficile, ${label}, face ${face}: completes its own visible sorting exercise`, () => {
    const game = shuffledGame(face);
    game.faces[face].queue = [...queue];
    let commands = 0;
    while (!game.verdict && commands < 90) {
      apply(game, chooseAIMove(getView(game, face), 'hard'));
      assertOwnTokens(game, face);
      assert.equal(endTurn(game), true);
      // This isolated sorting exercise supplies no opposing move or hidden
      // information. Coupled selfplay is assessed separately.
      game.active = face;
      game.lastWheel = null;
      game.events = [];
      commands++;
    }
    assert.equal(game.verdict?.reason, 'complete', 'sorting must not lose by order or loop');
    assert.equal(game.verdict.winner, face);
    assert.deepEqual(nextBySeries(game.faces[face], game.geometryVersion), [6, 6]);
  });
}
