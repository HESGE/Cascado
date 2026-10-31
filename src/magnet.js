/** Gentle seating into fixed mechanical alignments, independent of a game. */
import { mechanicalDetents } from './detents.js';

const MAX_RADIUS = 5;
const MAX_PLATEAU = 1;
const FIELDS = new Map();

function fieldsFor(wheelId, geometryVersion) {
  // Validate before stringifying the key: an invalid "1" must not reuse R1's field.
  const stops = mechanicalDetents(wheelId, geometryVersion);
  if (!stops.length) return [];
  const key = `${geometryVersion ?? 'current'}:${wheelId}`;
  if (FIELDS.has(key)) return FIELDS.get(key);
  const fields = stops.map((angle, index) => {
    const previous = index ? stops[index - 1] : stops.at(-1) - 360;
    const next = index + 1 < stops.length ? stops[index + 1] : stops[0] + 360;
    // Neighbouring fields never overlap, even for the very close stops on R2.
    const radius = Math.min(MAX_RADIUS, (angle - previous) / 2, (next - angle) / 2);
    return { angle, radius, plateau: Math.min(MAX_PLATEAU, radius / 4) };
  });
  FIELDS.set(key, fields);
  return fields;
}

function liftedStop(field, rawAngle) {
  return field.angle + Math.round((rawAngle - field.angle) / 360) * 360;
}

function initialActiveStop(wheelId, rawAngle, geometryVersion) {
  if (!Number.isFinite(rawAngle)) return null;
  for (const field of fieldsFor(wheelId, geometryVersion)) {
    const stop = liftedStop(field, rawAngle);
    if (Math.abs(rawAngle - stop) <= field.plateau) return stop;
  }
  return null;
}

/** Arrival notifications have their own geometric latch. A plateau can be
 * crossed between samples, but jitter cannot retrigger it before leaving the
 * complete attraction field. Counting periodic entry boundaries avoids a loop
 * per revolution, including for a large coalesced movement. */
function arrivalSignal(state, nextRaw) {
  const fields = fieldsFor(state.wheelId, state.geometryVersion);
  const start = state.rawAngle;
  const direction = Math.sign(nextRaw - start);
  const active = state.activeStop === undefined
    ? initialActiveStop(state.wheelId, start, state.geometryVersion) : state.activeStop;
  const latch = Number.isFinite(active) ? fields.find(field => {
    const stop = liftedStop(field, start);
    return Math.abs(stop - active) < 1e-8 && Math.abs(start - stop) <= field.radius;
  }) : null;
  let arrivals = 0;

  for (const field of fields) {
    const entry = field.angle - direction * field.plateau;
    // Include the finishing boundary, exclude the starting one in either sense.
    const first = direction > 0
      ? Math.floor((start - entry) / 360) + 1 : Math.ceil((nextRaw - entry) / 360);
    const last = direction > 0
      ? Math.floor((nextRaw - entry) / 360) : Math.ceil((start - entry) / 360) - 1;
    let crossed = Math.max(0, last - first + 1);
    if (crossed && field === latch) {
      const revolution = Math.round((active - field.angle) / 360);
      if (revolution >= first && revolution <= last) crossed -= 1;
    }
    arrivals += crossed;
  }

  let activeStop = null;
  if (latch && Math.abs(nextRaw - active) <= latch.radius) activeStop = active;
  else for (const field of fields) {
    const stop = liftedStop(field, nextRaw);
    if (Math.abs(nextRaw - stop) > field.radius) continue;
    const low = Math.min(start, nextRaw);
    const high = Math.max(start, nextRaw);
    if (low <= stop + field.plateau && high >= stop - field.plateau) {
      activeStop = stop;
      break;
    }
  }
  const previousCount = Number.isSafeInteger(state.arrivalCount) && state.arrivalCount >= 0
    ? state.arrivalCount : 0;
  return { arrivalCount: Math.min(Number.MAX_SAFE_INTEGER, previousCount + arrivals), activeStop };
}

/** Correct an unwrapped physical angle, retaining all complete revolutions.
 * The flat centre gives an exact alignment. The cubic meets it with slope zero
 * and rejoins the freely moving angle with slope one: no jump on leaving it. */
export function magnetizeAngle(wheelId, rawAngle, geometryVersion) {
  if (!Number.isFinite(rawAngle)) return rawAngle;
  for (const { angle, radius, plateau } of fieldsFor(wheelId, geometryVersion)) {
    const stop = angle + Math.round((rawAngle - angle) / 360) * 360;
    if (!Number.isFinite(stop)) continue;
    const distance = rawAngle - stop;
    const absolute = Math.abs(distance);
    if (absolute >= radius) continue;
    if (absolute <= plateau) return stop;
    const t = (absolute - plateau) / (radius - plateau);
    const attracted = (2 * radius + plateau) * t * t - (radius + plateau) * t * t * t;
    return rawAngle + Math.sign(distance) * (attracted - absolute);
  }
  return rawAngle;
}

/** Starting or holding a drag never snaps an existing, possibly saved angle. */
export function createMagneticDrag(wheelId, initialPhysicalAngle, geometryVersion) {
  return {
    wheelId, rawAngle: initialPhysicalAngle, appliedAngle: initialPhysicalAngle,
    ...(geometryVersion === undefined ? {} : {geometryVersion}),
    arrivalCount: 0, activeStop: initialActiveStop(wheelId, initialPhysicalAngle, geometryVersion),
  };
}

/** Advance only on genuine finger movement. Raw finger travel is never reset
 * to a snapped angle, so tiny movements accumulate and can always leave a stop.
 * The returned physical delta can be passed directly to the simulation. */
export function advanceMagneticDrag(state, physicalDelta) {
  if (!Number.isFinite(physicalDelta) || physicalDelta === 0 || !state
    || !Number.isFinite(state.rawAngle) || !Number.isFinite(state.appliedAngle)
    || !mechanicalDetents(state.wheelId, state.geometryVersion).length) return 0;
  const nextRaw = state.rawAngle + physicalDelta;
  if (!Number.isFinite(nextRaw) || nextRaw === state.rawAngle) return 0;
  const nextApplied = magnetizeAngle(state.wheelId, nextRaw, state.geometryVersion);
  const delta = nextApplied - state.appliedAngle;
  if (!Number.isFinite(delta)) return 0;
  const signal = arrivalSignal(state, nextRaw);
  state.rawAngle = nextRaw;
  state.appliedAngle = nextApplied;
  state.arrivalCount = signal.arrivalCount;
  state.activeStop = signal.activeStop;
  return delta;
}
