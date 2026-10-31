import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStatistics, normalizeStatistics, recordStatistics, validStatisticsGame } from '../src/statistics.js';

const player = (name, controller = 'human', level = 'normal') => ({ name, controller, level });
const finished = (options = {}) => ({
  statsId: 'completed-game',
  turn: 8,
  players: [player('Camille'), player('Léa', 'ai')],
  verdict: { winner: 0, reason: 'complete' },
  ...options,
});
const profile = (statistics, name, controller = 'human', level = null) => statistics.profiles.find(item =>
  item.name === name && item.controller === controller && item.level === level);

test('statistics start empty with independent arrays and counters', () => {
  const first = emptyStatistics();
  first.modes.humanAI = 9;
  first.profiles.push({});
  assert.deepEqual(emptyStatistics(), {
    version: 1, totalGames: 0, totalTurns: 0,
    modes: { humanHuman: 0, humanAI: 0, aiAI: 0 }, profiles: [],
  });
});

test('a revealed win credits the winner and loser, with completed turns', () => {
  const stats = recordStatistics(emptyStatistics(), finished());
  assert.equal(stats.totalGames, 1);
  assert.equal(stats.totalTurns, 7);
  assert.deepEqual(stats.modes, { humanHuman: 0, humanAI: 1, aiAI: 0 });
  assert.deepEqual([profile(stats, 'Camille').played, profile(stats, 'Camille').wins, profile(stats, 'Camille').losses], [1, 1, 0]);
  assert.deepEqual([profile(stats, 'Léa', 'ai', 'normal').played, profile(stats, 'Léa', 'ai', 'normal').wins,
    profile(stats, 'Léa', 'ai', 'normal').losses], [1, 0, 1]);
});

test('the seat order does not determine a profile identity or winner', () => {
  const first = recordStatistics(emptyStatistics(), finished());
  const second = recordStatistics(first, finished({ statsId: 'second',
    players: [player('Léa', 'ai'), player('Camille')], verdict: { winner: 1, reason: 'order' },
  }));
  assert.equal(second.profiles.length, 2);
  assert.equal(profile(second, 'Camille').played, 2);
  assert.equal(profile(second, 'Camille').wins, 2);
  assert.equal(profile(second, 'Léa', 'ai', 'normal').losses, 2);
});

test('an order failure credits the actual opponent, independently of the active seat', () => {
  const stats = recordStatistics(emptyStatistics(), finished({ active: 0, verdict: { winner: 1, reason: 'order' } }));
  assert.equal(profile(stats, 'Camille').losses, 1);
  assert.equal(profile(stats, 'Léa', 'ai', 'normal').wins, 1);
});

test('a draw credits a draw to each participant without adding wins or losses', () => {
  const stats = recordStatistics(emptyStatistics(), finished({ verdict: { winner: null, reason: 'draw' } }));
  assert.equal(stats.totalGames, 1);
  for (const participant of stats.profiles) {
    assert.deepEqual([participant.played, participant.wins, participant.losses, participant.draws], [1, 0, 0, 1]);
  }
});

test('the three match modes accumulate independently', () => {
  let stats = emptyStatistics();
  for (const controllers of [['human', 'human'], ['ai', 'human'], ['ai', 'ai']]) {
    stats = recordStatistics(stats, finished({ players: [player('A', controllers[0]), player('B', controllers[1])] }));
  }
  assert.equal(stats.totalGames, 3);
  assert.deepEqual(stats.modes, { humanHuman: 1, humanAI: 1, aiAI: 1 });
});

test('profile names are trimmed, case insensitive and canonically normalized', () => {
  const first = recordStatistics(emptyStatistics(), finished({ players: [player('  Léa  '), player('Robot', 'ai')] }));
  const second = recordStatistics(first, finished({ players: [player('LE\u0301A'), player('robot', 'ai')] }));
  assert.equal(second.profiles.length, 2);
  assert.equal(profile(second, 'Léa').played, 2);
  assert.equal(profile(second, 'Robot', 'ai', 'normal').played, 2);
});

test('controller kind and AI level distinguish otherwise identical names', () => {
  let stats = emptyStatistics();
  for (const level of ['easy', 'normal', 'hard']) {
    stats = recordStatistics(stats, finished({ players: [player('Alex', 'human', level), player('Alex', 'ai', level)] }));
  }
  assert.equal(stats.profiles.length, 4);
  assert.equal(profile(stats, 'Alex').played, 3);
  for (const level of ['easy', 'normal', 'hard']) assert.equal(profile(stats, 'Alex', 'ai', level).played, 1);
});

test('legacy player options safely default to human and normal AI level', () => {
  const stats = recordStatistics(emptyStatistics(), finished({ players: [{ name: 'Camille' }, { name: 'Bot', controller: 'ai', level: 'future' }] }));
  assert.equal(profile(stats, 'Camille').controller, 'human');
  assert.equal(profile(stats, 'Bot', 'ai', 'normal').level, 'normal');
});

test('identical profiles in both seats merge both participations', () => {
  const stats = recordStatistics(emptyStatistics(), finished({ players: [player('Alex'), player(' alex ')] }));
  assert.equal(stats.profiles.length, 1);
  assert.deepEqual([stats.profiles[0].played, stats.profiles[0].wins, stats.profiles[0].losses], [2, 1, 1]);
});

test('aggregation does not mutate its inputs or retain private game data', () => {
  const before = recordStatistics(emptyStatistics(), finished());
  const original = structuredClone(before);
  const game = finished({ statsId: 'next', secret: 'private', verdict: { winner: 0, reason: 'complete', snapshot: { secret: 7 } } });
  Object.defineProperty(game, 'faces', { get() { throw new Error('Private token positions were accessed'); } });
  Object.defineProperty(game, 'events', { get() { throw new Error('Private events were accessed'); } });
  const next = recordStatistics(before, game);
  assert.deepEqual(before, original);
  next.profiles[0].wins = 999;
  assert.deepEqual(before, original);
  assert.equal(JSON.stringify(recordStatistics(before, game)).includes('secret'), false);
  assert.deepEqual(Object.keys(recordStatistics(before, game)).sort(), ['modes', 'profiles', 'totalGames', 'totalTurns', 'version']);
});

test('incomplete, malformed and contradictory outcomes are ignored', () => {
  const invalid = [
    null, {}, finished({ statsId: undefined }), finished({ statsId: ' ' }), finished({ statsId: 'a'.repeat(129) }),
    finished({ turn: 1 }), finished({ turn: 2.5 }), finished({ turn: Infinity }), finished({ players: [] }),
    finished({ players: [player(' '), player('B')] }), finished({ players: [null, player('B')] }),
    finished({ verdict: null }), finished({ verdict: { winner: 0, reason: 'draw' } }),
    finished({ verdict: { winner: null, reason: 'complete' } }), finished({ verdict: { winner: 2, reason: 'order' } }),
    finished({ verdict: { winner: 0, reason: 'unknown' } }),
  ];
  for (const game of invalid) {
    assert.equal(validStatisticsGame(game), false);
    assert.deepEqual(recordStatistics(emptyStatistics(), game), emptyStatistics());
  }
});

test('stored statistics are validated and copied without sharing nested values', () => {
  const stats = recordStatistics(emptyStatistics(), finished());
  const copy = normalizeStatistics(stats);
  copy.profiles[0].wins = 42;
  copy.modes.humanAI = 10;
  assert.equal(stats.profiles[0].wins, 1);
  assert.equal(stats.modes.humanAI, 1);
  for (const invalid of [
    { ...stats, version: 99 }, { ...stats, totalGames: -1 }, { ...stats, totalTurns: NaN },
    { ...stats, modes: { humanHuman: 0, humanAI: 0, aiAI: 0 } },
    { ...stats, profiles: [...stats.profiles, stats.profiles[0]] },
    { ...stats, profiles: [{ ...stats.profiles[0], key: 'unrelated' }, stats.profiles[1]] },
    { ...stats, profiles: [{ ...stats.profiles[0], played: 99 }, stats.profiles[1]] },
    { ...stats, profiles: [] },
  ]) assert.throws(() => normalizeStatistics(invalid), TypeError);
});
