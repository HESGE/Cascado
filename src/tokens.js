import { LEGACY_GEOMETRY_VERSION, hasTwoEntrances } from './geometry.js';

/** IDs stay unique across the two separately ordered series. */
export function tokenNumber(id) { return (id - 1) % 5 + 1; }
export function tokenSeries(id) { return Math.floor((id - 1) / 5); }
export function tokenTotal(geometryVersion = LEGACY_GEOMETRY_VERSION) {
  return hasTwoEntrances(geometryVersion) ? 10 : 5;
}
export function seriesCount(geometryVersion = LEGACY_GEOMETRY_VERSION) {
  return tokenTotal(geometryVersion) / 5;
}
export function queueLanes(faceOrView, geometryVersion = faceOrView.geometryVersion ?? LEGACY_GEOMETRY_VERSION) {
  return Array.from({ length: seriesCount(geometryVersion) }, (_, lane) =>
    faceOrView.queue.filter(id => tokenSeries(id) === lane));
}
export function nextBySeries(faceOrView, geometryVersion = faceOrView.geometryVersion ?? LEGACY_GEOMETRY_VERSION) {
  return Array.from({ length: seriesCount(geometryVersion) }, (_, lane) =>
    faceOrView.exited.filter(id => tokenSeries(id) === lane).length + 1);
}
