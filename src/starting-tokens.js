import { SUPPORTED_GEOMETRY_VERSIONS, WHEELS } from './geometry.js';
import { tokenTotal } from './tokens.js';

export const TOKEN_ORDERS = Object.freeze([
  Object.freeze({ id: 'ordered', label: 'Classique — 1 à 5' }),
  Object.freeze({ id: 'shuffled', label: 'Mélangés — mêmes deux faces' }),
]);

const validSeed = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const validRound = value => Number.isInteger(value) && value >= 1 && value <= 1000;

/** Only shuffle provenance is additional data. The queues themselves are saved. */
export function isValidStartingTokens(game) {
  if (!game || !SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion)) return false;
  const config = game.tokenStart;
  if (config === undefined) return true;
  return Boolean(config && typeof config === 'object' && !Array.isArray(config)
    && Object.keys(config).length === 2
    && Object.keys(config).every(key => ['mode', 'seed'].includes(key))
    && config.mode === 'shuffled' && validSeed(config.seed));
}

export function tokenOrderMode(game) {
  return game?.tokenStart?.mode === 'shuffled' ? 'shuffled' : 'ordered';
}

function freshQueues(game) {
  if (!game || !SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion)) return false;
  const total = tokenTotal(game.geometryVersion);
  return game.turn === 1 && [0, 1].includes(game.active)
    && game.engaged === null && game.lastWheel === null && game.verdict === null
    && game.tokenStart === undefined
    && Array.isArray(game.events) && game.events.length === 0
    && Array.isArray(game.angles) && game.angles.length === WHEELS.length
    && Array.from(game.angles).every(Number.isFinite)
    && Array.isArray(game.faces) && game.faces.length === 2
    && Array.from(game.faces).every(face => face && Array.isArray(face.queue)
      && face.queue.length === total
      && Array.from(face.queue).every((token, index) => token === index + 1)
      && Array.isArray(face.exited) && face.exited.length === 0
      && Array.isArray(face.slots) && face.slots.length === WHEELS.length
      && Array.from(face.slots).every((slots, index) => Array.isArray(slots)
        && slots.length === WHEELS[index].notches
        && Array.from(slots).every(token => token === null)));
}

/** Apply after the wheel pose, once on a fresh game. Adjacent comparison rounds
 * share one seeded draw, independent of starter, face, level and AI randomness. */
export function configureStartingTokens(game, mode = 'ordered', seed = 1, round = 1) {
  if (!TOKEN_ORDERS.some(order => order.id === mode) || !validSeed(seed) || !validRound(round)) {
    throw new TypeError('Ordre de jetons invalide.');
  }
  if (!freshQueues(game)) throw new TypeError('Le mélange exige des files de départ neuves.');
  if (mode === 'ordered') return game;
  const queue = [...game.faces[0].queue];
  const pair = Math.floor((round - 1) / 2);
  let state = (seed ^ Math.imul(pair + 1, 0x9e3779b9)) >>> 0;
  for (let lane = 0; lane < queue.length; lane += 5) {
    for (let index = 4; index > 0; index--) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      const selected = Math.floor(state / 0x100000000 * (index + 1));
      [queue[lane + index], queue[lane + selected]] = [queue[lane + selected], queue[lane + index]];
    }
  }
  for (const face of game.faces) face.queue = [...queue];
  game.tokenStart = { mode, seed };
  return game;
}
