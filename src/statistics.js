import { playerSettings } from './players.js';
import { getGameSet, gameSetIdForGeometry, isValidGameSet } from './game-sets.js';

const VERSION = 1;
const MODES = ['humanHuman', 'humanAI', 'aiAI'];
const COUNTERS = ['played', 'wins', 'losses', 'draws'];
const count = value => Number.isSafeInteger(value) && value >= 0;

/** Public totals only. Token positions, movements and private verdicts stay out. */
function emptyTotals() {
  return {
    totalGames: 0,
    totalTurns: 0,
    modes: { humanHuman: 0, humanAI: 0, aiAI: 0 },
    profiles: [],
  };
}

export function emptyStatistics() {
  return { version: VERSION, ...emptyTotals(), gameSets: [] };
}

function setForGame(game) {
  try {
    if (game.geometryVersion !== undefined && !isValidGameSet(game)) return null;
    return getGameSet(game.gameSetId === undefined ? (game.geometryVersion === undefined
      ? 'reference' : gameSetIdForGeometry(game.geometryVersion)) : game.gameSetId);
  } catch { return null; }
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
      !game.players.every(player => player && typeof player.name === 'string' && player.name.trim()) ||
      !setForGame(game)) return false;
  const verdict = game.verdict;
  return Boolean(verdict && (
    (verdict.reason === 'draw' && verdict.winner === null) ||
    (['complete', 'order'].includes(verdict.reason) && [0, 1].includes(verdict.winner))
  ));
}

/** Validate and copy stored counters rather than silently overwriting bad data. */
function normalizeTotals(value) {
  if (!value || !count(value.totalGames) || !count(value.totalTurns) ||
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
    totalGames: value.totalGames,
    totalTurns: value.totalTurns,
    modes: Object.fromEntries(MODES.map(mode => [mode, value.modes[mode]])),
    profiles,
  };
}

/** Legacy counters predate the Miroir 50 release and belong only to Référence. */
export function normalizeStatistics(value) {
  if (value === undefined || value === null) return emptyStatistics();
  if (value.version !== VERSION) throw new TypeError('Les statistiques locales sont incompatibles.');
  const totals = normalizeTotals(value);
  let gameSets;
  if (value.gameSets === undefined) {
    const reference = getGameSet('reference');
    gameSets = totals.totalGames ? [{ id: reference.id, label: reference.label, ...normalizeTotals(totals) }] : [];
  } else {
    if (!Array.isArray(value.gameSets)) throw new TypeError('Les statistiques des sets sont incompatibles.');
    const ids = new Set();
    gameSets = value.gameSets.map(group => {
      if (!group || typeof group.id !== 'string' || ids.has(group.id)) {
        throw new TypeError('Un set statistique local est incompatible.');
      }
      let definition;
      try { definition = getGameSet(group.id); }
      catch { throw new TypeError('Un set statistique local est incompatible.'); }
      ids.add(definition.id);
      return { id: definition.id, label: definition.label, ...normalizeTotals(group) };
    });
    const sum = key => gameSets.reduce((total, group) => total + group[key], 0);
    if (sum('totalGames') !== totals.totalGames || sum('totalTurns') !== totals.totalTurns ||
        MODES.some(mode => gameSets.reduce((total, group) => total + group.modes[mode], 0) !== totals.modes[mode])) {
      throw new TypeError('Les totaux des sets statistiques sont incompatibles.');
    }
    const participation = new Map();
    for (const group of gameSets) for (const profile of group.profiles) {
      const combined = participation.get(profile.key) ?? Object.fromEntries(COUNTERS.map(key => [key, 0]));
      for (const key of COUNTERS) combined[key] += profile[key];
      participation.set(profile.key, combined);
    }
    if (participation.size !== totals.profiles.length || totals.profiles.some(profile =>
      !participation.has(profile.key) || COUNTERS.some(key => participation.get(profile.key)[key] !== profile[key]))) {
      throw new TypeError('Les profils des sets statistiques sont incompatibles.');
    }
  }
  return { version: VERSION, ...totals, gameSets };
}

function recordTotals(next, game) {
  const players = game.players.map(profileFor);
  const aiCount = players.filter(player => player.controller === 'ai').length;
  next.totalGames += 1;
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
}

/** Pure aggregation. Storage owns the atomic, persistent game-ID deduplication. */
export function recordStatistics(statistics, game) {
  const next = normalizeStatistics(statistics);
  if (!validStatisticsGame(game)) return next;
  recordTotals(next, game);
  const definition = setForGame(game);
  let group = next.gameSets.find(existing => existing.id === definition.id);
  if (!group) {
    group = { id: definition.id, label: definition.label, ...emptyTotals() };
    next.gameSets.push(group);
  }
  recordTotals(group, game);
  return next;
}
