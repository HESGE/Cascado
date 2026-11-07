import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_LEVELS, chooseAIMove } from '../src/ai.js';
import { allowedWheels, createGame, getView, rotate, setGustArmed } from '../src/engine.js';
import { GEOMETRY_VERSION, OUTPUT_GATE, physicalAngleFor } from '../src/geometry.js';

function lockedExit(face) {
  const game = createGame(['Luffy', 'Law'], face, GEOMETRY_VERSION, { gameMode: 'one-piece' });
  game.lastWheel = 5;
  game.faces[face].queue.shift();
  game.faces[face].slots[4][0] = 1;
  game.angles[4] = physicalAngleFor(face, 5, 0, OUTPUT_GATE - 25, GEOMETRY_VERSION);
  return game;
}

test('One Piece AI uses its Coup de vent for a safe exit on either face', () => {
  for (const face of [0, 1]) {
    for (const { id } of AI_LEVELS) {
      const game = lockedExit(face);
      const view = getView(game, face);
      const before = structuredClone(game);
      const move = chooseAIMove(view, id, { random: () => 0 });
      assert.deepEqual(game, before);
      assert.equal(move.wheel, 5);
      assert.equal(move.useGust, true);
      assert.ok(!allowedWheels(game).includes(move.wheel));
      assert.equal(setGustArmed(game, true), true);
      const armedMove = chooseAIMove(getView(game, face), id, { random: () => 0 });
      assert.equal(armedMove.wheel, 5);
      assert.equal(armedMove.useGust, undefined);
      assert.equal(rotate(game, move.wheel, move.localDelta * (face === 0 ? 1 : -1)), true);
      assert.deepEqual(game.faces[face].exited, [1]);
      assert.equal(getView(game, face).gust.remaining, 0);
      assert.equal(getView(game, 1 - face).gust.remaining, 1);
    }
  }
});

test('One Piece AI keeps the Coup de vent when the locked wheel has no useful transfer', () => {
  const game = createGame(['Luffy', 'Law'], 0, GEOMETRY_VERSION, { gameMode: 'one-piece' });
  game.lastWheel = 5;
  const move = chooseAIMove(getView(game, 0), 'hard');
  assert.equal(move.wheel, 1);
  assert.equal(move.useGust, undefined);
  assert.equal(rotate(game, move.wheel, move.localDelta), true);
  assert.equal(getView(game, 0).gust.remaining, 1);
});
