/** Normative, versioned geometry. Angles are clockwise degrees in screen space. */
export const GEOMETRY_VERSION = 'ddc-v1.5';
export const PREVIOUS_GEOMETRY_VERSION = 'ddc-v1.4';
export const LEGACY_GEOMETRY_VERSION = 'ddc-v1.3';
export const SUPPORTED_GEOMETRY_VERSIONS = Object.freeze([GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION]);
export const BOARD = Object.freeze({ width: 360, height: 540 });
export const ANGULAR_TOLERANCE = 1e-6;
export const TOKEN_RADIUS = 12;
export const NOTCH_RADIUS = 14;
export const INPUT_GATE = 270;
export const OUTPUT_GATE = 90;

export const WHEELS = Object.freeze([
  { id: 1, x: 180, y: 101, radius: 47, notches: 1, alpha: 45, delta: 75 },
  { id: 2, x: 237, y: 202, radius: 57, notches: 3, alpha: 30, delta: 90 },
  { id: 3, x: 146, y: 270, radius: 46, notches: 2, alpha: 45, delta: 90 },
  { id: 4, x: 248, y: 333, radius: 64, notches: 4, alpha: 0, delta: 20 },
  { id: 5, x: 115, y: 393, radius: 72, notches: 5, alpha: 0, delta: 15 },
].map((wheel) => Object.freeze({
  ...wheel,
  seatRadius: wheel.radius - NOTCH_RADIUS,
})));

/** Video-derived working phases, not a millimetric reconstruction.
 * Wheel 2's +90° phase modulo its 120° pitch is the observed -30° gap.
 * Existing games keep their original phases and their single entrance. */
export const PREVIOUS_WHEELS = Object.freeze(WHEELS.map((wheel, index) =>
  Object.freeze({ ...wheel, delta: [180, 60, 90, 45, 36][index] })));
export const LEGACY_WHEELS = Object.freeze(WHEELS.map((wheel, index) =>
  Object.freeze({ ...wheel, delta: [90, 36, 45, 45, 36][index] })));

export function wheelsFor(geometryVersion = GEOMETRY_VERSION) {
  if (geometryVersion === GEOMETRY_VERSION) return WHEELS;
  if (geometryVersion === PREVIOUS_GEOMETRY_VERSION) return PREVIOUS_WHEELS;
  if (geometryVersion === LEGACY_GEOMETRY_VERSION) return LEGACY_WHEELS;
  throw new RangeError('Version de géométrie incompatible.');
}

export const LINKS = Object.freeze([
  [1, 2], [2, 3], [2, 4], [3, 4], [3, 5], [4, 5],
].map(([from, to]) => Object.freeze({ from, to })));

export function normalizeAngle(angle) {
  const result = ((angle % 360) + 360) % 360;
  return Math.abs(result) < 1e-12 || Math.abs(result - 360) < 1e-12 ? 0 : result;
}

export function angularDistance(a, b) {
  return Math.abs(((a - b + 540) % 360 + 360) % 360 - 180);
}

export function centerFor(faceIndex, wheelId) {
  const wheel = WHEELS[wheelId - 1];
  return { x: faceIndex === 0 ? wheel.x : BOARD.width - wheel.x, y: wheel.y };
}

export function notchAngle(faceIndex, wheelId, notchIndex, physicalAngle, geometryVersion = GEOMETRY_VERSION) {
  const wheel = wheelsFor(geometryVersion)[wheelId - 1];
  const angle = physicalAngle + wheel.alpha + notchIndex * 360 / wheel.notches;
  return normalizeAngle(faceIndex === 0 ? angle : 180 - angle - wheel.delta);
}

/** Physical angle at which one notch is exactly on a local gate. */
export function physicalAngleFor(faceIndex, wheelId, notchIndex, localAngle, geometryVersion = GEOMETRY_VERSION) {
  const wheel = wheelsFor(geometryVersion)[wheelId - 1];
  const base = wheel.alpha + notchIndex * 360 / wheel.notches;
  return normalizeAngle(faceIndex === 0 ? localAngle - base : 180 - localAngle - base - wheel.delta);
}

export function slotPosition(faceIndex, wheelId, notchIndex, physicalAngle, geometryVersion = GEOMETRY_VERSION) {
  const wheel = wheelsFor(geometryVersion)[wheelId - 1];
  const center = centerFor(faceIndex, wheelId);
  const radians = notchAngle(faceIndex, wheelId, notchIndex, physicalAngle, geometryVersion) * Math.PI / 180;
  return {
    x: center.x + wheel.seatRadius * Math.cos(radians),
    y: center.y + wheel.seatRadius * Math.sin(radians),
  };
}

export function gates(faceIndex) {
  return LINKS.map(({ from, to }) => {
    const source = centerFor(faceIndex, from);
    const target = centerFor(faceIndex, to);
    const sourceAngle = normalizeAngle(Math.atan2(target.y - source.y, target.x - source.x) * 180 / Math.PI);
    return { from, to, sourceAngle, targetAngle: normalizeAngle(sourceAngle + 180) };
  });
}

/** Each entrance is fixed in the local face, including after reflection. */
export function inputGates(geometryVersion = GEOMETRY_VERSION) {
  wheelsFor(geometryVersion);
  return geometryVersion === GEOMETRY_VERSION ? [210, 330] : [INPUT_GATE];
}

export function boardHeightFor(geometryVersion = LEGACY_GEOMETRY_VERSION) {
  wheelsFor(geometryVersion);
  return geometryVersion === GEOMETRY_VERSION ? BOARD.height : 510;
}

export function queuePosition(index, lane = 0, geometryVersion = LEGACY_GEOMETRY_VERSION) {
  if (geometryVersion === GEOMETRY_VERSION) {
    return { x: (lane === 0 ? 129 : 231) + (lane === 0 ? -24 : 24) * index, y: 70 - 10.5 * index };
  }
  const length = Math.hypot(136, 22);
  return { x: 180 - index * 28 * 136 / length, y: 40 - index * 28 * 22 / length };
}

export function trayPosition(faceIndex, index, geometryVersion = LEGACY_GEOMETRY_VERSION) {
  const output = centerFor(faceIndex, 5);
  const lane = geometryVersion === GEOMETRY_VERSION ? Math.floor(index / 5) : 0;
  const place = geometryVersion === GEOMETRY_VERSION ? index % 5 : index;
  return { x: output.x - 87 + place * 26, y: (geometryVersion === GEOMETRY_VERSION ? 496 + 26 * lane : 494) - place * 3.5 };
}

/** Feed the numbered slope slightly above its highest place. */
export function trayEntry(faceIndex, geometryVersion = LEGACY_GEOMETRY_VERSION, lane = 0) {
  const high = trayPosition(faceIndex, (geometryVersion === GEOMETRY_VERSION ? lane * 5 : 0) + 4, geometryVersion);
  return { x: high.x + 4, y: high.y - 4 * 3.5 / 26 };
}
