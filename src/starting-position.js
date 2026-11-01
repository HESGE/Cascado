/** Reproducible starting phases for comparison series, independent of AI randomness.
 * Version 1: one LCG stream per pair of rounds. Each position is replayed
 * with the other starter, without inspecting either player's skill.
 */
import { GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS,
  WHEELS, wheelsFor, inputGates, normalizeAngle, notchAngle } from './geometry.js';
import { passableMouthInterval } from './openings.js';
import { tokenTotal } from './tokens.js';
import { isValidGameSet, getGameSet, gameSetIdForGeometry, MIROIR50_GAME_SET_ID } from './game-sets.js';
import { MIROIR50_POOL_ID, MIROIR50_POSITIONS } from './miroir50-positions.js';

const MAX_SEED = 0xffffffff;
const MAX_ROUND = 1000;
const PHASE_STEPS = 3600;
const ENTRY_ATTEMPTS = 32;
// Immutable reconstruction calibration: this named pose belongs specifically
// to the photographic 1.5 mechanism, not to whichever profile becomes current.
export const ORIGINAL_START_MODE = 'original-v1';
export const MIROIR50_START_MODE = 'miroir-50';
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
  return ['classic', 'varied', ORIGINAL_START_MODE, MIROIR50_START_MODE].includes(mode) && validSeed(seed) ? { mode, seed } : null;
}

export function validateStartConfig(config) {
  return normalizeStartConfig(config) !== null;
}

/** An ordinary match draws the family and its side independently of the starter. */
export function randomMiroir50Seed(random = Math.random) {
  if (typeof random !== 'function') throw new TypeError('Le tirage exige une source aléatoire.');
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError('Le tirage doit être compris entre 0 et 1 exclu.');
  return Math.floor(value * 50);
}

/** A frozen, reproducible census: every 100 rounds covers each of the 50 poses
 * with both starters. Each adjacent rematch pair exchanges pose and starter.
 * Roles per family are base/complement/complement/base (or the reverse), so
 * global starter alternation also remains intact between the two pairs.
 */
export function miroir50ScheduleEntry(seed, round = 1) {
  if (!validSeed(seed) || !validRound(round)) throw new TypeError('Tirage Miroir 50 invalide.');
  const cycle = Math.floor((round - 1) / 100);
  const withinCycle = (round - 1) % 100;
  const familyStep = Math.floor(withinCycle / 4);
  const withinFamily = withinCycle % 4;
  const firstFamily = (seed % 25 + cycle) % 25;
  const remaining = Array.from({ length: 25 }, (_, index) => index).filter(index => index !== firstFamily);
  let state = (seed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0;
  const next = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state; };
  for (let index = remaining.length - 1; index > 0; index--) {
    const selected = Math.floor(next() / 0x100000000 * (index + 1));
    [remaining[index], remaining[selected]] = [remaining[selected], remaining[index]];
  }
  const familyOrder = [firstFamily, ...remaining];
  const initialRoles = familyOrder.map((_, index) => index === 0
    ? (Math.floor(seed / 25) + cycle) % 2 : next() >>> 31);
  const roleIndex = initialRoles[familyStep] ^ [0, 1, 1, 0][withinFamily];
  const pose = MIROIR50_POSITIONS[familyOrder[familyStep] * 2 + roleIndex];
  return { poolId: MIROIR50_POOL_ID, familyId: pose.familyId, poseId: pose.poseId,
    role: pose.role, round, angles: [...pose.angles], starterOffset: (round - 1) % 2 };
}

export function startingAnglesForMiroir50(seed, round = 1) {
  return miroir50ScheduleEntry(seed, round).angles;
}

/** Repeated human rematches always complement the previous pose, even outside
 * the census schedule. The caller independently inverts the saved starter. */
export function miroir50RematchSeed(game) {
  if (game?.geometryVersion !== MIRROR_GEOMETRY_VERSION || !isValidStartingPosition(game)) {
    throw new TypeError('La revanche exige une partie Miroir 50 valide.');
  }
  const index = MIROIR50_POSITIONS.findIndex(pose => pose.poseId === game.startingPose.poseId);
  return Math.floor(index / 2) + (game.startingPose.role === 'base' ? 25 : 0);
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
  if (geometryVersion === MIRROR_GEOMETRY_VERSION) return startingAnglesForMiroir50(seed, round);
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
    && isValidGameSet(game)
    && game.startConfig === undefined && game.startingAngles === undefined && game.startingPose === undefined
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
  if ((game.geometryVersion === MIRROR_GEOMETRY_VERSION) !== (normalized.mode === MIROIR50_START_MODE)) {
    throw new TypeError('Miroir 50 exige son pool fixe de 50 positions et sa géométrie dédiée.');
  }
  if (normalized.mode === ORIGINAL_START_MODE && game.geometryVersion !== ORIGINAL_START_GEOMETRY) {
    throw new TypeError('Le départ original-v1 exige le profil ddc-v1.5.');
  }
  if (normalized.mode === 'classic') return game;
  const pose = normalized.mode === MIROIR50_START_MODE ? miroir50ScheduleEntry(normalized.seed, round) : null;
  const angles = pose ? pose.angles : normalized.mode === ORIGINAL_START_MODE ? ORIGINAL_START_ANGLES
    : startingAnglesFor(normalized.seed, round, game.geometryVersion);
  game.startConfig = normalized;
  game.startingAngles = [...angles];
  game.angles = [...angles];
  if (pose) {
    const { angles: _angles, starterOffset: _starterOffset, ...metadata } = pose;
    game.startingPose = metadata;
  }
  return game;
}

/** Do not convert an old saved geometry into the current Reference profile. */
export function configureGameSet(game, setId, config, round = 1) {
  getGameSet(setId);
  if (!isValidGameSet(game) || gameSetIdForGeometry(game.geometryVersion) !== setId) {
    throw new TypeError('Le set ne correspond pas à la géométrie de cette partie.');
  }
  return configureStartingPosition(game, config ?? (setId === MIROIR50_GAME_SET_ID
    ? { mode: MIROIR50_START_MODE, seed: 1 } : undefined), round);
}

/** Check immutable provenance, not the wheel angles of an ongoing match. */
export function isValidStartingPosition(game, round = game?.series?.round ?? game?.startingPose?.round ?? 1) {
  if (!game || !validRound(round) || !isValidGameSet(game)) return false;
  if (game.startConfig === undefined) return game.geometryVersion !== MIRROR_GEOMETRY_VERSION
    && game.startingAngles === undefined && game.startingPose === undefined;
  const config = normalizeStartConfig(game.startConfig);
  if (!config || !['varied', ORIGINAL_START_MODE, MIROIR50_START_MODE].includes(config.mode) || !Array.isArray(game.startingAngles)
      || game.startingAngles.length !== WHEELS.length) return false;
  if ((game.geometryVersion === MIRROR_GEOMETRY_VERSION) !== (config.mode === MIROIR50_START_MODE)) return false;
  if (config.mode === MIROIR50_START_MODE) {
    const expected = miroir50ScheduleEntry(config.seed, round);
    const pose = game.startingPose;
    if (!pose || typeof pose !== 'object' || Array.isArray(pose)
      || Object.keys(pose).some(key => !['poolId', 'familyId', 'poseId', 'role', 'round'].includes(key))
      || !['poolId', 'familyId', 'poseId', 'role', 'round'].every(key => pose[key] === expected[key])) return false;
    return Array.from(game.startingAngles).every((angle, index) => angle === expected.angles[index]);
  }
  if (game.startingPose !== undefined) return false;
  if (config.mode === ORIGINAL_START_MODE && game.geometryVersion !== ORIGINAL_START_GEOMETRY) return false;
  const expected = config.mode === ORIGINAL_START_MODE ? ORIGINAL_START_ANGLES
    : startingAnglesFor(config.seed, round, game.geometryVersion);
  return Array.from(game.startingAngles).every((angle, index) => angle === expected[index]);
}
