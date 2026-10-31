import { playerSettings } from './players.js';

const VERSION = 1;
const MODES = ['humanHuman', 'humanAI', 'aiAI'];
const COUNTERS = ['played', 'wins', 'losses', 'draws'];
const count = value => Number.isSafeInteger(value) && value >= 0;

/** Public totals only. Token positions, movements and private verdicts stay out. */
export function emptyStatistics() {
  return {
    version: VERSION,
    totalGames: 0,
    totalTurns: 0,
    modes: { humanHuman: 0, humanAI: 0, aiAI: 0 },
    profiles: [],
  };
}

function profileFor(player) {
  const { controller, level } = playerSettings(player);
  const name = player.name.normalize('NFC').trim();
  const aiLevel = controller === 'ai' ? level : null;
  return {
    key: JSON.stringify([controller, name.toLowerCase(), aiLevel]),
    name,
    controller,
    level: aiLevel,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
  };
}

/** A valid identity plus a terminal, already announced game can be counted. */
export function validStatisticsGame(game) {
  if (!game || typeof game.statsId !== 'string' || !game.statsId.trim() || game.statsId.length > 128 ||
      !Number.isSafeInteger(game.turn) || game.turn < 2 ||
      !Array.isArray(game.players) || game.players.length !== 2 ||
      !game.players.every(player => player && typeof player.name === 'string' && player.name.trim())) return false;
  const verdict = game.verdict;
  return Boolean(verdict && (
    (verdict.reason === 'draw' && verdict.winner === null) ||
    (['complete', 'order'].includes(verdict.reason) && [0, 1].includes(verdict.winner))
  ));
}

/** Validate and copy stored counters rather than silently overwriting bad data. */
export function normalizeStatistics(value) {
  if (value === undefined || value === null) return emptyStatistics();
  if (value.version !== VERSION || !count(value.totalGames) || !count(value.totalTurns) ||
      !value.modes || !MODES.every(mode => count(value.modes[mode])) ||
      MODES.reduce((sum, mode) => sum + value.modes[mode], 0) !== value.totalGames ||
      !Array.isArray(value.profiles)) throw new TypeError('Les statistiques locales sont incompatibles.');
  const keys = new Set();
  const profiles = value.profiles.map(profile => {
    if (!profile || typeof profile.name !== 'string' || !profile.name.trim() ||
        !['human', 'ai'].includes(profile.controller) ||
        (profile.controller === 'human' ? profile.level !== null : !['easy', 'normal', 'hard'].includes(profile.level)) ||
        !COUNTERS.every(key => count(profile[key])) ||
        profile.wins + profile.losses + profile.draws !== profile.played) {
      throw new TypeError('Un profil statistique local est incompatible.');
    }
    const normalized = profileFor(profile);
    if (profile.key !== normalized.key || keys.has(profile.key)) {
      throw new TypeError('Un profil statistique local est incompatible.');
    }
    keys.add(profile.key);
    for (const key of COUNTERS) normalized[key] = profile[key];
    return normalized;
  });
  if (profiles.reduce((sum, profile) => sum + profile.played, 0) !== value.totalGames * 2) {
    throw new TypeError('Les participations locales sont incompatibles.');
  }
  return {
    version: VERSION,
    totalGames: value.totalGames,
    totalTurns: value.totalTurns,
    modes: Object.fromEntries(MODES.map(mode => [mode, value.modes[mode]])),
    profiles,
  };
}

/** Pure aggregation. Storage owns the atomic, persistent game-ID deduplication. */
export function recordStatistics(statistics, game) {
  const next = normalizeStatistics(statistics);
  if (!validStatisticsGame(game)) return next;
  const players = game.players.map(profileFor);
  const aiCount = players.filter(player => player.controller === 'ai').length;
  next.totalGames += 1;
  // The final endTurn has already advanced the turn number before revelation.
  next.totalTurns += game.turn - 1;
  next.modes[MODES[aiCount]] += 1;
  for (let seat = 0; seat < 2; seat++) {
    const player = players[seat];
    let profile = next.profiles.find(existing => existing.key === player.key);
    if (!profile) { profile = player; next.profiles.push(profile); }
    profile.played += 1;
    if (game.verdict.winner === null) profile.draws += 1;
    else if (game.verdict.winner === seat) profile.wins += 1;
    else profile.losses += 1;
  }
  return next;
}
