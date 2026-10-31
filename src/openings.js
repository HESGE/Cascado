/** The visible U mouths, projected onto the common tangent of a passage. */
import { WHEELS, NOTCH_RADIUS, normalizeAngle } from './geometry.js';

export const PASSAGE_HALF_WIDTH = NOTCH_RADIUS;
export const MIN_PASSAGE_WIDTH = 20;
export const OVERLAP_TOLERANCE = 1e-7;
const DEGREES = 180 / Math.PI;
const CORRIDOR = Object.freeze([-PASSAGE_HALF_WIDTH, PASSAGE_HALF_WIDTH]);

function wheelFor(wheelId) {
  const wheel = Number.isInteger(wheelId) ? WHEELS[wheelId - 1] : null;
  if (!wheel) throw new RangeError('Roue inconnue.');
  return wheel;
}

/** Half the angular opening of the 28-unit U at the wheel's outer contour. */
export function mouthHalfAngle(wheelId) {
  return Math.asin(PASSAGE_HALF_WIDTH / wheelFor(wheelId).radius) * DEGREES;
}

/** Contact counts as overlap; canonical contacts never return hi < lo. */
export function overlapIntervals(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)
    || a.length !== 2 || b.length !== 2
    || ![...a, ...b].every(Number.isFinite)
    || a[0] > a[1] || b[0] > b[1]) return null;
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  if (lo > hi + OVERLAP_TOLERANCE) return null;
  if (lo > hi) {
    const contact = (lo + hi) / 2;
    return [contact, contact];
  }
  return [lo, hi];
}

/** Visible mouth in the gate's tangent coordinates, clipped to its corridor.
 * The receiver faces the other way: reversed expresses it in the source's
 * tangent coordinates. Rear-facing openings cannot reach this passage. */
export function mouthInterval(wheelId, localNotchAngle, gateAngle, reversed = false) {
  const wheel = wheelFor(wheelId);
  if (!Number.isFinite(localNotchAngle) || !Number.isFinite(gateAngle)) return null;
  const delta = normalizeAngle(localNotchAngle - gateAngle + 180) - 180;
  if (Math.abs(delta) >= 90) return null;
  const half = mouthHalfAngle(wheelId);
  let lo = wheel.radius * Math.sin((delta - half) / DEGREES);
  let hi = wheel.radius * Math.sin((delta + half) / DEGREES);
  if (reversed) [lo, hi] = [-hi, -lo];
  const interval = overlapIntervals([lo, hi], CORRIDOR);
  return interval?.map(value => Math.max(CORRIDOR[0], Math.min(CORRIDOR[1], value))) ?? null;
}

/** A narrow sliver or rim contact no longer lets a token through. */
export function isPassableOpening(interval) {
  return Array.isArray(interval)&&interval.length===2&&interval.every(Number.isFinite)
    && interval[1]-interval[0]>=MIN_PASSAGE_WIDTH-OVERLAP_TOLERANCE;
}

export function passableMouthInterval(wheelId,localNotchAngle,gateAngle,reversed=false) {
  const interval=mouthInterval(wheelId,localNotchAngle,gateAngle,reversed);
  return isPassableOpening(interval)?interval:null;
}

/** Analytic local offsets at which a moving mouth first/last shares 20 units with a fixed
 * interval. The companion must already use the moving gate's tangent frame. */
export function openingAngleBounds(wheelId, companionInterval = CORRIDOR) {
  const wheel = wheelFor(wheelId);
  const interval = overlapIntervals(companionInterval, CORRIDOR);
  if (!isPassableOpening(interval)) return null;
  const [lo, hi] = interval.map(value => Math.max(CORRIDOR[0], Math.min(CORRIDOR[1], value)));
  const half = mouthHalfAngle(wheelId);
  const lower=Math.asin((lo+MIN_PASSAGE_WIDTH)/wheel.radius)*DEGREES-half;
  const upper=Math.asin((hi-MIN_PASSAGE_WIDTH)/wheel.radius)*DEGREES+half;
  // Canonicalise a round-off-sized contact at exactly the required width.
  return lower>upper?[(lower+upper)/2,(lower+upper)/2]:[lower,upper];
}

/** A sufficiently wide shared opening; a first rim contact is not enough. */
export function openingOverlap(sourceId, sourcePhi, sourceGate, targetId, targetPhi, targetGate) {
  const interval=overlapIntervals(mouthInterval(sourceId, sourcePhi, sourceGate),
    mouthInterval(targetId, targetPhi, targetGate, true));
  return isPassableOpening(interval)?interval:null;
}
