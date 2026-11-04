/** Finger assistance uses only the displayed face's geometry, never token state. */
import {
  LEGACY_GEOMETRY_VERSION, wheelsFor, gates, inputGates, OUTPUT_GATE,
  normalizeAngle, physicalAngleFor, angularDistance,
} from './geometry.js';
import { mouthInterval, openingAngleBounds } from './openings.js';

const EPSILON = 1e-8;
const CAPTURE_RADIUS = 14;
const PLATEAU = 5;
const MERGE_DISTANCE = 14;
const PRIORITY = { preparation: 1, input: 2, output: 2, paired: 3 };

function lift(angle, near) {
  return angle + Math.round((near - angle) / 360) * 360;
}

function target(faceIndex, version, wheelId, notch, gate, bounds, kind, portIds) {
  // The fixed passage axis is the seat, even when the companion is off-centre.
  // A passable stationary mouth always overlaps a moving mouth centred here.
  const angle = physicalAngleFor(faceIndex, wheelId, notch, gate, version);
  const sign = faceIndex === 0 ? 1 : -1;
  const offsets = bounds.map(bound => sign * bound).sort((a, b) => a - b);
  return { angle, start: angle + offsets[0], end: angle + offsets[1], kind, portIds };
}

function shifted(stop, angle) {
  const offset = angle - stop.angle;
  return { ...stop, angle, start: stop.start + offset, end: stop.end + offset };
}

function canonical(stop) {
  return shifted(stop, normalizeAngle(stop.angle));
}

/** Only coincident passage axes can share a stop. Nearby ports never create an
 * invented angle between them; a paired stop may still replace a preparation. */
function simplify(targets) {
  const stops = targets.map(canonical).sort((a, b) => a.angle - b.angle);
  let changed = true;
  while (changed && stops.length > 1) {
    changed = false;
    for (let index = 0; index < stops.length; index++) {
      const nextIndex = (index + 1) % stops.length;
      const a = stops[index];
      const b = shifted(stops[nextIndex], lift(stops[nextIndex].angle, a.angle));
      if (Math.abs(b.angle - a.angle) > MERGE_DISTANCE + EPSILON) continue;
      let replacement;
      if (Math.abs(b.angle - a.angle) <= EPSILON) {
        const preferred = PRIORITY[a.kind] >= PRIORITY[b.kind] ? a : b;
        replacement = canonical({
          ...preferred,
          portIds: [...new Set([...a.portIds, ...b.portIds])],
        });
      } else if (PRIORITY[a.kind] !== PRIORITY[b.kind]) {
        replacement = canonical(PRIORITY[a.kind] > PRIORITY[b.kind] ? a : b);
      } else continue;
      const low = Math.min(index, nextIndex);
      const high = Math.max(index, nextIndex);
      stops.splice(high, 1);
      stops.splice(low, 1, replacement);
      stops.sort((left, right) => left.angle - right.angle);
      changed = true;
      break;
    }
  }
  return stops.map((stop, index) => {
    const previous = index ? stops[index - 1].angle : stops.at(-1).angle - 360;
    const next = index + 1 < stops.length ? stops[index + 1].angle : stops[0].angle + 360;
    const radius = Math.min(CAPTURE_RADIUS, (stop.angle - previous) / 2, (next - stop.angle) / 2);
    return { angle: stop.angle, kind: stop.kind, portIds: Object.freeze([...stop.portIds]),
      radius, plateau: Math.min(PLATEAU, radius / 2) };
  });
}

/** Public ports for the moving wheel, with the companion held at its real angle. */
export function rotationGuideStops(view, wheelId) {
  const faceIndex = view?.faceIndex;
  if (faceIndex !== 0 && faceIndex !== 1) throw new RangeError('Face inconnue.');
  const version = view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const wheels = wheelsFor(version);
  if (!Number.isInteger(wheelId) || wheelId < 1 || wheelId > wheels.length) throw new RangeError('Roue inconnue.');
  if (!Array.isArray(view.angles) || view.angles.length !== wheels.length || !view.angles.every(Number.isFinite)) {
    throw new TypeError('Angles de roues invalides.');
  }
  const sign = faceIndex === 0 ? 1 : -1;
  const moving = wheels[wheelId - 1];
  const targets = [];
  const add = (gate, bounds, kind, portIds) => {
    for (let notch = 0; notch < moving.notches; notch++) {
      targets.push(target(faceIndex, version, wheelId, notch, gate, bounds, kind, portIds));
    }
  };
  for (const gate of gates(faceIndex)) {
    if (gate.from !== wheelId && gate.to !== wheelId) continue;
    const sourceMoves = gate.from === wheelId;
    const ownGate = sourceMoves ? gate.sourceAngle : gate.targetAngle;
    const companionId = sourceMoves ? gate.to : gate.from;
    const companionGate = sourceMoves ? gate.targetAngle : gate.sourceAngle;
    const companion = wheels[companionId - 1];
    const sourceId = `${gate.from}-${gate.to}-source`;
    const receiverId = `${gate.from}-${gate.to}-receiver`;
    let paired = false;
    for (let notch = 0; notch < companion.notches; notch++) {
      const angle = view.angles[companionId - 1] + sign * notch * 360 / companion.notches;
      const fixed = mouthInterval(companionId, angle, companionGate, true);
      const bounds = fixed && openingAngleBounds(wheelId, fixed);
      if (!bounds) continue;
      add(ownGate, bounds, 'paired', [sourceId, receiverId]);
      paired = true;
    }
    if (!paired) add(ownGate, openingAngleBounds(wheelId), 'preparation', [sourceMoves ? sourceId : receiverId]);
  }
  if (wheelId === 1) {
    const entrances = inputGates(version);
    entrances.forEach((angle, lane) => add(angle, openingAngleBounds(wheelId), 'input', [entrances.length > 1 ? `input-${lane}` : 'input']));
  }
  if (wheelId === 5) add(OUTPUT_GATE, openingAngleBounds(wheelId), 'output', ['output']);
  return simplify(targets);
}

function fieldAt(state, angle) {
  return state.stops.find(stop => Math.abs(angle - lift(stop.angle, angle)) < stop.radius - EPSILON) ?? null;
}

function attracted(stop, raw) {
  const center = lift(stop.angle, raw);
  const distance = raw - center;
  const absolute = Math.abs(distance);
  if (absolute >= stop.radius) return raw;
  if (absolute <= stop.plateau) return center;
  const t = (absolute - stop.plateau) / (stop.radius - stop.plateau);
  const corrected = (2 * stop.radius + stop.plateau) * t * t
    - (stop.radius + stop.plateau) * t * t * t;
  return center + Math.sign(distance) * corrected;
}

/** No movement on construction: even a saved off-center angle remains exact. */
export function createRotationGuide(view, wheelId) {
  const stops = rotationGuideStops(view, wheelId);
  const version = view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const angle = physicalAngleFor(view.faceIndex, wheelId, 0, view.angles[wheelId - 1], version);
  const exact = stops.find(stop => angularDistance(stop.angle, angle) <= EPSILON);
  return { wheelId, rawAngle: angle, appliedAngle: angle, stops,
    activeStop: exact ? { ...exact, angle } : null,
    arrivalLatch: exact ? { ...exact, angle } : null,
    arrivalCount: 0, moved: false, lastDirection: 0, initialField: fieldAt({stops}, angle),
    ignoredInitial: null, finished: false };
}

/** A broad exact plateau is continuous and monotone. Raw finger travel keeps
 * accumulating through it, so continuing or reversing can always leave a stop. */
export function advanceRotationGuide(state, physicalDelta) {
  if (!state || state.finished || !Number.isFinite(physicalDelta) || physicalDelta === 0
    || !Number.isFinite(state.rawAngle) || !Number.isFinite(state.appliedAngle)
    || !Array.isArray(state.stops) || !state.stops.length) return 0;
  const raw = state.rawAngle + physicalDelta;
  if (!Number.isFinite(raw) || raw === state.rawAngle) return 0;
  const direction = Math.sign(physicalDelta);
  if (!state.moved && state.initialField) {
    const stop = lift(state.initialField.angle, state.rawAngle);
    if (Math.abs(state.rawAngle - stop) > EPSILON && direction * (stop - state.rawAngle) < 0) {
      state.ignoredInitial = { ...state.initialField, angle: stop };
    }
  }
  if (state.ignoredInitial) {
    const ignored = state.ignoredInitial;
    if (Math.abs(raw - ignored.angle) >= ignored.radius - EPSILON
      || direction * (ignored.angle - state.rawAngle) > 0) state.ignoredInitial = null;
  }
  const field = fieldAt(state, raw);
  const ignored = field && state.ignoredInitial && angularDistance(field.angle, state.ignoredInitial.angle) <= EPSILON;
  const next = field && !ignored ? attracted(field, raw) : raw;
  const delta = next - state.appliedAngle;
  if (!Number.isFinite(delta)) return 0;
  const previous = state.arrivalLatch;
  if (previous && Math.abs(raw - previous.angle) >= previous.radius - EPSILON) state.arrivalLatch = null;
  const seated = field && !ignored && Math.abs(next - lift(field.angle, raw)) <= EPSILON;
  if (seated) {
    const angle = lift(field.angle, raw);
    if (!state.arrivalLatch || Math.abs(state.arrivalLatch.angle - angle) > EPSILON) state.arrivalCount++;
    state.activeStop = { ...field, angle };
    state.arrivalLatch = state.activeStop;
  } else state.activeStop = null;
  state.rawAngle = raw;
  state.appliedAngle = next;
  state.moved = true;
  state.lastDirection = direction;
  return delta;
}

/** Finish at the nearest passage axis after a real gesture, including a slight
 * overshoot. Leaving the capture field bypasses it; a tap never turns anything. */
export function finishRotationGuide(state) {
  if (!state || state.finished || !state.moved || !state.lastDirection
    || !Array.isArray(state.stops) || !state.stops.length) return 0;
  state.finished = true;
  let nearest = null;
  let travel = Infinity;
  for (const stop of state.stops) {
    if (state.ignoredInitial && angularDistance(stop.angle, state.ignoredInitial.angle) <= EPSILON) continue;
    const angle = lift(stop.angle, state.appliedAngle);
    const distance = Math.abs(angle - state.appliedAngle);
    const ahead = state.lastDirection * (angle - state.appliedAngle) > 0;
    if (distance <= stop.radius + EPSILON && (distance < travel - EPSILON
      || Math.abs(distance - travel) <= EPSILON && ahead)) {
      nearest = { ...stop, angle };
      travel = distance;
    }
  }
  if (!nearest || travel <= EPSILON) return 0;
  const delta = nearest.angle - state.appliedAngle;
  state.appliedAngle = nearest.angle;
  state.activeStop = nearest;
  if (!state.arrivalLatch || Math.abs(state.arrivalLatch.angle - nearest.angle) > EPSILON) state.arrivalCount++;
  state.arrivalLatch = nearest;
  return delta;
}
