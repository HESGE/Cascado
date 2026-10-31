import test from 'node:test';
import assert from 'node:assert/strict';
import { getResultSound } from '../src/result-sound.js';
import { createSeries, seriesGameId } from '../src/series.js';

const player = controller => ({ controller });
function result({ controllers = ['human', 'human'], winner = 0, active = 0, recipient = active,
  phase = 'revealed-result', statsId = 'match-123', simulationMode = 'board' } = {}) {
  return { phase, recipient, game: { players: controllers.map(player), verdict: { winner }, active, statsId, simulationMode } };
}

test('an unrevealed session never reads its game or a hidden verdict', () => {
  for (const phase of ['open', 'passed', 'revealing', 'result', undefined]) {
    const session = { phase };
    Object.defineProperty(session, 'game', { get() { assert.fail('The hidden game must not be consulted'); } });
    assert.equal(getResultSound(session), null);
  }
  for (const session of [null, undefined, {}]) {
    assert.equal(getResultSound(session), null);
  }
});

test('hidden and Full presentation guards run before reading any revealed game', () => {
  const session = { phase: 'revealed-result' };
  Object.defineProperty(session, 'game', { get() { assert.fail('Suppressed music must not inspect the game'); } });
  assert.equal(getResultSound(session, { hidden: true }), null);
  assert.equal(getResultSound(session, { full: true }), null);
  assert.equal(getResultSound(session, { hidden: true, full: true }), null);
});

test('headless results remain silent without reading the verdict', () => {
  const session = result({ controllers: ['ai', 'ai'], simulationMode: 'headless' });
  Object.defineProperty(session.game, 'verdict', { get() { assert.fail('A headless result needs no music decision'); } });
  assert.equal(getResultSound(session), null);
});

test('a mixed match always uses the human perspective in either seat and regardless of the active AI', () => {
  for (const human of [0, 1]) for (const active of [0, 1]) for (const winner of [0, 1]) {
    const controllers = human === 0 ? ['human', 'ai'] : ['ai', 'human'];
    const session = result({ controllers, active, recipient: 1 - human, winner });
    assert.equal(getResultSound(session), winner === human ? 'victory' : 'defeat');
  }
});

test('two humans hear the announced result from the actual recipient perspective', () => {
  for (const recipient of [0, 1]) for (const winner of [0, 1]) {
    const session = result({ active: 1 - recipient, recipient, winner });
    assert.equal(getResultSound(session), winner === recipient ? 'victory' : 'defeat');
  }
  const missing = result({ active: 1, winner: 0 });
  delete missing.recipient;
  assert.equal(getResultSound(missing), 'defeat', 'old incomplete metadata can fall back to the active recipient');
  delete missing.game.active;
  assert.equal(getResultSound(missing), null);
});

test('old controller-free saves retain human-to-human result perspective', () => {
  const session = result({ recipient: 1, winner: 0 });
  session.game.players = [{ name: 'A' }, { name: 'B' }];
  assert.equal(getResultSound(session), 'defeat');
  session.game.verdict.winner = 1;
  assert.equal(getResultSound(session), 'victory');
});

test('AI spectators can celebrate either winner and all draws stay silent', () => {
  for (const winner of [0, 1]) for (const active of [0, 1]) {
    const session = result({ controllers: ['ai', 'ai'], winner, active });
    assert.equal(getResultSound(session), 'victory');
    assert.equal(getResultSound(session, { full: true }), null);
  }
  for (const controllers of [['human', 'human'], ['human', 'ai'], ['ai', 'human'], ['ai', 'ai']]) {
    assert.equal(getResultSound(result({ controllers, winner: null })), null);
  }
});

test('only the revealed winner and controller perspective matter, never private positions or reasons', () => {
  const session = result({ controllers: ['human', 'ai'], winner: 0, recipient: 1 });
  for (const key of ['faces', 'angles', 'events', 'series', 'turn', 'engaged']) {
    Object.defineProperty(session.game, key, { get() { assert.fail(`Private or unnecessary game field: ${key}`); } });
  }
  for (const key of ['snapshot', 'causes', 'reason']) {
    Object.defineProperty(session.game.verdict, key, { get() { assert.fail(`Unnecessary result detail: ${key}`); } });
  }
  assert.equal(getResultSound(session), 'victory');
});

function seriesResult({ target = 4, completed = target, wins = [3, 1], draws = 0 } = {}) {
  const session = result({ controllers: ['ai', 'ai'] });
  const series = createSeries(target, { id: 'result-comparison' });
  Object.assign(series, { completed, round: Math.max(1, completed), wins, draws, totalTurns: completed * 5,
    lastGameId: completed ? seriesGameId(series, completed) : null });
  session.game.series = series;
  Object.defineProperty(session.game, 'verdict', { get() { assert.fail('Series music must not depend on the final individual verdict'); } });
  return session;
}

test('AI series remain silent between rounds and celebrate only a decisive final series score', () => {
  for (const wins of [[3, 1], [1, 3]]) {
    assert.equal(getResultSound(seriesResult({ wins })), 'victory');
  }
  assert.equal(getResultSound(seriesResult({ wins: [2, 2] })), null);
  assert.equal(getResultSound(seriesResult({ wins: [0, 0], draws: 4 })), null);
  assert.equal(getResultSound(seriesResult({ completed: 2, wins: [2, 0] })), null);
  assert.equal(getResultSound(seriesResult({ completed: 3, wins: [3, 0] })), null,
    'even an already uncatchable lead stays silent until the actual final summary');
});

test('suppressed or malformed series never fall back to a last-round victory melody', () => {
  const final = seriesResult();
  assert.equal(getResultSound(final, { hidden: true }), null);
  assert.equal(getResultSound(final, { full: true }), null);
  final.game.simulationMode = 'headless';
  assert.equal(getResultSound(final), null);
  for (const change of [
    series => { series.wins = [-1, 5]; },
    series => { series.wins = [1, 1]; },
    series => { series.completed = series.target + 1; },
    series => { series.round = 1; },
    series => { series.lastGameId = 'unrelated-round'; },
  ]) {
    const invalid = seriesResult();
    change(invalid.game.series);
    assert.equal(getResultSound(invalid), null);
  }
});

test('frozen saves are not changed and malformed announced results stay silent', () => {
  const session = result({ controllers: ['ai', 'human'], winner: 1, statsId: 'frozen-game' });
  const before = structuredClone(session);
  session.game.players.forEach(Object.freeze);
  Object.freeze(session.game.players); Object.freeze(session.game.verdict);
  Object.freeze(session.game); Object.freeze(session);
  assert.equal(getResultSound(session), 'victory');
  assert.deepEqual(session, before);
  for (const winner of [undefined, '0', 2, -1, NaN]) {
    const malformed = result();
    malformed.game.verdict.winner = winner;
    assert.equal(getResultSound(malformed), null);
  }
  assert.equal(getResultSound({ phase: 'revealed-result' }), null);
  const absent = result(); absent.game.verdict = null;
  assert.equal(getResultSound(absent), null);
  absent.game.players = [];
  assert.equal(getResultSound(absent), null);
});
