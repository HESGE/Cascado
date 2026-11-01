import { GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS } from './geometry.js';

export const REFERENCE_GAME_SET_ID = 'reference';
export const MIROIR50_GAME_SET_ID = 'miroir-50';
export const GAME_SETS = Object.freeze([
  Object.freeze({ id: REFERENCE_GAME_SET_ID, label: 'Référence', geometryVersion: GEOMETRY_VERSION }),
  Object.freeze({ id: MIROIR50_GAME_SET_ID, label: 'Miroir 50', geometryVersion: MIRROR_GEOMETRY_VERSION }),
]);

export function normalizeGameSetId(value = REFERENCE_GAME_SET_ID) {
  return GAME_SETS.some(set => set.id === value) ? value : null;
}

export function getGameSet(id = REFERENCE_GAME_SET_ID) {
  const set = GAME_SETS.find(candidate => candidate.id === id);
  if (!set) throw new TypeError('Set de jeu inconnu.');
  return set;
}
export const gameSetFor = getGameSet;

/** Historical profiles belong to Reference and keep their own stored mechanics. */
export function gameSetIdForGeometry(geometryVersion) {
  if (!SUPPORTED_GEOMETRY_VERSIONS.includes(geometryVersion)) throw new RangeError('Version de géométrie incompatible.');
  return geometryVersion === MIRROR_GEOMETRY_VERSION ? MIROIR50_GAME_SET_ID : REFERENCE_GAME_SET_ID;
}

export function isValidGameSet(game) {
  if (!game || !SUPPORTED_GEOMETRY_VERSIONS.includes(game.geometryVersion)) return false;
  const expected = gameSetIdForGeometry(game.geometryVersion);
  return game.gameSetId === expected || (game.gameSetId === undefined && expected === REFERENCE_GAME_SET_ID);
}
