/** The real rules and local AIs, without a board, browser or storage dependency. */
import { createGame, getView, rotate } from './engine.js';
import { chooseAIMove, AI_LEVELS } from './ai.js';
import { configurePlayers, isAIPlayer, playerSettings } from './players.js';
import { newSession, acceptReveal, transmit } from './flow.js';
import { GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS, WHEELS } from './geometry.js';
import { tokenTotal } from './tokens.js';
import { configureStartingPosition, isValidStartingPosition } from './starting-position.js';
import { createSeries, parseSeriesCount, seriesGameId, seriesOf,
  recordSeriesResult, createNextSeriesGame } from './series.js';

const LEVELS = new Set(AI_LEVELS.map(level => level.id));

/** Validate a complete coordinator/worker snapshot, never a planner input. */
export function isSimulationSession(session) {
  const game = session?.game;
  const wheel = value => value === null || Number.isInteger(value) && value >= 1 && value <= 5;
  if (!game || !['open', 'passed', 'revealed-result'].includes(session.phase) ||
      game.schemaVersion !== 1 || !SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion) ||
      ![0, 1].includes(game.active) || session.recipient !== game.active ||
      !Number.isSafeInteger(game.turn) || game.turn < 1 || game.turn === Number.MAX_SAFE_INTEGER ||
      !Array.isArray(game.players) || game.players.length !== 2 || !isAIPlayer(game, 0) || !isAIPlayer(game, 1) ||
      !game.players.every(player => typeof player.name === 'string' && player.name.trim() && LEVELS.has(player.level)) ||
      !wheel(game.engaged) || !wheel(game.lastWheel) ||
      !Array.isArray(game.angles) || game.angles.length !== 5 || !Array.from(game.angles).every(Number.isFinite) ||
      !Array.isArray(game.events) || !Array.isArray(game.faces) || game.faces.length !== 2) return false;
  const total = tokenTotal(game.geometryVersion);
  for (const face of game.faces) {
    if (!face || !Array.isArray(face.queue) || !Array.isArray(face.exited) ||
        !Array.isArray(face.slots) || face.slots.length !== 5 ||
        !Array.from(face.slots).every((slots, index) => Array.isArray(slots) && slots.length === WHEELS[index].notches &&
          Array.from(slots).every(token => token === null || Number.isInteger(token) && token >= 1 && token <= total))) return false;
    const tokens = [...face.queue, ...face.slots.flat().filter(token => token !== null), ...face.exited];
    if (tokens.length !== total || tokens.sort((a, b) => a - b).some((token, index) => token !== index + 1)) return false;
  }
  if (game.series !== undefined && (!seriesOf(game) || game.statsId !== seriesGameId(game.series))) return false;
  if (!isValidStartingPosition(game)) return false;
  // Only an announced result is inspected: an open hidden verdict cannot
  // prevent the active AI from completing its normal turn.
  if (session.phase === 'revealed-result') {
    const verdict = game.verdict;
    if (game.turn < 2 || !verdict || !((verdict.reason === 'draw' && verdict.winner === null) ||
        (['order', 'complete'].includes(verdict.reason) && [0, 1].includes(verdict.winner)))) return false;
  }
  return true;
}

/** Reproducible unsigned 32-bit LCG; only the easy AI consumes randomness. */
export function createSimulationRandom(seed = 1) {
  if (!Number.isSafeInteger(seed)) throw new TypeError('La graine doit être un entier sûr.');
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  Object.defineProperty(random, 'state', { get: () => state });
  return random;
}

/**
 * Mutate an AI-only session by at most one actual turn. The planner receives
 * only getView(active); even an existing hidden verdict cannot stop that turn.
 * A passed result is revealed without another move, and a revealed result is
 * idempotent. Series counters are credited here, never a following game.
 * Mechanical history is discarded by default; the authoritative position and
 * the terminal snapshot remain complete. keepEvents is useful for diagnostics.
 * Return status: turn, result, or blocked (no invented result on a planning fault).
 */
export function playSimulationTurn(session, { random = Math.random, keepEvents = false } = {}) {
  if (!isSimulationSession(session) || typeof random !== 'function') {
    throw new TypeError('La simulation exige une session valide avec deux IA.');
  }
  const game = session.game;
  const result = (player = null, turn = null, move = null) => {
    if (!keepEvents) game.events = [];
    return { status: 'result', player, turn, move, counted: recordSeriesResult(session) };
  };
  if (session.phase === 'revealed-result') return result();
  if (session.phase === 'passed' && acceptReveal(session) === 'result') return result();
  const player = game.active;
  const turn = game.turn;
  const move = chooseAIMove(getView(game, player), playerSettings(game.players[player]).level, { random });
  if (!move || !Number.isFinite(move.localDelta) || Math.abs(move.localDelta) < 1e-9) {
    return { status: 'blocked', player, turn, move: null, reason: 'no-legal-move' };
  }
  if (!rotate(game, move.wheel, move.localDelta * (player === 0 ? 1 : -1))) {
    return { status: 'blocked', player, turn, move, reason: 'rejected-move' };
  }
  // Exactly the graphical game's end-turn and result-revelation boundary.
  if (!transmit(session)) return { status: 'blocked', player, turn, move, reason: 'end-turn-failed' };
  const target = acceptReveal(session);
  if (!keepEvents) game.events = [];
  return target === 'result' ? result(player, turn, move) : { status: 'turn', player, turn, move };
}

function settings({ count = 10, levels = ['normal', 'normal'], firstStarter = 0,
  seed = 1, maxTurns = 10000, startMode = 'classic', geometryVersion = GEOMETRY_VERSION } = {}) {
  const target = parseSeriesCount(count);
  if (target === null) throw new TypeError('Le nombre de parties doit être compris entre 1 et 1 000.');
  if (!Array.isArray(levels) || levels.length !== 2 || !levels.every(level => LEVELS.has(level))) {
    throw new TypeError('Chaque IA doit être easy, normal ou hard.');
  }
  if (![0, 1].includes(firstStarter)) throw new TypeError('Le premier joueur doit être 0 ou 1.');
  if (!['classic', 'varied'].includes(startMode)) throw new TypeError('Les départs doivent être classic ou varied.');
  if (!SUPPORTED_GEOMETRY_VERSIONS.includes(geometryVersion)) throw new TypeError('Version de géométrie incompatible.');
  if (!Number.isSafeInteger(seed)) throw new TypeError('La graine doit être un entier sûr.');
  if (!Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new TypeError('La limite de tours doit être un entier positif.');
  return { count: target, levels: [...levels], firstStarter, seed: seed >>> 0, maxTurns, startMode, geometryVersion };
}

/**
 * Run a fresh, bounded series; callbacks and returned results contain public
 * counters and initial phases only. Hooks may be async. shouldStop is checked before every move;
 * yieldControl, when supplied, is awaited between every pair of turns. The
 * default yields to the host every 16 turns. A turn limit or interruption ends
 * with an explicitly unfinished match, never a fabricated draw or victory.
 */
export async function runSimulation(options = {}, hooks = {}) {
  const config = settings(options);
  for (const name of ['onProgress', 'shouldStop', 'yieldControl']) {
    if (hooks[name] !== undefined && typeof hooks[name] !== 'function') throw new TypeError(`Le rappel ${name} doit être une fonction.`);
  }
  let game = configurePlayers(createGame(['IA 1', 'IA 2'], config.firstStarter, config.geometryVersion),
    config.levels.map(level => ({ controller: 'ai', level })));
  game.starter = config.firstStarter;
  game.series = createSeries(config.count, { id: `simulation-${config.seed}`, firstStarter: config.firstStarter });
  game.statsId = seriesGameId(game.series);
  configureStartingPosition(game, { mode: config.startMode, seed: config.seed }, game.series.round);
  let session = newSession(game);
  const random = createSimulationRandom(config.seed);
  const results = [];
  const completedPositions = new Set();
  let turnsSinceYield = 0;
  const startMetadata = () => config.startMode === 'varied' ? {
    startingAngles: [...game.startingAngles], pair: Math.ceil(game.series.round / 2),
  } : {};
  const summary = (status, unfinished = null) => {
    const series = seriesOf(game);
    return {
      status, requested: config.count, completed: series.completed,
      wins: [...series.wins], draws: series.draws, totalTurns: series.totalTurns,
      averageTurns: series.completed ? series.totalTurns / series.completed : 0,
      levels: [...config.levels], firstStarter: config.firstStarter, seed: config.seed,
      startMode: config.startMode, geometryVersion: config.geometryVersion,
      positionCount: completedPositions.size,
      unfinished,
    };
  };
  const finish = (status, reason = null) => ({
    ...summary(status, reason ? { round: game.series.round, starter: game.starter,
      turns: game.turn - 1, reason, ...startMetadata() } : null),
    results: results.map(result => ({ ...result,
      ...(result.startingAngles ? { startingAngles: [...result.startingAngles] } : {}),
    })),
  });
  const progress = async () => {
    if (hooks.onProgress) await hooks.onProgress({ ...summary('running'),
      current: { round: game.series.round, starter: game.starter, turns: game.turn - 1, ...startMetadata() } });
  };
  await progress();
  for (;;) {
    if (hooks.shouldStop && await hooks.shouldStop()) return finish('stopped', 'cancelled');
    if (game.turn - 1 >= config.maxTurns) return finish('incomplete', 'turn-limit');
    const step = playSimulationTurn(session, { random });
    if (step.status === 'blocked') return finish('incomplete', step.reason);
    turnsSinceYield += 1;
    if (step.status === 'result') {
      results.push({ number: game.series.round, starter: game.starter,
        winner: game.verdict.winner, reason: game.verdict.reason, turns: game.turn - 1, ...startMetadata() });
      // Each pair shares a reproducible starting position; only symmetric
      // mechanical profiles promise a complete exchange of the two faces.
      completedPositions.add(config.startMode === 'varied' ? Math.ceil(game.series.round / 2) : 1);
      await progress();
      if (game.series.completed === config.count) return finish('completed');
      if (hooks.shouldStop && await hooks.shouldStop()) return finish('stopped');
      game = createNextSeriesGame(game);
      if (!game) throw new Error('La série ne peut pas créer la confrontation suivante.');
      session = newSession(game);
    } else if (turnsSinceYield >= 16) await progress();
    if (hooks.yieldControl) await hooks.yieldControl();
    else if (turnsSinceYield >= 16) await new Promise(resolve => setTimeout(resolve, 0));
    if (turnsSinceYield >= 16) turnsSinceYield = 0;
  }
}
