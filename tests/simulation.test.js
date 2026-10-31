import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGame, getView, rotate } from '../src/engine.js';
import { chooseAIMove } from '../src/ai.js';
import { configurePlayers } from '../src/players.js';
import { newSession, transmit, acceptReveal } from '../src/flow.js';
import { createSeries, seriesGameId, recordSeriesResult } from '../src/series.js';
import { OUTPUT_GATE, physicalAngleFor, GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS } from '../src/geometry.js';
import { tokenTotal, tokenSeries, tokenNumber } from '../src/tokens.js';
import { configureStartingPosition, startingAnglesFor, ORIGINAL_START_MODE } from '../src/starting-position.js';
import { isSimulationSession, createSimulationRandom, playSimulationTurn, runSimulation } from '../src/simulation.js';

function session(starter = 0, levels = ['easy', 'normal'], geometryVersion = GEOMETRY_VERSION) {
  const game = configurePlayers(createGame(['IA 1', 'IA 2'], starter, geometryVersion), levels.map(level => ({ controller: 'ai', level })));
  game.starter = starter;
  game.series = createSeries(2, { id: 'test-simulation', firstStarter: starter });
  game.statsId = seriesGameId(game.series);
  return newSession(game);
}

function nearResult(starter = 0) {
  const state = session(starter);
  const face = state.game.faces[starter];
  face.queue = [];
  const total = tokenTotal(state.game.geometryVersion);
  face.exited = Array.from({ length: total - 1 }, (_, index) => index + 1);
  face.slots[4][2] = total;
  state.game.angles[4] = physicalAngleFor(starter, 5, 2, OUTPUT_GATE - 25, state.game.geometryVersion);
  return state;
}

test('simulation snapshot validation preserves ten unique tokens per face and rejects malformed worker states', () => {
  assert.equal(isSimulationSession(session()), true);
  assert.equal(isSimulationSession(nearResult()), true);
  const mutations = [
    state => { state.phase = 'unknown'; }, state => { state.recipient = 1; },
    state => { state.game.active = 2; }, state => { state.game.turn = 1.5; },
    state => { state.game.players[1].controller = 'human'; }, state => { state.game.players.push(state.game.players[0]); },
    state => { state.game.players[0].level = 'unknown'; }, state => { state.game.geometryVersion = 'old'; },
    state => { state.game.engaged = 6; }, state => { state.game.angles[0] = NaN; },
    state => { delete state.game.angles[1]; }, state => { state.game.faces[0].queue[4] = 4; },
    state => { state.game.faces[0].slots[0][0] = 1; }, state => { delete state.game.faces[0].slots[1]; },
    state => { delete state.game.faces[0].slots[1][0]; }, state => { state.game.statsId = 'wrong'; },
    state => { state.game.series.target = 1001; }, state => { state.phase = 'revealed-result'; },
  ];
  for (const mutation of mutations) {
    const state = session(); mutation(state);
    assert.equal(isSimulationSession(state), false, String(mutation));
    assert.throws(() => playSimulationTurn(state), TypeError);
  }
});

test('seeded easy randomness is reproducible and exposes a restorable unsigned state', () => {
  const first = createSimulationRandom(42);
  const second = createSimulationRandom(42);
  for (let index = 0; index < 50; index++) assert.equal(first(), second());
  assert.equal(first.state, second.state);
  assert.equal(first(), createSimulationRandom(second.state)());
  assert.equal(createSimulationRandom(-1).state, 4294967295);
  for (const seed of [NaN, Infinity, 1.2, '1', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => createSimulationRandom(seed), TypeError);
});

for (const startMode of ['classic', ORIGINAL_START_MODE]) for (const starter of [0, 1]) {
  test(`${startMode} headless turns exactly match the normal rules, revealed results and series counts from starter ${starter}`, () => {
    const actual = session(starter);
    configureStartingPosition(actual.game, { mode: startMode });
    const expected = structuredClone(actual);
    const random = createSimulationRandom(42);
    const comparisonRandom = createSimulationRandom(42);
    let played = 0;
    while (actual.phase !== 'revealed-result' && played < 260) {
      const player = expected.game.active;
      const view = getView(expected.game, player);
      const move = chooseAIMove(view, expected.game.players[player].level, { random: comparisonRandom });
      rotate(expected.game, move.wheel, move.localDelta * (player === 0 ? 1 : -1));
      transmit(expected);
      acceptReveal(expected);
      if (expected.phase === 'revealed-result') recordSeriesResult(expected);
      const step = playSimulationTurn(actual, { random, keepEvents: true });
      assert.deepEqual(step.move, move);
      assert.equal(step.turn, played + 1);
      assert.deepEqual(actual, expected);
      played++;
    }
    assert.equal(actual.phase, 'revealed-result');
    assert.equal(actual.game.series.completed, 1);
    assert.equal(actual.game.verdict.reason, 'complete');
  });
}

test('a full turn happens before a previously hidden result is announced', () => {
  const state = session();
  state.game.verdict = { winner: 1, reason: 'order', snapshot: { confidential: true } };
  const step = playSimulationTurn(state, { random: () => 0 });
  assert.equal(step.turn, 1);
  assert.ok(step.move);
  assert.equal(state.game.turn, 2);
  assert.equal(state.phase, 'revealed-result');
  assert.equal(state.game.verdict.winner, 1);
  assert.deepEqual(state.game.series.wins, [0, 1]);
});

test('passed results reveal and count once without moving, then remain idempotent', () => {
  const state = nearResult();
  const move = chooseAIMove(getView(state.game, 0), 'easy', { random: () => 0 });
  rotate(state.game, move.wheel, move.localDelta);
  transmit(state);
  assert.equal(state.phase, 'passed');
  const angles = [...state.game.angles];
  const step = playSimulationTurn(state);
  assert.equal(step.status, 'result');
  assert.equal(step.move, null);
  assert.equal(step.counted, true);
  assert.deepEqual(state.game.angles, angles);
  const saved = JSON.stringify(state);
  assert.equal(playSimulationTurn(state).counted, false);
  assert.equal(JSON.stringify(state), saved);
});

test('passed nonterminal states continue with the next actual AI turn', () => {
  const state = session();
  rotate(state.game, 1, 5);
  transmit(state);
  assert.equal(state.phase, 'passed');
  const step = playSimulationTurn(state, { random: () => 0 });
  assert.equal(step.player, 1);
  assert.equal(step.turn, 2);
  assert.equal(state.game.turn, 3);
});

test('batch history is bounded without losing the terminal snapshot or positions', () => {
  const state = nearResult();
  const step = playSimulationTurn(state, { random: () => 0 });
  assert.equal(step.status, 'result');
  assert.deepEqual(state.game.events, []);
  assert.deepEqual(state.game.faces[0].exited, Array.from({ length: 10 }, (_, index) => index + 1));
  assert.ok(state.game.verdict.snapshot.eventId >= 1);
  assert.equal(state.game.series.completed, 1);
});

test('N fresh games finish exactly once, alternate first player and reproduce the same seeded outcomes', async () => {
  const config = { count: 4, levels: ['easy', 'normal'], firstStarter: 1, seed: 321 };
  const report = await runSimulation(config);
  assert.deepEqual(report, await runSimulation(config));
  assert.equal(report.status, 'completed');
  assert.equal(report.completed, 4);
  assert.equal(report.results.length, 4);
  assert.equal(report.wins[0] + report.wins[1] + report.draws, 4);
  assert.deepEqual(report.results.map(result => result.starter), [1, 0, 1, 0]);
  assert.deepEqual(report.results.map(result => result.number), [1, 2, 3, 4]);
  assert.equal(report.totalTurns, report.results.reduce((sum, result) => sum + result.turns, 0));
  assert.equal(report.averageTurns, report.totalTurns / 4);
  assert.equal(report.unfinished, null);
  assert.equal(JSON.stringify(report).includes('faces'), false);
});

test('turn limits leave an explicitly unfinished match without inventing an outcome', async () => {
  const report = await runSimulation({ count: 3, maxTurns: 1 });
  assert.equal(report.status, 'incomplete');
  assert.equal(report.completed, 0);
  assert.deepEqual(report.wins, [0, 0]);
  assert.equal(report.draws, 0);
  assert.deepEqual(report.results, []);
  assert.deepEqual(report.unfinished, { round: 1, starter: 0, turns: 1, reason: 'turn-limit' });
});

test('cancellation before and during a match never credits it, and host yields remain controllable', async () => {
  const immediate = await runSimulation({ count: 2 }, { shouldStop: () => true });
  assert.equal(immediate.status, 'stopped');
  assert.equal(immediate.completed, 0);
  assert.equal(immediate.unfinished.turns, 0);
  let yields = 0;
  const report = await runSimulation({ count: 2 }, {
    yieldControl: async () => { yields++; }, shouldStop: () => yields >= 3,
  });
  assert.equal(report.status, 'stopped');
  assert.equal(report.completed, 0);
  assert.equal(report.unfinished.turns, 3);
  assert.equal(report.draws, 0);
});

test('a stop between finished games keeps credited results and starts no extra game', async () => {
  let stop = false;
  const report = await runSimulation({ count: 3 }, {
    onProgress: progress => { if (progress.completed === 1) stop = true; }, shouldStop: () => stop,
  });
  assert.equal(report.status, 'stopped');
  assert.equal(report.completed, 1);
  assert.equal(report.results.length, 1);
  assert.equal(report.unfinished, null);
});

test('progress copies cannot corrupt the authoritative counters or configuration', async () => {
  const report = await runSimulation({ count: 2, levels: ['easy', 'easy'] }, {
    onProgress: progress => { progress.wins[0] = 999; progress.levels[0] = 'hard'; progress.current.turns = 999; },
  });
  assert.equal(report.completed, 2);
  assert.equal(report.wins[0] + report.wins[1] + report.draws, 2);
  assert.deepEqual(report.levels, ['easy', 'easy']);
  assert.ok(report.results.every(result => result.turns < 999));
});

test('configuration and callback validation rejects invalid work before starting', async () => {
  for (const config of [{ count: 0 }, { count: 1001 }, { levels: ['easy'] }, { levels: ['easy', 'unknown'] },
    { firstStarter: 2 }, { seed: 1.5 }, { maxTurns: 0 }, { maxTurns: Infinity },
    { startMode: 'unknown' }, { startMode: null }, { geometryVersion: 'future' }, { geometryVersion: null }]) {
    await assert.rejects(runSimulation(config), TypeError);
  }
  for (const name of ['onProgress', 'shouldStop', 'yieldControl']) await assert.rejects(runSimulation({}, { [name]: true }), TypeError);
});

test('classic simulation remains the default with the original neutral pose', async () => {
  const config = { count: 2, levels: ['easy', 'normal'], seed: 42 };
  const implicit = await runSimulation(config);
  const explicit = await runSimulation({ ...config, startMode: 'classic' });
  assert.deepEqual(implicit, explicit);
  assert.equal(implicit.startMode, 'classic');
  assert.equal(implicit.positionCount, 1);
  assert.ok(implicit.results.every(result => !Object.hasOwn(result, 'startingAngles') && !Object.hasOwn(result, 'pair')));
  assert.deepEqual(session().game.angles, [0, 0, 0, 0, 0]);
});

test('original-v1 simulations complete real games from one fixed pose with both starters', async () => {
  const seen = [];
  const report = await runSimulation({ count: 2, levels: ['normal', 'normal'],
    firstStarter: 0, seed: 42, startMode: ORIGINAL_START_MODE }, {
    onProgress(progress) {
      seen.push(structuredClone(progress));
      progress.current.startingAngles[0] = -999;
    },
  });
  assert.equal(report.status, 'completed');
  assert.equal(report.completed, 2);
  assert.equal(report.startMode, 'original-v1');
  assert.equal(report.geometryVersion, 'ddc-v1.5');
  assert.equal(report.positionCount, 1);
  assert.deepEqual(report.results.map(result => result.starter), [0, 1]);
  assert.equal(report.wins[0] + report.wins[1] + report.draws, 2);
  for (const result of report.results) {
    assert.deepEqual(result.startingAngles, [348, 22, 116, 8, 31]);
    assert.equal(Object.hasOwn(result, 'pair'), false);
    assert.ok(result.turns > 1);
    assert.ok(['complete', 'order', 'draw'].includes(result.reason));
  }
  assert.ok(seen.every(progress => JSON.stringify(progress.current.startingAngles) === '[348,22,116,8,31]'));
  report.results[0].startingAngles[0] = -1;
  assert.deepEqual(report.results[1].startingAngles, [348, 22, 116, 8, 31]);
});

test('original-v1 simulations reject incompatible profiles before callbacks or work', async () => {
  for (const geometryVersion of SUPPORTED_GEOMETRY_VERSIONS.filter(version => version !== 'ddc-v1.5')) {
    let started = false;
    await assert.rejects(runSimulation({ startMode: ORIGINAL_START_MODE, geometryVersion }, {
      onProgress() { started = true; },
    }), /ddc-v1\.5/);
    assert.equal(started, false);
  }
});

test('varied simulations reproduce seeded starting pairs and isolate progress/result arrays', async () => {
  const config = { count: 4, levels: ['easy', 'normal'], firstStarter: 1, seed: 42, startMode: 'varied' };
  const seen = [];
  const report = await runSimulation(config, {
    onProgress(progress) {
      seen.push(structuredClone(progress));
      progress.startMode = 'classic';
      progress.positionCount = 999;
      progress.current.startingAngles[0] = -999;
      progress.current.pair = 999;
    },
  });
  assert.deepEqual(report, await runSimulation(config));
  assert.equal(report.status, 'completed');
  assert.equal(report.startMode, 'varied');
  assert.equal(report.positionCount, 2);
  assert.deepEqual(report.results.map(result => result.starter), [1, 0, 1, 0]);
  assert.deepEqual(report.results.map(result => result.pair), [1, 1, 2, 2]);
  for (const result of report.results) assert.deepEqual(result.startingAngles, startingAnglesFor(42, result.number));
  assert.notDeepEqual(report.results[0].startingAngles, report.results[2].startingAngles);
  assert.notEqual(report.results[0].startingAngles, report.results[1].startingAngles);
  assert.ok(seen.every(progress => progress.current.pair === Math.ceil(progress.current.round / 2) &&
    JSON.stringify(progress.current.startingAngles) === JSON.stringify(startingAnglesFor(42, progress.current.round))));
  assert.equal(report.geometryVersion, GEOMETRY_VERSION);
  const secondPose = [...report.results[1].startingAngles];
  report.results[0].startingAngles[0] = -1;
  assert.deepEqual(report.results[1].startingAngles, secondPose);
});

test('worker validation checks starting provenance without resetting a live position', () => {
  const state = session();
  configureStartingPosition(state.game, { mode: 'varied', seed: 42 }, 1);
  state.game.angles = [1, 2, 3, 4, 5];
  const before = structuredClone(state);
  assert.equal(isSimulationSession(state), true);
  assert.deepEqual(state, before);
  for (const change of [
    value => { value.game.startConfig.seed = -1; },
    value => { value.game.startConfig.mode = 'unknown'; },
    value => { value.game.startingAngles[0] += 1; },
    value => { delete value.game.startingAngles; },
    value => { delete value.game.startConfig; },
  ]) {
    const invalid = structuredClone(state);
    change(invalid);
    assert.equal(isSimulationSession(invalid), false);
  }
});

const cli = fileURLToPath(new URL('../scripts/simulate.mjs', import.meta.url));
function command(args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }

test('the CLI provides deterministic complete JSON without graphical dependencies', () => {
  const result = command(['--games', '2', '--ai1', 'easy', '--ai2', 'normal', '--seed', '42', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.completed, 2);
  assert.equal(report.seed, 42);
  assert.deepEqual(report.levels, ['easy', 'normal']);
  assert.equal(report.status, 'completed');
  assert.equal(report.startMode, 'classic');
  assert.equal(result.stderr, '');
});

test('the CLI distinguishes unfinished simulations from invalid arguments', () => {
  const incomplete = command(['--games', '2', '--max-turns', '1', '--json']);
  assert.equal(incomplete.status, 1);
  assert.equal(JSON.parse(incomplete.stdout).status, 'incomplete');
  for (const args of [['--games', '0'], ['--games', '1001'], ['--games', '1.5'], ['--games'], ['--ai1', 'unknown'],
    ['--seed', 'NaN'], ['--unknown'], ['--json', '--json'], ['--starts', 'unknown'],
    ['--starts'], ['--starts', 'classic', '--starts', 'varied']]) {
    const invalid = command(args);
    assert.equal(invalid.status, 2, args.join(' '));
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Erreur/);
  }
  assert.match(command(['--help']).stdout, /sans interface graphique/);
});

test('CLI varied starts report each paired position and preserve reproducibility', () => {
  const args = ['--games', '2', '--ai1', 'easy', '--ai2', 'normal', '--seed', '42', '--starts', 'varied', '--json'];
  const first = command(args);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, command(args).stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.startMode, 'varied');
  assert.equal(report.positionCount, 1);
  assert.deepEqual(report.results.map(result => result.pair), [1, 1]);
  assert.deepEqual(report.results[1].startingAngles, startingAnglesFor(42, 2, GEOMETRY_VERSION));
});

test('CLI original alias and canonical original-v1 produce identical explicit pose metadata', () => {
  const args = ['--games', '2', '--ai1', 'easy', '--ai2', 'normal', '--seed', '42', '--starts'];
  const alias = command([...args, 'original', '--json']);
  const canonical = command([...args, 'original-v1', '--json']);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(canonical.status, 0, canonical.stderr);
  assert.equal(alias.stdout, canonical.stdout);
  const report = JSON.parse(alias.stdout);
  assert.equal(report.startMode, 'original-v1');
  assert.equal(report.positionCount, 1);
  assert.deepEqual(report.results.map(result => result.starter), [0, 1]);
  assert.deepEqual(report.results.map(result => result.startingAngles),
    [[348, 22, 116, 8, 31], [348, 22, 116, 8, 31]]);
  assert.match(command(['--help']).stdout, /reconstitué estimé/);
});

test('headless snapshots and fresh simulations preserve supported legacy geometry without upgrading it', async () => {
  const game = configurePlayers(createGame(['A', 'B'], 0, LEGACY_GEOMETRY_VERSION), [
    { controller: 'ai', level: 'normal' }, { controller: 'ai', level: 'normal' },
  ]);
  const value = newSession(game);
  configureStartingPosition(game, { mode: 'varied', seed: 42 });
  assert.equal(isSimulationSession(value), true);
  const before = game.geometryVersion;
  assert.equal(playSimulationTurn(value).status, 'turn');
  assert.equal(game.geometryVersion, before);
  const report = await runSimulation({ count: 2, levels: ['easy', 'normal'], seed: 42,
    startMode: 'varied', geometryVersion: LEGACY_GEOMETRY_VERSION });
  assert.equal(report.geometryVersion, LEGACY_GEOMETRY_VERSION);
  assert.equal(report.positionCount, 1);
  assert.deepEqual(report.results[0].startingAngles, report.results[1].startingAngles);
});

test('headless validation preserves each supported profile and its exact token supply', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const value = session(0, ['easy', 'easy'], version);
    const total = tokenTotal(version);
    assert.equal(isSimulationSession(value), true);
    assert.equal(value.game.faces[0].queue.length, total);
    const outcome = playSimulationTurn(value, { random: () => 0 });
    assert.equal(outcome.status, 'turn');
    assert.equal(value.game.geometryVersion, version);
    for (const face of value.game.faces) {
      const ids = [...face.queue, ...face.exited, ...face.slots.flat().filter(token => token !== null)];
      assert.deepEqual(ids.sort((a, b) => a - b), Array.from({ length: total }, (_, index) => index + 1));
    }
    const missing = structuredClone(value);
    missing.game.faces[0].queue.pop();
    assert.equal(isSimulationSession(missing), false);
  }
});

test('a complete first series is not a terminal headless match while the second series remains', () => {
  const state = session(0, ['easy', 'easy']);
  const own = state.game.faces[0];
  own.queue = [6, 7, 8, 9, 10];
  own.exited = [1, 2, 3, 4, 5];
  assert.equal(isSimulationSession(state), true);
  const outcome = playSimulationTurn(state, { random: () => 0 });
  assert.equal(outcome.status, 'turn');
  assert.equal(state.phase, 'open');
  assert.equal(state.game.verdict, null);
  assert.equal(state.game.series.completed, 0);
  assert.equal(own.exited.length, 5);
  for (const lane of [0, 1]) {
    const numbers = own.exited.filter(token => tokenSeries(token) === lane).map(tokenNumber);
    assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => index + 1));
  }
});
