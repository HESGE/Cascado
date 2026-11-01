import { createGame } from './engine.js';
import { configurePlayers, isAIPlayer } from './players.js';
import { validStatisticsGame } from './statistics.js';
import { configureGameSet, isValidStartingPosition, miroir50ScheduleEntry } from './starting-position.js';
import { SUPPORTED_GEOMETRY_VERSIONS } from './geometry.js';
import { gameSetIdForGeometry, isValidGameSet } from './game-sets.js';

const VERSION = 1;
const MAX_GAMES = 1000;
const counter = value => Number.isSafeInteger(value) && value >= 0;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);

/** Form input accepts a whole decimal count, never an exponent or a fraction. */
export function parseSeriesCount(value) {
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) return null;
    value = Number(value);
  }
  return Number.isInteger(value) && value >= 1 && value <= MAX_GAMES ? value : null;
}

export function createSeries(target, { id, firstStarter = 0 } = {}) {
  const count = parseSeriesCount(target);
  if (count === null || !validId(id) || ![0, 1].includes(firstStarter)) {
    throw new TypeError('Une série exige un identifiant, 1 à 1 000 parties et un premier joueur 0 ou 1.');
  }
  return {
    version: VERSION, id, target: count, firstStarter,
    completed: 0, wins: [0, 0], draws: 0, totalTurns: 0,
    round: 1, lastGameId: null,
  };
}

/** Stable per-round identities also survive retrying the next-game save. */
export function seriesGameId(series, round = series.round) {
  return `series:${series.id}:${round}`;
}

/** Only public series counters are copied; no opponent tokens are consulted. */
export function seriesOf(game) {
  if (!Array.isArray(game?.players) || game.players.length !== 2 ||
      !isAIPlayer(game, 0) || !isAIPlayer(game, 1)) return null;
  const value = game.series;
  if (!value || value.version !== VERSION || !validId(value.id) ||
      parseSeriesCount(value.target) !== value.target || ![0, 1].includes(value.firstStarter) ||
      !counter(value.completed) || value.completed > value.target ||
      !Array.isArray(value.wins) || value.wins.length !== 2 || !value.wins.every(counter) ||
      !counter(value.draws) || value.wins[0] + value.wins[1] + value.draws !== value.completed ||
      !counter(value.totalTurns) || value.totalTurns < value.completed ||
      !Number.isInteger(value.round) || value.round < 1 || value.round > value.target ||
      ![value.round - 1, value.round].includes(value.completed) ||
      (value.completed === 0 ? value.lastGameId !== null :
        value.lastGameId !== seriesGameId(value, value.completed))) return null;
  return {
    version: VERSION, id: value.id, target: value.target, firstStarter: value.firstStarter,
    completed: value.completed, wins: [...value.wins], draws: value.draws,
    totalTurns: value.totalTurns, round: value.round, lastGameId: value.lastGameId,
  };
}

/** Count only an announced result, once; the caller saves this with the session. */
export function recordSeriesResult(session) {
  if (session?.phase !== 'revealed-result') return false;
  const game = session.game;
  const series = seriesOf(game);
  if (!series || series.completed !== series.round - 1 ||
      game.statsId !== seriesGameId(series) || !validStatisticsGame(game)) return false;
  const totalTurns = series.totalTurns + (game.turn - 1);
  if (!counter(totalTurns)) return false;
  series.completed += 1;
  if (game.verdict.winner === null) series.draws += 1;
  else series.wins[game.verdict.winner] += 1;
  series.totalTurns = totalTurns;
  series.lastGameId = game.statsId;
  game.series = series;
  return true;
}

/** Fresh next round, preserving the stored mechanical profile, seats and AI levels. */
export function createNextSeriesGame(game) {
  const series = seriesOf(game);
  if (!series || series.completed !== series.round || series.completed >= series.target ||
      game.statsId !== series.lastGameId || !validStatisticsGame(game) ||
      !SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion) ||
      !isValidGameSet(game) ||
      !isValidStartingPosition(game, series.round)) return null;
  series.round = series.completed + 1;
  const gameSetId = game.gameSetId ?? gameSetIdForGeometry(game.geometryVersion);
  const starterOffset = gameSetId === 'miroir-50'
    ? miroir50ScheduleEntry(game.startConfig.seed, series.round).starterOffset : series.completed % 2;
  const starter = series.firstStarter ^ starterOffset;
  const next = configurePlayers(createGame(game.players.map(player => player.name), starter, game.geometryVersion), game.players);
  next.starter = starter;
  if(game.simulationMode === 'headless') next.simulationMode = 'headless';
  for (let seat = 0; seat < 2; seat += 1) {
    for (const key of ['symbol', 'color']) {
      if (typeof game.players[seat][key] === 'string') next.players[seat][key] = game.players[seat][key];
    }
  }
  next.series = series;
  next.statsId = seriesGameId(series);
  configureGameSet(next, gameSetId, game.startConfig, series.round);
  return next;
}
