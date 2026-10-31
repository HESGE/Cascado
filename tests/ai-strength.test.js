import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIMove } from '../src/ai.js';
import { createGame, getView, allowedWheels, rotate } from '../src/engine.js';
import { newSession, transmit, acceptReveal } from '../src/flow.js';
import { SUPPORTED_GEOMETRY_VERSIONS, LEGACY_GEOMETRY_VERSION } from '../src/geometry.js';
import { tokenTotal, tokenSeries, tokenNumber, seriesCount } from '../src/tokens.js';

function assertOrderedConservation(game) {
  for (const [faceIndex, face] of game.faces.entries()) {
    const tokens = [...face.queue, ...face.slots.flat().filter(token => token !== null), ...face.exited];
    assert.deepEqual(tokens.sort((a, b) => a - b), Array.from({ length: tokenTotal(game.geometryVersion) }, (_, index) => index + 1),
      `face ${faceIndex}: every numbered token remains present exactly once`);
    for (let lane = 0; lane < seriesCount(game.geometryVersion); lane++) {
      const numbers = face.exited.filter(token => tokenSeries(token) === lane).map(tokenNumber);
      assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => index + 1),
        `face ${faceIndex}, series ${lane}: every exit respects number order`);
    }
  }
}

for (const geometryVersion of SUPPORTED_GEOMETRY_VERSIONS) {
for (const hardFace of [0, 1]) {
  for (const starter of [0, 1]) {
    test(`${geometryVersion}: Difficile on face ${hardFace}, starter ${starter}: finishes legal coupled turns against Normal`, t => {
      const game = createGame(['A', 'B'], starter, geometryVersion);
      const session = newSession(game);
      let turns = 0;
      assertOrderedConservation(game);
      // Stop at the public reveal boundary, as in the application. The private
      // verdict must never suppress a move the active player is entitled to play.
      while (session.phase !== 'revealed-result' && turns < 260) {
        const player = game.active;
        const previousTurn = game.turn;
        const view = getView(game, player);
        const move = chooseAIMove(view, player === hardFace ? 'hard' : 'normal');
        assert.ok(move, `turn ${previousTurn}: the planner returns a move`);
        assert.ok(view.allowedWheels.includes(move.wheel));
        assert.ok(allowedWheels(game).includes(move.wheel), `turn ${previousTurn}: the move is legal`);
        assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0
          && Math.abs(move.localDelta) <= 360, `turn ${previousTurn}: rotation is finite and bounded`);
        const physicalDelta = move.localDelta * (player === 0 ? 1 : -1);
        assert.equal(rotate(game, move.wheel, physicalDelta), true);
        assertOrderedConservation(game);
        assert.equal(transmit(session), true);
        assert.equal(session.phase, 'passed');
        assert.equal(game.active, 1 - player);
        assert.equal(game.turn, previousTurn + 1);
        const target = acceptReveal(session);
        assert.equal(session.phase, target === 'result' ? 'revealed-result' : 'open');
        turns++;
      }
      t.diagnostic(`${turns} turns; winner ${game.verdict?.winner}; reason ${game.verdict?.reason}`);
      assert.ok(turns < 260, 'the duel terminates without an endless preparation loop');
      assert.equal(session.phase, 'revealed-result');
      assert.equal(game.verdict?.reason, 'complete', 'victory comes from completing the ordered queue');
      if (geometryVersion === LEGACY_GEOMETRY_VERSION) {
        assert.equal(game.verdict.winner, hardFace,
          `Legacy Difficile retains its Normal win when ${hardFace === starter ? 'starting first' : 'starting second'}`);
      }
      assert.deepEqual([...game.verdict.snapshot.faces[game.verdict.winner].exited].sort((a, b) => a - b),
        Array.from({ length: tokenTotal(geometryVersion) }, (_, index) => index + 1));
      assertOrderedConservation(game);
    });
  }
}
}
