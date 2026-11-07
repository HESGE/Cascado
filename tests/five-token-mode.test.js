import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGame, getView, rotate, allowedWheels } from '../src/engine.js';
import { configurePlayers } from '../src/players.js';
import { getGameSet } from '../src/game-sets.js';
import { REFERENCE_FIVE_GEOMETRY_VERSION, MIRROR_FIVE_GEOMETRY_VERSION,
  GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, INPUT_GATE, OUTPUT_GATE,
  physicalAngleFor, inputGates, boardHeightFor } from '../src/geometry.js';
import { tokenTotal, seriesCount } from '../src/tokens.js';
import { configureGameSet, ORIGINAL_START_MODE, MIROIR50_START_MODE,
  isValidStartingPosition } from '../src/starting-position.js';
import { configureStartingTokens } from '../src/starting-tokens.js';
import { newSession } from '../src/flow.js';
import { createSeries, seriesGameId, createNextSeriesGame } from '../src/series.js';
import { isSimulationSession, playSimulationTurn, runSimulation } from '../src/simulation.js';
import { renderBoard } from '../src/board.js';
import { getOpponentProgress, renderOpponentProgress } from '../src/opponent-progress.js';

function fresh(setId, starter = 0, mode = 'ordered') {
  const definition = getGameSet(setId, 5);
  const game = configurePlayers(createGame(['A', 'B'], starter, definition.geometryVersion),
    [{ controller: 'ai', level: 'hard' }, { controller: 'ai', level: 'hard' }]);
  game.starter = starter;
  configureGameSet(game, setId, { mode: setId === 'miroir-50' ? MIROIR50_START_MODE : ORIGINAL_START_MODE, seed: 42 });
  configureStartingTokens(game, mode, 1);
  return game;
}

function nearComplete(setId, face, mode = 'ordered') {
  const game = fresh(setId, face, mode);
  game.series = createSeries(2, { id: `five-${setId}-${face}-${mode}`, firstStarter: face });
  game.statsId = seriesGameId(game.series);
  const own = game.faces[face];
  own.queue = [];
  own.exited = [1, 2, 3, 4];
  own.slots[4][0] = 5;
  game.lastWheel = 5;
  game.angles[4] = physicalAngleFor(face, 5, 0, OUTPUT_GATE - 25, game.geometryVersion);
  return game;
}

for (const setId of ['reference', 'miroir-50']) {
  for (const mode of ['ordered', 'shuffled']) {
    test(`${setId}, five ${mode}: matching five-token queues produce one inlet and one collection slope`, () => {
      const game = fresh(setId, 0, mode);
      assert.equal(game.geometryVersion, setId === 'reference' ? REFERENCE_FIVE_GEOMETRY_VERSION : MIRROR_FIVE_GEOMETRY_VERSION);
      assert.equal(tokenTotal(game.geometryVersion), 5);
      assert.equal(seriesCount(game.geometryVersion), 1);
      assert.deepEqual(inputGates(game.geometryVersion), [INPUT_GATE]);
      assert.deepEqual(game.faces[0].queue, game.faces[1].queue);
      assert.notEqual(game.faces[0].queue, game.faces[1].queue);
      assert.deepEqual([...game.faces[0].queue].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
      if (mode === 'shuffled') assert.deepEqual(game.faces[0].queue, [3, 1, 5, 4, 2]);
      for (const face of [0, 1]) {
        const view = getView(game, face);
        assert.equal(view.totalTokens, 5);
        const svg = renderBoard(view);
        assert.equal((svg.match(/class="board-token"/g) ?? []).length, 5);
        assert.equal((svg.match(/data-tray-slot=/g) ?? []).length, 5);
        assert.equal((svg.match(/data-tray-lane=/g) ?? []).length, 1);
        assert.equal((svg.match(/data-port="input"/g) ?? []).length, 1);
        assert.doesNotMatch(svg, /data-port="input-[01]"|data-token="(?:6|7|8|9|10)"/);
        assert.match(svg, new RegExp(`viewBox="0 0 360 ${boardHeightFor(game.geometryVersion)}"`));
        const progress = getOpponentProgress(game, face);
        assert.equal(progress.totalTokens, 5);
        assert.equal((renderOpponentProgress(progress, face).match(/data-opponent-slot=/g) ?? []).length, 5);
      }
      assert.equal(isSimulationSession(newSession(game)), true);
    });

    test(`${setId}, five ${mode}: real headless hard turns preserve each face's five unique tokens`, () => {
      const game = fresh(setId, 0, mode);
      const session = newSession(game);
      for (let turn = 0; turn < 2; turn++) {
        const legal = allowedWheels(game);
        const outcome = playSimulationTurn(session);
        assert.equal(outcome.status, 'turn');
        assert.ok(outcome.move && legal.includes(outcome.move.wheel));
        assert.equal(game.turn, turn + 2);
        assert.equal(game.verdict, null);
        assert.equal(isSimulationSession(session), true);
        for (const face of game.faces) {
          const tokens = [...face.queue, ...face.exited, ...face.slots.flat().filter(token => token !== null)];
          assert.deepEqual(tokens.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
        }
      }
    });
  }

  for (const face of [0, 1]) {
    test(`${setId}, face ${face}: the fifth ordered exit wins immediately and the next series game still has five tokens`, () => {
      const game = nearComplete(setId, face, 'shuffled');
      const initialQueue = [...game.faces[1 - face].queue];
      const session = newSession(game);
      assert.equal(isSimulationSession(session), true);
      assert.ok(allowedWheels(game).includes(5), 'the last-token exception still applies');
      const result = playSimulationTurn(session);
      assert.equal(result.status, 'result');
      assert.equal(result.counted, true);
      assert.equal(session.phase, 'revealed-result');
      assert.equal(game.verdict.reason, 'complete');
      assert.equal(game.verdict.winner, face);
      assert.deepEqual(game.faces[face].exited, [1, 2, 3, 4, 5]);
      assert.equal(game.series.completed, 1);
      const next = createNextSeriesGame(game);
      assert.ok(next);
      assert.equal(next.geometryVersion, game.geometryVersion);
      assert.equal(next.players[0].level, 'hard');
      assert.deepEqual(next.faces[0].queue, initialQueue);
      assert.deepEqual(next.faces[1].queue, initialQueue);
      assert.equal(isValidStartingPosition(next), true);
      assert.equal(isSimulationSession(newSession(next)), true);
    });

    test(`${setId}, face ${face}: an early wrong-number exit still loses immediately`, () => {
      const game = fresh(setId, face, 'shuffled');
      const own = game.faces[face];
      own.queue = [1, 3, 4, 5];
      own.slots[4][0] = 2;
      game.angles[4] = physicalAngleFor(face, 5, 0, OUTPUT_GATE - 25, game.geometryVersion);
      assert.equal(rotate(game, 5, 25 * (face === 0 ? 1 : -1), { stopOnVerdict: true }), true);
      assert.equal(game.verdict.reason, 'order');
      assert.equal(game.verdict.winner, 1 - face);
      assert.deepEqual(game.verdict.snapshot.faces[face].exited, [2]);
    });
  }
}

test('simulation selects or infers five-token profiles and rejects mismatched counts before work', async () => {
  for (const setId of ['reference', 'miroir-50']) {
    const version = getGameSet(setId, 5).geometryVersion;
    const configured = await runSimulation({ count: 1, tokenCount: 5, gameSetId: setId,
      startMode: setId === 'reference' ? ORIGINAL_START_MODE : MIROIR50_START_MODE, maxTurns: 1 });
    assert.equal(configured.geometryVersion, version);
    assert.equal(configured.tokenCount, 5);
    assert.equal(configured.status, 'incomplete');
    assert.equal(configured.completed, 0);
    assert.equal(configured.draws, 0);
    assert.equal(configured.unfinished.reason, 'turn-limit');
    const inferred = await runSimulation({ count: 1, geometryVersion: version, maxTurns: 1 });
    assert.equal(inferred.geometryVersion, version);
    assert.equal(inferred.tokenCount, 5);
    await assert.rejects(runSimulation({ geometryVersion: version, tokenCount: 10 }), /pions.*géométrie/);
  }
  for (const tokenCount of [0, 1, 6, 15, '5', null, NaN]) {
    let started = false;
    await assert.rejects(runSimulation({ tokenCount }, { onProgress() { started = true; } }), /nombre de pions/);
    assert.equal(started, false);
  }
  for (const geometryVersion of [GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION]) {
    await assert.rejects(runSimulation({ geometryVersion, tokenCount: 5 }), /pions.*géométrie/);
  }
  const classic = await runSimulation({ count: 1, maxTurns: 1 });
  assert.equal(classic.geometryVersion, GEOMETRY_VERSION);
  assert.equal(Object.hasOwn(classic, 'tokenCount'), false, 'the ten-token default keeps its report shape');
});

test('CLI supports five tokens for both sets and rejects unsupported counts', () => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const command = args => spawnSync(process.execPath, ['scripts/simulate.mjs', ...args], { cwd, encoding: 'utf8', timeout: 30000 });
  for (const set of ['reference', 'miroir-50']) {
    const result = command(['--games', '1', '--tokens', '5', '--set', set, '--max-turns', '1', '--json']);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.tokenCount, 5);
    assert.equal(report.geometryVersion, getGameSet(set, 5).geometryVersion);
    assert.equal(report.completed, 0);
    assert.equal(report.draws, 0);
  }
  for (const args of [['--tokens', '6'], ['--tokens', 'five'], ['--tokens'], ['--tokens', '5', '--tokens', '10']]) {
    const result = command(args);
    assert.equal(result.status, 2, args.join(' '));
    assert.equal(result.stdout, '');
  }
  assert.match(command(['--help']).stdout, /--tokens/);
});
