import { REFERENCE_FIVE_GEOMETRY_VERSION, MIRROR_FIVE_GEOMETRY_VERSION, angularDistance } from './geometry.js';

export const AI_MEMORY_LIMIT = 12;
const MAX_KEY_LENGTH = 2048;
const NOTCH_COUNTS = [1, 3, 2, 4, 5];
const fiveProfile = version => version === REFERENCE_FIVE_GEOMETRY_VERSION || version === MIRROR_FIVE_GEOMETRY_VERSION;

/** The defensive planner is reserved for the current ordered five-token modes. */
export function defensiveMode(view, level) {
  return Boolean(view && fiveProfile(view.geometryVersion) && view.tokenOrder !== 'shuffled'
    && (level === 'hard' || level === 'expert'));
}

/** Own observations only: never a game, a verdict or an opposing face. */
export function aiPositionKey(view) {
  return JSON.stringify([view.geometryVersion, view.faceIndex,
    view.angles.map(angle => Math.round(angle * 1e6) / 1e6),
    view.queue, view.slots, view.exited, view.lastWheel ?? null, view.engaged ?? null]);
}

function validKey(key, geometryVersion, faceIndex) {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  try {
    const value = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 8 || value[0] !== geometryVersion || value[1] !== faceIndex) return false;
    const [, , angles, queue, slots, exited, lastWheel, engaged] = value;
    const token = id => Number.isInteger(id) && id >= 1 && id <= 5;
    const wheel = id => id === null || Number.isInteger(id) && id >= 1 && id <= 5;
    if (!Array.isArray(angles) || angles.length !== 5 || !angles.every(angle => Number.isFinite(angle) && angle >= 0 && angle <= 360)
      || !Array.isArray(queue) || !queue.every(token) || !Array.isArray(exited) || !exited.every(token)
      || !Array.isArray(slots) || slots.length !== 5 || !slots.every((values, index) => Array.isArray(values)
        && values.length === NOTCH_COUNTS[index] && values.every(id => id === null || token(id)))
      || !wheel(lastWheel) || !wheel(engaged)) return false;
    const all = [...queue, ...slots.flat().filter(id => id !== null), ...exited].sort((a, b) => a - b);
    return all.length === 5 && all.every((id, index) => id === index + 1) && JSON.stringify(value) === key;
  } catch { return false; }
}

function historyFor(value, geometryVersion, faceIndex) {
  return Array.isArray(value) ? value.slice(-AI_MEMORY_LIMIT)
    .filter(key => validKey(key, geometryVersion, faceIndex)) : [];
}

/** Whitelist a caller's bounded own-memory options before worker or fallback. */
export function rememberedOptions(view, level, options = {}) {
  if (!defensiveMode(view, level) || !Array.isArray(options?.recentPositions)) return {};
  return { recentPositions: historyFor(options.recentPositions, view.geometryVersion, view.faceIndex) };
}

/** Consecutive own observations with unchanged pions can still have moving
 * angles. Infer a previous own wheel only when the observed opposing wheel
 * leaves exactly one changed angle; ambiguous/shared-wheel travel is ignored.
 * The existing saved-key format and caller's arrays remain untouched. */
export function aiStagnation(view, level, options = {}) {
  const result = { turns: 0, wheelCounts: [0, 0, 0, 0, 0] };
  if (!defensiveMode(view, level)) return result;
  let current;
  try { current = aiPositionKey(view); }
  catch { return result; }
  if (!validKey(current, view.geometryVersion, view.faceIndex)) return result;
  const keys = rememberedOptions(view, level, options).recentPositions ?? [];
  if (keys.at(-1) !== current) keys.push(current);
  const observations = keys.slice(-AI_MEMORY_LIMIT).map(key => JSON.parse(key));
  const pionState = observation => JSON.stringify(observation.slice(3, 6));
  const latest = pionState(observations.at(-1));
  let first = observations.length - 1;
  while (first > 0 && pionState(observations[first - 1]) === latest) first--;
  result.turns = observations.length - first - 1;
  for (let index = first + 1; index < observations.length; index++) {
    const previous = observations[index - 1];
    const newer = observations[index];
    const opponentWheel = newer[6];
    const changed = newer[2].map((angle, wheel) =>
      wheel + 1 !== opponentWheel && angularDistance(previous[2][wheel], angle) > 1e-6 ? wheel : -1)
      .filter(wheel => wheel >= 0);
    if (changed.length === 1) result.wheelCounts[changed[0]]++;
  }
  return result;
}

/** Optional serialized state: old saves have no memory and remain compatible. */
export function isValidAIMemory(game) {
  if (!game || typeof game !== 'object') return false;
  if (game.aiMemory === undefined) return true;
  if (!fiveProfile(game.geometryVersion) || game.tokenStart?.mode === 'shuffled'
    || !Array.isArray(game.aiMemory) || game.aiMemory.length !== 2) return false;
  return game.aiMemory.every((history, face) => Array.isArray(history) && history.length <= AI_MEMORY_LIMIT
    && history.every(key => validKey(key, game.geometryVersion, face)));
}

/** Record a real planning observation, not a hypothetical move or hidden state. */
export function rememberAIPosition(game, faceIndex, view, level) {
  if (!game || faceIndex !== view?.faceIndex || game.geometryVersion !== view?.geometryVersion
    || !defensiveMode(view, level)) return {};
  const memory = Array.isArray(game.aiMemory) && game.aiMemory.length === 2 ? game.aiMemory : [[], []];
  const own = historyFor(memory[faceIndex], view.geometryVersion, faceIndex);
  const key = aiPositionKey(view);
  if (!validKey(key, view.geometryVersion, faceIndex)) return {};
  if (own.at(-1) !== key) own.push(key);
  memory[faceIndex] = own.slice(-AI_MEMORY_LIMIT);
  // Repair only the shape of the other history; its contents never affect
  // the own options or the current decision.
  const other = 1 - faceIndex;
  memory[other] = historyFor(memory[other], view.geometryVersion, other);
  game.aiMemory = memory;
  return { recentPositions: [...memory[faceIndex]] };
}
