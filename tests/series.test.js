import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine.js';
import { configurePlayers } from '../src/players.js';
import { configureStartingPosition, startingAnglesFor, ORIGINAL_START_MODE } from '../src/starting-position.js';
import { PREVIOUS_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS } from '../src/geometry.js';
import { tokenTotal } from '../src/tokens.js';
import { createSeries, seriesOf, seriesGameId, parseSeriesCount,
  recordSeriesResult, createNextSeriesGame } from '../src/series.js';

function match(target = 3, firstStarter = 0) {
  const game = configurePlayers(createGame(['IA Facile', 'IA Difficile'], firstStarter), [
    { controller: 'ai', level: 'easy' }, { controller: 'ai', level: 'hard' },
  ]);
  game.series = createSeries(target, { id: 'stable-series', firstStarter });
  game.statsId = seriesGameId(game.series);
  return game;
}

function finished(game = match(), winner = 0, turns = 7) {
  game.turn = turns + 1;
  game.verdict = winner === null ? { reason: 'draw', winner: null } : { reason: 'complete', winner };
  return { game, phase: 'revealed-result', recipient: game.active };
}

test('a simulation count accepts only whole decimal values between 1 and 1000', () => {
  for (const value of [1, 10, 1000, '1', '10', '1000', '0010']) {
    assert.equal(parseSeriesCount(value), Number(value));
  }
  for (const value of [undefined, null, false, true, {}, [], '', ' ', ' 10', '10 ',
    '1.0', '1e2', '+10', '-1', '1,000', 0, '0', -1, 1001, '1001', 2.2, Infinity, NaN]) {
    assert.equal(parseSeriesCount(value), null, String(value));
  }
});

test('new series require a safe identity, bounded count and explicit valid starter', () => {
  const series = createSeries('1000', { id: 'uuid_like-123', firstStarter: 1 });
  assert.deepEqual(series, { version: 1, id: 'uuid_like-123', target: 1000, firstStarter: 1,
    completed: 0, wins: [0, 0], draws: 0, totalTurns: 0, round: 1, lastGameId: null });
  assert.equal(seriesGameId(series), 'series:uuid_like-123:1');
  assert.equal(seriesGameId(series, 1000), 'series:uuid_like-123:1000');
  for (const options of [undefined, {}, { id: '' }, { id: 'with:separator' }, { id: 'with space' },
    { id: 'x'.repeat(97) }, { id: 'ok', firstStarter: '0' }, { id: 'ok', firstStarter: 2 }]) {
    assert.throws(() => createSeries(1, options), TypeError);
  }
  for (const count of [0, 1001, 1.1]) assert.throws(() => createSeries(count, { id: 'ok' }), TypeError);
});

test('series state is copied and only available for two AI seats', () => {
  const game = match();
  const copy = seriesOf(game);
  copy.wins[0] = 99;
  copy.round = 3;
  assert.deepEqual(game.series.wins, [0, 0]);
  assert.equal(game.series.round, 1);
  for (const seat of [0, 1]) {
    const humanGame = match();
    humanGame.players[seat].controller = 'human';
    assert.equal(seriesOf(humanGame), null);
  }
  for (const invalid of [null, {}, { players: [] }, { players: [{ controller: 'ai' }] }]) {
    assert.equal(seriesOf(invalid), null);
  }
});

test('malformed stored counters cannot resume or advance a series', () => {
  const invalidStates = [
    { version: 2 }, { id: '' }, { target: '3' }, { target: 0 }, { target: 1001 },
    { completed: -1 }, { completed: 2 }, { wins: [0] }, { wins: [0, -1] }, { wins: [1, 0] },
    { draws: 1 }, { totalTurns: -1 }, { totalTurns: Infinity }, { round: 0 }, { round: 4 },
    { firstStarter: '0' }, { lastGameId: 'unexpected' },
  ];
  for (const invalid of invalidStates) {
    const game = match();
    Object.assign(game.series, invalid);
    assert.equal(seriesOf(game), null, JSON.stringify(invalid));
    assert.equal(recordSeriesResult(finished(game)), false);
    assert.equal(createNextSeriesGame(game), null);
  }
});

test('the current public winner is credited once, including order failures', () => {
  for (const winner of [0, 1]) {
    const session = finished(match(), winner, 9);
    session.game.verdict.reason = 'order';
    const beforeGame = structuredClone(session.game);
    assert.equal(recordSeriesResult(session), true);
    assert.deepEqual(session.game.series.wins, winner ? [0, 1] : [1, 0]);
    assert.equal(session.game.series.completed, 1);
    assert.equal(session.game.series.totalTurns, 9);
    assert.equal(session.game.series.lastGameId, session.game.statsId);
    assert.deepEqual({ ...session.game, series: beforeGame.series }, beforeGame);
    assert.equal(recordSeriesResult(session), false);
    assert.equal(session.game.series.completed, 1);
  }
});

test('a draw is counted separately without a winner', () => {
  const session = finished(match(), null, 2);
  assert.equal(recordSeriesResult(session), true);
  assert.deepEqual(session.game.series.wins, [0, 0]);
  assert.equal(session.game.series.draws, 1);
  assert.equal(session.game.series.totalTurns, 2);
});

test('open and passed sessions cannot access or count a hidden verdict', () => {
  for (const phase of ['open', 'passed', undefined]) {
    const game = match();
    Object.defineProperty(game, 'verdict', { get() { throw new Error('Private verdict accessed'); } });
    assert.equal(recordSeriesResult({ game, phase }), false);
    assert.deepEqual(seriesOf(game), createSeries(3, { id: 'stable-series' }));
  }
  assert.equal(recordSeriesResult(null), false);
});

test('missing identities and malformed public outcomes cannot be counted', () => {
  for (const overrides of [
    { statsId: undefined }, { statsId: 'different-game' }, { turn: 1 }, { turn: 2.5 },
    { verdict: null }, { verdict: { winner: 0, reason: 'draw' } },
    { verdict: { winner: null, reason: 'complete' } }, { verdict: { winner: 2, reason: 'order' } },
  ]) {
    const session = finished();
    Object.assign(session.game, overrides);
    const original = structuredClone(session.game.series);
    assert.equal(recordSeriesResult(session), false);
    assert.deepEqual(session.game.series, original);
  }
});

test('next rounds reset all mechanics but retain seats, levels and series totals', () => {
  const session = finished(match(3, 1), 1, 12);
  session.game.simulationMode = 'headless';
  session.game.angles = [1, 2, 3, 4, 5];
  session.game.faces[0].queue = [];
  session.game.faces[1].exited = [1, 2];
  session.game.events.push({ secret: 'history' });
  session.game.engaged = 5;
  session.game.lastWheel = 4;
  recordSeriesResult(session);
  const original = structuredClone(session.game);
  const next = createNextSeriesGame(session.game);
  assert.deepEqual(session.game, original);
  assert.deepEqual(next.players, session.game.players);
  assert.equal(next.active, 0);
  assert.equal(next.starter, next.active);
  assert.equal(next.simulationMode, 'headless');
  assert.equal(next.turn, 1);
  assert.equal(next.engaged, null);
  assert.equal(next.lastWheel, null);
  assert.equal(next.verdict, null);
  assert.deepEqual(next.angles, [0, 0, 0, 0, 0]);
  assert.deepEqual(next.events, []);
  assert.deepEqual(next.faces, createGame().faces);
  assert.deepEqual(next.series, { ...session.game.series, round: 2 });
  assert.equal(next.statsId, 'series:stable-series:2');
  next.series.wins[1] = 99;
  assert.deepEqual(session.game.series.wins, [0, 1]);
});

test('each first starter alternates and exactly N games can be counted', () => {
  for (const firstStarter of [0, 1]) {
    for (const target of [1, 2, 7, 1000]) {
      let game = match(target, firstStarter);
      let turns = 0;
      for (let round = 1; round <= target; round += 1) {
        assert.equal(game.active, firstStarter ^ ((round - 1) % 2));
        assert.equal(game.series.round, round);
        assert.equal(game.statsId, `series:stable-series:${round}`);
        const completedTurns = round + 1;
        turns += completedTurns;
        assert.equal(recordSeriesResult(finished(game, round % 3 === 0 ? null : round % 2, completedTurns)), true);
        assert.equal(game.series.completed, round);
        assert.equal(game.series.totalTurns, turns);
        assert.equal(game.series.wins[0] + game.series.wins[1] + game.series.draws, round);
        const next = createNextSeriesGame(game);
        if (round === target) assert.equal(next, null);
        else { assert.ok(next); game = next; }
      }
    }
  }
});

test('reloads and repeated next-round attempts keep identities and do not recount', () => {
  const session = finished(match(2), 0, 6);
  recordSeriesResult(session);
  const restored = JSON.parse(JSON.stringify(session));
  assert.equal(recordSeriesResult(restored), false);
  const firstAttempt = createNextSeriesGame(restored.game);
  const retry = createNextSeriesGame(JSON.parse(JSON.stringify(session.game)));
  assert.deepEqual(firstAttempt, retry);
  assert.equal(firstAttempt.statsId, 'series:stable-series:2');
  assert.equal(firstAttempt.starter, 1);
  assert.equal(JSON.parse(JSON.stringify(firstAttempt)).starter, firstAttempt.active);
  const nextSession = JSON.parse(JSON.stringify(finished(firstAttempt, 1, 4)));
  assert.equal(recordSeriesResult(nextSession), true);
  assert.deepEqual(nextSession.game.series.wins, [1, 1]);
  assert.equal(nextSession.game.series.totalTurns, 10);
  assert.equal(createNextSeriesGame(nextSession.game), null);
});

test('the durable starter follows the alternation across two renewed rounds', () => {
  let game = match(3, 1);
  for (const expectedStarter of [0, 1]) {
    recordSeriesResult(finished(game));
    game = JSON.parse(JSON.stringify(createNextSeriesGame(game)));
    assert.equal(game.starter, expectedStarter);
    assert.equal(game.active, game.starter);
  }
});

test('an unfinished, unrecorded or mismatched round never creates another game', () => {
  assert.equal(createNextSeriesGame(match()), null);
  const unrecorded = finished().game;
  assert.equal(createNextSeriesGame(unrecorded), null);
  recordSeriesResult({ game: unrecorded, phase: 'revealed-result' });
  unrecorded.statsId = 'not-the-counted-game';
  assert.equal(createNextSeriesGame(unrecorded), null);
  unrecorded.statsId = unrecorded.series.lastGameId;
  unrecorded.verdict = null;
  assert.equal(createNextSeriesGame(unrecorded), null);
});

test('series aggregation and renewal never read old token positions or movements', () => {
  const session = finished();
  for (const key of ['faces', 'events']) {
    Object.defineProperty(session.game, key, { get() { throw new Error(`Private data accessed: ${key}`); } });
  }
  for (const key of ['snapshot', 'causes']) {
    Object.defineProperty(session.game.verdict, key, { get() { throw new Error(`Private result details accessed: ${key}`); } });
  }
  assert.equal(recordSeriesResult(session), true);
  assert.ok(createNextSeriesGame(session.game));
  assert.equal(JSON.stringify(seriesOf(session.game)).includes('secret'), false);
});

test('turn totals cannot overflow while recording a round', () => {
  const session = finished(match(3), 0, 1);
  recordSeriesResult(session);
  const next = createNextSeriesGame(session.game);
  next.series.totalTurns = Number.MAX_SAFE_INTEGER;
  const nextSession = finished(next, 1, 1);
  const before = structuredClone(next.series);
  assert.equal(recordSeriesResult(nextSession), false);
  assert.deepEqual(next.series, before);
});

test('varied series replay each starting position with both starters, then change the position', () => {
  let game = match(5, 1);
  configureStartingPosition(game, { mode: 'varied', seed: 42 }, 1);
  const positions = [];
  for (let round = 1; round <= 5; round += 1) {
    assert.deepEqual(game.startConfig, { mode: 'varied', seed: 42 });
    assert.deepEqual(game.startingAngles, startingAnglesFor(42, round));
    assert.deepEqual(game.angles, game.startingAngles);
    assert.notEqual(game.angles, game.startingAngles, 'live and initial angles are separate arrays');
    assert.equal(game.active, 1 ^ ((round - 1) % 2));
    positions.push([...game.startingAngles]);
    game.angles[2] = 123;
    const value = finished(game);
    assert.equal(recordSeriesResult(value), true);
    const before = structuredClone(game);
    const next = createNextSeriesGame(game);
    assert.deepEqual(game, before, 'preparing the following round leaves history intact');
    if (round < 5) game = next;
    else assert.equal(next, null);
  }
  assert.deepEqual(positions[0], positions[1]);
  assert.deepEqual(positions[2], positions[3]);
  assert.notDeepEqual(positions[0], positions[2]);
  assert.notDeepEqual(positions[2], positions[4]);
});

test('varied next-round retries reproduce independent metadata and reject corrupted starting provenance', () => {
  const game = match(3);
  configureStartingPosition(game, { mode: 'varied', seed: 42 }, 1);
  recordSeriesResult(finished(game));
  const first = createNextSeriesGame(game);
  const retry = createNextSeriesGame(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(first, retry);
  first.startConfig.seed = 99;
  first.startingAngles[0] = 1;
  assert.equal(game.startConfig.seed, 42);
  assert.deepEqual(retry.startingAngles, startingAnglesFor(42, 2));
  for (const change of [
    value => { value.startConfig.seed = -1; },
    value => { value.startingAngles[0] += 1; },
    value => { delete value.startConfig; },
    value => { delete value.startingAngles; },
  ]) {
    const corrupted = structuredClone(game);
    change(corrupted);
    assert.equal(createNextSeriesGame(corrupted), null);
  }
});

test('original-v1 series preserve the reconstructed pose across renewed games and alternate the starter', () => {
  let game = configureStartingPosition(match(3, 1), { mode: ORIGINAL_START_MODE });
  for (let round = 1; round <= 3; round++) {
    assert.equal(game.active, 1 ^ ((round - 1) % 2));
    assert.deepEqual(game.angles, [348, 22, 116, 8, 31]);
    assert.deepEqual(game.startingAngles, [348, 22, 116, 8, 31]);
    assert.deepEqual(game.startConfig, { mode: 'original-v1', seed: 1 });
    game.angles[4] = 123;
    assert.equal(recordSeriesResult(finished(game)), true);
    const before = structuredClone(game);
    const next = createNextSeriesGame(JSON.parse(JSON.stringify(game)));
    assert.deepEqual(game, before);
    if (round === 3) assert.equal(next, null);
    else {
      assert.notEqual(next.startingAngles, game.startingAngles);
      assert.notEqual(next.startConfig, game.startConfig);
      game = next;
    }
  }
});

test('renewed series keep all three stored mechanical profiles and their associated starting protocol', () => {
  for (const geometryVersion of SUPPORTED_GEOMETRY_VERSIONS) {
    const game = configurePlayers(createGame(['A', 'B'], 0, geometryVersion), [
      { controller: 'ai', level: 'hard' }, { controller: 'ai', level: 'hard' },
    ]);
    game.series = createSeries(2, { id: 'profile-test' });
    game.statsId = seriesGameId(game.series);
    configureStartingPosition(game, { mode: 'varied', seed: 42 }, 1);
    recordSeriesResult(finished(game));
    const next = createNextSeriesGame(game);
    assert.equal(next.geometryVersion, geometryVersion);
    assert.equal(next.faces[0].queue.length, tokenTotal(geometryVersion));
    assert.deepEqual(next.startingAngles, startingAnglesFor(42, 2, geometryVersion));
    if (geometryVersion === PREVIOUS_GEOMETRY_VERSION) assert.notDeepEqual(next.startingAngles, game.startingAngles);
    else assert.deepEqual(next.startingAngles, game.startingAngles);
  }
  const unknown = match(2);
  recordSeriesResult(finished(unknown));
  unknown.geometryVersion = 'future';
  assert.equal(createNextSeriesGame(unknown), null);
});
