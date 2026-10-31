const DEGREES_PER_RADIAN = 180 / Math.PI;
const EPSILON = 1e-10;

function nonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function angleAt(center, point, deadRadius) {
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y)
    || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  const x = point.x - center.x;
  const y = point.y - center.y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) <= deadRadius) return null;
  return Math.atan2(y, x) * DEGREES_PER_RADIAN;
}

function angularDelta(previous, next) {
  const raw = next - previous;
  let delta = ((raw + 180) % 360 + 360) % 360 - 180;
  // An exact half-turn has two possible paths. Preserve the observed sign.
  if (delta === -180 && raw > 0) delta = 180;
  return Math.abs(delta) < EPSILON ? 0 : delta;
}

/**
 * Start a direct wheel drag in screen coordinates (clockwise is positive).
 * The returned state belongs to this pointer only; discard it on release or cancel.
 */
export function createWheelGesture(center, point, options = {}) {
  const origin = { x: center?.x, y: center?.y };
  const deadRadius = nonNegative(options?.deadRadius, 12);
  return {
    center: origin,
    deadRadius,
    activationDegrees: nonNegative(options?.activationDegrees, 2),
    lastAngle: angleAt(origin, point, deadRadius),
    pendingDegrees: 0,
    active: false,
  };
}

/**
 * Advance a drag and return its signed, unsnapped angular change in degrees.
 * Before activation, small back-and-forth movements cancel instead of adding up.
 * Entering the hub (or receiving an invalid point) drops the angular baseline;
 * the first valid point outside the hub then rearms without moving the wheel.
 */
export function advanceWheelGesture(gesture, point) {
  if (!gesture || typeof gesture !== 'object') return 0;
  const angle = angleAt(gesture.center, point, gesture.deadRadius);
  if (angle === null) {
    gesture.lastAngle = null;
    gesture.pendingDegrees = 0;
    return 0;
  }
  if (!Number.isFinite(gesture.lastAngle)) {
    gesture.lastAngle = angle;
    gesture.pendingDegrees = 0;
    return 0;
  }

  const delta = angularDelta(gesture.lastAngle, angle);
  gesture.lastAngle = angle;
  if (gesture.active) return delta;

  gesture.pendingDegrees += delta;
  if (Math.abs(gesture.pendingDegrees) + EPSILON < gesture.activationDegrees) return 0;
  const activatedDelta = gesture.pendingDegrees;
  // An immobile pointer never engages, including when the threshold is zero.
  if (Math.abs(activatedDelta) < EPSILON) return 0;
  gesture.active = true;
  gesture.pendingDegrees = 0;
  return activatedDelta;
}
