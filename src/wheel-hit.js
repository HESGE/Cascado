/** Start a wheel gesture using public circles measured in CSS screen pixels.
 * This helper is never a constraint on an already captured pointer. */
export const WHEEL_GRAB_MARGIN = 16;
const EPSILON = 1e-7;

function nearer(candidate, current) {
  return !current || candidate.edge < current.edge - EPSILON
    || (Math.abs(candidate.edge - current.edge) <= EPSILON && candidate.id < current.id);
}

/** Return a wheel ID or null. Supply all five circles, including forbidden
 * wheels: permission is checked separately after resolving the physical target.
 * An actual wheel body always wins over any neighbour's enlarged collar.
 * In the collars, choose the closest rim, with a stable ID tie break. */
export function wheelAtPoint(point, wheels, { margin = WHEEL_GRAB_MARGIN } = {}) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Array.isArray(wheels)) return null;
  const padding = Number.isFinite(margin) && margin >= 0 ? margin : WHEEL_GRAB_MARGIN;
  let body = null;
  let collar = null;
  for (const wheel of wheels) {
    if (!wheel || !Number.isInteger(wheel.id) || wheel.id < 1 || wheel.id > 5
      || !Number.isFinite(wheel.x) || !Number.isFinite(wheel.y)
      || !Number.isFinite(wheel.radius) || wheel.radius <= 0) continue;
    const distance = Math.hypot(point.x - wheel.x, point.y - wheel.y);
    if (!Number.isFinite(distance)) continue;
    const candidate = { id: wheel.id, edge: distance - wheel.radius };
    if (candidate.edge <= EPSILON) {
      if (nearer(candidate, body)) body = candidate;
    } else if (candidate.edge <= padding + EPSILON && nearer(candidate, collar)) collar = candidate;
  }
  return body?.id ?? collar?.id ?? null;
}
