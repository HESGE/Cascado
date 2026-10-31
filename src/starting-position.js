/** Reproducible starting phases for comparison series, independent of AI randomness.
 * Version 1: one LCG stream per pair of rounds. Each position is replayed
 * with the other starter, without inspecting either player's skill.
 */
import { GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS,
  WHEELS, wheelsFor, inputGates, normalizeAngle, notchAngle } from './geometry.js';
import { passableMouthInterval } from './openings.js';
import { tokenTotal } from './tokens.js';

const MAX_SEED = 0xffffffff;
const MAX_ROUND = 1000;
const PHASE_STEPS = 3600;
const ENTRY_ATTEMPTS = 32;
// Immutable reconstruction calibration: this named pose belongs specifically
// to the photographic 1.5 mechanism, not to whichever profile becomes current.
export const ORIGINAL_START_MODE = 'original-v1';
export const ORIGINAL_START_ANGLES = Object.freeze([348, 22, 116, 8, 31]);
const ORIGINAL_START_GEOMETRY = 'ddc-v1.5';
const validSeed = value => Number.isInteger(value) && value >= 0 && value <= MAX_SEED;
const validRound = value => Number.isInteger(value) && value >= 1 && value <= MAX_ROUND;

/** UI/CLI parsing only; the mechanical APIs themselves require numeric seeds. */
export function parseStartingSeed(value) {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return validSeed(value) ? value : null;
}

/** Undefined means the ordinary fixed board. Reject malformed saved settings. */
export function normalizeStartConfig(config) {
  if (config === undefined) return { mode: 'classic', seed: 1 };
  if (!config || typeof config !== 'object' || Array.isArray(config)
      || Object.keys(config).some(key => !['mode', 'seed'].includes(key))) return null;
  const { mode = 'classic', seed = 1 } = config;
  return ['classic', 'varied', ORIGINAL_START_MODE].includes(mode) && validSeed(seed) ? { mode, seed } : null;
}

export function validateStartConfig(config) {
  return normalizeStartConfig(config) !== null;
}

/** Every loading mouth on both faces must stay closed before the first move. */
function closedEntrance(angle, geometryVersion) {
  return [0, 1].every(face => inputGates(geometryVersion).every(gate => passableMouthInterval(1,
    notchAngle(face, 1, 0, angle, geometryVersion), gate) === null));
}

export function startingAnglesFor(seed, round = 1, geometryVersion = GEOMETRY_VERSION) {
  const wheels = wheelsFor(geometryVersion);
  if (!validSeed(seed)) throw new TypeError('La graine doit être un entier entre 0 et 4 294 967 295.');
  if (!validRound(round)) throw new TypeError('La manche doit être un entier entre 1 et 1 000.');
  const pair = Math.floor((round - 1) / 2);
  // Multiplication and unsigned reduction define the version-1 sequence even
  // for seed zero; there is no Math.random call or dependence on an AI move.
  let state = (seed ^ Math.imul(pair + 1, 0x9e3779b9)) >>> 0;
  const phase = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor(state / 0x100000000 * PHASE_STEPS) / 10;
  };
  let entry = 0;
  for (let attempt = 0; attempt < ENTRY_ATTEMPTS; attempt++) {
    const candidate = phase();
    if (closedEntrance(candidate, geometryVersion)) { entry = candidate; break; }
  }
  // Zero is the specified neutral pose, whose loading mouths are all closed. The
  // bounded fallback prevents a rejection loop and never consults a verdict.
  if (!closedEntrance(entry, geometryVersion)) throw new Error('La position neutre doit fermer toutes les entrées.');
  const angles = [entry, ...wheels.slice(1).map(() => phase())];
  // Exchange the two physical sides on the paired game. The half-pitch
  // offsets of v1.4 make this an exact mechanical symmetry, not a score swap.
  // Preserve that historical protocol only: the photographic v1.5 offsets
  // are not an exact face-exchange symmetry, so its pairs replay identical angles.
  return geometryVersion === PREVIOUS_GEOMETRY_VERSION && round % 2 === 0
    ? angles.map((angle, index) => normalizeAngle(angle + wheels[index].delta)) : angles;
}

function freshGame(game) {
  return game && SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion) && game.turn === 1
    && [0, 1].includes(game.active) && game.engaged === null && game.lastWheel === null
    && game.verdict === null && Array.isArray(game.events) && game.events.length === 0
    && Array.isArray(game.angles) && game.angles.length === WHEELS.length
    && Array.from(game.angles).every(angle => angle === 0)
    && game.startConfig === undefined && game.startingAngles === undefined
    && Array.isArray(game.faces) && game.faces.length === 2
    && Array.from(game.faces).every(face => face && Array.isArray(face.queue)
      && face.queue.length === tokenTotal(game.geometryVersion)
      && Array.from(face.queue).every((token, index) => token === index + 1)
      && Array.isArray(face.exited) && face.exited.length === 0
      && Array.isArray(face.slots) && face.slots.length === WHEELS.length
      && Array.from(face.slots).every((slots, index) => Array.isArray(slots)
        && slots.length === WHEELS[index].notches && Array.from(slots).every(token => token === null)));
}

/** Apply once, before the first actual movement; never realign a saved game. */
export function configureStartingPosition(game, config = {}, round = 1) {
  const normalized = normalizeStartConfig(config);
  if (!normalized || !validRound(round)) throw new TypeError('Configuration de départ invalide.');
  if (!freshGame(game)) throw new TypeError('Les phases initiales exigent une partie neuve et neutre.');
  if (normalized.mode === ORIGINAL_START_MODE && game.geometryVersion !== ORIGINAL_START_GEOMETRY) {
    throw new TypeError('Le départ original-v1 exige le profil ddc-v1.5.');
  }
  if (normalized.mode === 'classic') return game;
  const angles = normalized.mode === ORIGINAL_START_MODE ? ORIGINAL_START_ANGLES
    : startingAnglesFor(normalized.seed, round, game.geometryVersion);
  game.startConfig = normalized;
  game.startingAngles = [...angles];
  game.angles = [...angles];
  return game;
}

/** Check immutable provenance, not the wheel angles of an ongoing match. */
export function isValidStartingPosition(game, round = game?.series?.round ?? 1) {
  if (!game || !validRound(round) || !SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion)) return false;
  if (game.startConfig === undefined) return game.startingAngles === undefined;
  const config = normalizeStartConfig(game.startConfig);
  if (!config || !['varied', ORIGINAL_START_MODE].includes(config.mode) || !Array.isArray(game.startingAngles)
      || game.startingAngles.length !== WHEELS.length) return false;
  if (config.mode === ORIGINAL_START_MODE && game.geometryVersion !== ORIGINAL_START_GEOMETRY) return false;
  const expected = config.mode === ORIGINAL_START_MODE ? ORIGINAL_START_ANGLES
    : startingAnglesFor(config.seed, round, game.geometryVersion);
  return Array.from(game.startingAngles).every((angle, index) => angle === expected[index]);
}
