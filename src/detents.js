/** Mechanical stops depend only on the shared wheel geometry, never on a game. */
import {
  GEOMETRY_VERSION, wheelsFor, inputGates, OUTPUT_GATE, gates, normalizeAngle, physicalAngleFor,
} from './geometry.js';

export const ROTATION_STEP = 6;
const SAME_STOP = 1e-7;

const DETENTS = new Map();
const FACE_DETENTS = new Map();
function buildDetents(geometryVersion, faces = [0, 1]) { return wheelsFor(geometryVersion).map(wheel => {
  const positions = [];
  for (const face of faces) {
    const localGates = gates(face).flatMap(gate => [
      ...(gate.from === wheel.id ? [gate.sourceAngle] : []),
      ...(gate.to === wheel.id ? [gate.targetAngle] : []),
    ]);
    if (wheel.id === 1) localGates.push(...inputGates(geometryVersion));
    if (wheel.id === 5) localGates.push(OUTPUT_GATE);
    for (const gate of localGates) {
      for (let notch = 0; notch < wheel.notches; notch += 1) {
        positions.push(physicalAngleFor(face, wheel.id, notch, gate, geometryVersion));
      }
    }
  }
  positions.sort((a, b) => a - b);
  const distinct = positions.filter((angle, index) => index === 0 || angle - positions[index - 1] > SAME_STOP);
  if (distinct.length > 1 && distinct[0] + 360 - distinct.at(-1) <= SAME_STOP) distinct.pop();
  return Object.freeze(distinct);
}); }
const NO_DETENTS = Object.freeze([]);

/** Exact physical gate angles, including both faces and every notch. */
export function mechanicalDetents(wheelId, geometryVersion = GEOMETRY_VERSION) {
  if(!Number.isInteger(wheelId) || wheelId < 1 || wheelId > 5) return NO_DETENTS;
  if(!DETENTS.has(geometryVersion)) DETENTS.set(geometryVersion,buildDetents(geometryVersion));
  return DETENTS.get(geometryVersion)[wheelId-1];
}

/** Own-face alignment cues share the common mechanism's physical angles,
 * without changing its stops or reading any token state. */
export function faceMechanicalDetents(wheelId, faceIndex, geometryVersion = GEOMETRY_VERSION) {
  if (faceIndex !== 0 && faceIndex !== 1) throw new RangeError('Face inconnue.');
  if (!Number.isInteger(wheelId) || wheelId < 1 || wheelId > 5) return NO_DETENTS;
  const key = `${geometryVersion}:${faceIndex}`;
  if (!FACE_DETENTS.has(key)) FACE_DETENTS.set(key, buildDetents(geometryVersion, [faceIndex]));
  return FACE_DETENTS.get(key)[wheelId - 1];
}

/** Advance up to six degrees, stopping on the first exact gate encountered.
 * An already aligned wheel can leave its stop on the next press. Saved angles
 * are used as they are: requesting a movement never first snaps backwards. */
export function rotationDetentDelta(wheelId, physicalAngle, physicalDirection, geometryVersion = GEOMETRY_VERSION) {
  const detents = mechanicalDetents(wheelId, geometryVersion);
  if (!detents.length || !Number.isFinite(physicalAngle) || !Number.isFinite(physicalDirection) || physicalDirection === 0) return 0;
  const direction = Math.sign(physicalDirection);
  const angle = normalizeAngle(physicalAngle);
  let distance = ROTATION_STEP;
  for (const stop of detents) {
    const forward = normalizeAngle(direction * (stop - angle));
    if (forward > SAME_STOP && forward < distance) distance = forward;
  }
  return direction * distance;
}
