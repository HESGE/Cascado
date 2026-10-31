/** Presentation-only movement. Inputs are authorised local projections and
 * already filtered transfers; this module never receives a complete game. */
import { WHEELS, LEGACY_GEOMETRY_VERSION, centerFor, queuePosition, trayPosition, trayEntry, notchAngle } from './geometry.js';
import { tokenTotal, tokenSeries, queueLanes } from './tokens.js';

export const ROTOR_DURATION = 100;
export const FALL_DURATION = 280;
export const EXIT_DURATION = 420;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const geometryOf = view => view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
const validToken = (value, total) => Number.isInteger(value) && value >= 1 && value <= total;
const controllers = new WeakMap();
const locationKey = location => `${location.kind}:${location.wheel ?? ''}:${location.notch ?? ''}:${location.lane ?? ''}:${location.index ?? ''}`;
const angleDelta = (from, to) => ((to - from + 540) % 360 + 360) % 360 - 180;

function positionAt(view, location, angles = view.angles) {
  if (location.kind === 'queue') return queuePosition(location.index, location.lane ?? 0, geometryOf(view));
  if (location.kind === 'tray') return trayPosition(view.faceIndex, location.index, geometryOf(view));
  const wheel = WHEELS[location.wheel - 1];
  const center = centerFor(view.faceIndex, location.wheel);
  const direction = view.faceIndex === 1 ? -1 : 1;
  const radians = ((angles?.[location.wheel - 1] ?? 0) + direction * location.notch * 360 / wheel.notches) * Math.PI / 180;
  return { x: center.x + wheel.seatRadius * Math.cos(radians), y: center.y + wheel.seatRadius * Math.sin(radians) };
}

/** Stable token identities let a refreshed SVG retain its in-flight positions. */
export function tokenPositions(view, angles = view.angles) {
  const result = [];
  const total = tokenTotal(geometryOf(view));
  const add = (token, location) => {
    if (validToken(token, total)) result.push({ token, ...positionAt(view, location, angles), location });
  };
  queueLanes(view, geometryOf(view)).forEach((queue, lane) => queue.slice(0, 5)
    .forEach((token, index) => add(token, { kind: 'queue', lane, index })));
  (view.slots ?? []).forEach((slots, wheel) => slots.forEach((token, notch) => add(token, { kind: 'wheel', wheel: wheel + 1, notch })));
  (view.exited ?? []).slice(0, total).forEach((token, index) => add(token,
    { kind: 'tray', lane: total > 5 ? tokenSeries(token) : 0, index: total > 5 ? token - 1 : index }));
  return result;
}

function transferPosition(view, transfer, location) {
  const angles = [...view.angles];
  if (Number.isInteger(transfer.wheel) && Number.isFinite(transfer.angle)) angles[transfer.wheel - 1] = notchAngle(view.faceIndex, transfer.wheel, 0, transfer.angle, geometryOf(view));
  return positionAt(view, { kind: 'wheel', wheel: location.wheel, notch: location.notch }, angles);
}

/** Build the visible paths, including every intermediate transfer in a detent.
 * The tray path descends to its high end, then slides downhill to its slot. */
export function planTokenMotion(before, after, events = []) {
  if (before.faceIndex !== after.faceIndex) return [];
  const old = new Map(tokenPositions(before).map(token => [token.token, token]));
  return tokenPositions(after).flatMap(target => {
    const source = old.get(target.token);
    if (!source) return [];
    const transfers = events.filter(event => event.token === target.token && (event.face == null || event.face === after.faceIndex) && event.from && event.to);
    const changed = locationKey(source.location) !== locationKey(target.location);
    if (!changed && !transfers.length) return [];
    const points = [{ x: source.x, y: source.y }];
    let exited = false;
    for (const transfer of transfers) {
      if (transfer.to.wheel) points.push(transferPosition(after, transfer, transfer.to));
      else if (transfer.to.exited) exited = true;
    }
    if (target.location.kind === 'tray') {
      // The chute mirrors with wheel 5; the numbered slope always reads 1–5
      // left to right, with 1 at its lowest end on either face.
      const output = centerFor(after.faceIndex, 5);
      points.push({ x: output.x, y: 477 }, trayEntry(after.faceIndex, geometryOf(after), target.location.lane ?? 0));
      exited = true;
    }
    if (!points.length || Math.hypot(points.at(-1).x - target.x, points.at(-1).y - target.y) > .001) points.push({ x: target.x, y: target.y });
    return [{ token: target.token, location: target.location, points,
      kind: exited ? 'exit' : transfers.length || source.location.kind !== target.location.kind ? 'fall' : 'slide',
      duration: exited ? EXIT_DURATION : transfers.length ? FALL_DURATION + Math.max(0, transfers.length - 1) * 120 : 200 }];
  });
}

/** Piecewise smooth paths stay in their connecting corridor, with no bounce
 * through a wheel or through the tray's bottom. */
export function sampleTokenPath(plan, progress, liveTarget = plan.points.at(-1)) {
  const t = clamp(progress);
  if (t === 1) return { x: liveTarget.x, y: liveTarget.y };
  const lengths = plan.points.slice(1).map((point, i) => Math.max(1, Math.hypot(point.x - plan.points[i].x, point.y - plan.points[i].y)));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = t * total;
  let index = 0;
  while (index < lengths.length - 1 && remaining > lengths[index]) { remaining -= lengths[index]; index += 1; }
  const segment = lengths[index] || 1;
  const local = clamp(remaining / segment);
  // Gravity gently accelerates the drop; the final collection slide decelerates.
  const shaped = plan.kind === 'exit' && index < lengths.length - 1 ? local * local : ease(local);
  const point = mix(plan.points[index], plan.points[index + 1] ?? plan.points[index], shaped);
  const nominal = plan.points.at(-1);
  const carry = ease(t);
  return { x: point.x + (liveTarget.x - nominal.x) * carry, y: point.y + (liveTarget.y - nominal.y) * carry };
}

function snapshot(controller, now) {
  const rotation = controller.rotorDuration === 0 ? 1 : clamp((now - controller.started) / controller.rotorDuration);
  const angles = rotation === 1 ? controller.targetAngles : controller.targetAngles.map((angle, i) => controller.startAngles[i] + angleDelta(controller.startAngles[i], angle) * ease(rotation));
  const positions = tokenPositions(controller.view, angles);
  let moving = rotation < 1 && controller.targetAngles.some((angle, i) => Math.abs(angleDelta(controller.startAngles[i], angle)) > .001);
  for (const position of positions) {
    const path = controller.paths.get(position.token);
    if (!path) continue;
    const progress = clamp((now - path.started) / path.duration);
    if (progress < 1) {
      const point = sampleTokenPath(path, progress, position);
      if (path.retarget) {
        // A directly dragged receiver moves immediately. Keep its falling
        // token continuous, then join the new seat at the original deadline.
        const remaining = 1 - ease((progress - path.retarget.progress) / (1 - path.retarget.progress));
        point.x += path.retarget.x * remaining;
        point.y += path.retarget.y * remaining;
      }
      Object.assign(position, point);
      moving = true;
    }
  }
  return { angles, positions, moving };
}

function paint(container, controller, now) {
  const sampled = snapshot(controller, now);
  for (const path of controller.paths.values()) {
    if (!path.arrived && now >= path.started + path.duration) {
      path.arrived = true;
      if (path.kind !== 'slide') path.onDrop?.(path);
    }
  }
  container.querySelectorAll('[data-wheel-rotor]').forEach(node => {
    const angle = sampled.angles[Number(node.dataset.wheelRotor) - 1];
    node.setAttribute('transform', `rotate(${angle.toFixed(4)})`);
  });
  const nodes = new Map([...container.querySelectorAll('[data-token]')].map(node => [Number(node.dataset.token), node]));
  for (const position of sampled.positions) nodes.get(position.token)?.setAttribute('transform', `translate(${position.x.toFixed(4)} ${position.y.toFixed(4)})`);
  return sampled.moving;
}

function scheduleFrame(container, controller) {
  if (controller.frame) cancelAnimationFrame(controller.frame);
  controller.frame = requestAnimationFrame(time => {
    controller.frame = 0;
    if (controllers.get(container) !== controller) return;
    if (!container.isConnected) { cancelBoardMotion(container); return; }
    if (paint(container, controller, time)) scheduleFrame(container, controller);
  });
}

/** Call after renderBoard replaces the SVG inside its stable container.
 * Repeated cranks retarget from the current visible angles and positions.
 * A fall already underway keeps its own clock, even while its receiver turns.
 * Direct manipulation skips rotor easing while retaining the token paths.
 * Duration scaling applies to new token paths. Explicit speed changes can
 * rescale the existing paths with retimeBoardMotion. */
export function animateBoard(container, before, after, { events = [], onSlide, onDrop, reducedMotion, directRotation = false, durationScale = 1 } = {}) {
  if (!container || before.faceIndex !== after.faceIndex) { cancelBoardMotion(container); return; }
  const now = performance.now();
  const previous = controllers.get(container);
  // A new detent may arrive exactly between the final two visual frames.
  // Finish its visible impact once before retiring that path.
  for (const path of previous?.paths.values() ?? []) {
    if (!path.arrived && now >= path.started + path.duration) {
      path.arrived = true;
      if (path.kind !== 'slide') path.onDrop?.(path);
    }
  }
  const current = previous ? snapshot(previous, now) : { angles: before.angles, positions: tokenPositions(before) };
  if (previous?.frame) cancelAnimationFrame(previous.frame);
  const minimal = reducedMotion ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (minimal) {
    controllers.delete(container);
    for (const plan of planTokenMotion(before, after, events)) { onSlide?.(plan); if (plan.kind !== 'slide') onDrop?.(plan); }
    return;
  }
  const oldPositions = new Map(current.positions.map(position => [position.token, position]));
  const newPlans = new Map(planTokenMotion(before, after, events).map(plan => [plan.token, plan]));
  const paths = new Map();
  for (const position of tokenPositions(after, directRotation ? after.angles : current.angles)) {
    const plan = newPlans.get(position.token);
    const existing = previous?.paths.get(position.token);
    if (plan) {
      const start = oldPositions.get(position.token);
      if (start) plan.points[0] = { x: start.x, y: start.y };
      const duration = plan.duration * (Number.isFinite(durationScale) && durationScale > 0 ? durationScale : 1);
      if (Number.isFinite(duration) && duration > 0) plan.duration = duration;
      paths.set(position.token, { ...plan, started: now, onDrop, arrived: false });
      onSlide?.(plan);
    } else if (existing && now < existing.started + existing.duration && locationKey(existing.location) === locationKey(position.location)) {
      const progress = clamp((now - existing.started) / existing.duration);
      const start = oldPositions.get(position.token);
      const base = sampleTokenPath(existing, progress, position);
      paths.set(position.token, { ...existing, retarget: {
        progress, x: start.x - base.x, y: start.y - base.y,
      } });
    }
  }
  const controller = { view: after, paths, startAngles: current.angles, targetAngles: after.angles, rotorDuration: directRotation ? 0 : ROTOR_DURATION, started: now, frame: 0 };
  controllers.set(container, controller);
  paint(container, controller, now);
  scheduleFrame(container, controller);
}

/** Change the speed of this container's current authorised presentation.
 * Keeping the same progress in every path preserves its visible point and any
 * receiver correction. The raw model and future animation plans are untouched. */
export function retimeBoardMotion(container, ratio) {
  if (!container || !Number.isFinite(ratio) || ratio <= 0) return;
  const controller = controllers.get(container);
  if (!controller) return;
  if (!container.isConnected) { cancelBoardMotion(container); return; }
  const now = performance.now();
  const clocks = [...controller.paths.values()].filter(path => !path.arrived && now < path.started + path.duration);
  if (controller.rotorDuration > 0 && now < controller.started + controller.rotorDuration) clocks.push({ duration: controller.rotorDuration });
  if (clocks.some(clock => !Number.isFinite(clock.duration * ratio) || clock.duration * ratio <= 0)) return;
  // Settle an impact that became due between frames before changing deadlines.
  const moving = paint(container, controller, now);
  if (controllers.get(container) !== controller) return;
  for (const path of controller.paths.values()) {
    if (path.arrived) continue;
    const progress = clamp((now - path.started) / path.duration);
    path.duration *= ratio;
    path.started = now - progress * path.duration;
  }
  if (controller.rotorDuration > 0 && now < controller.started + controller.rotorDuration) {
    const progress = clamp((now - controller.started) / controller.rotorDuration);
    controller.rotorDuration *= ratio;
    controller.started = now - progress * controller.rotorDuration;
  }
  if (controller.frame) cancelAnimationFrame(controller.frame);
  controller.frame = 0;
  if (moving) scheduleFrame(container, controller);
}

/** Present pending visible arrivals immediately when switching to full speed.
 * Slide callbacks already ran at departure; only each remaining impact is
 * emitted here. A masked or removed board must stay silent. */
export function finishBoardMotion(container) {
  const controller = container && controllers.get(container);
  if (!controller) return;
  if (!container.isConnected) { cancelBoardMotion(container); return; }
  if (controller.frame) cancelAnimationFrame(controller.frame);
  controller.frame = 0;
  paint(container, controller, Infinity);
  controllers.delete(container);
}

/** Remaining presentation time lets a spectator follow a fall before the
 * next action. It reads only this container's authorised visible animation. */
export function boardMotionRemaining(container) {
  const controller = container?.isConnected && controllers.get(container);
  if (!controller) return 0;
  const now = performance.now();
  const turning = controller.targetAngles.some((angle, i) => Math.abs(angleDelta(controller.startAngles[i], angle)) > .001);
  let remaining = turning ? Math.max(0, controller.started + controller.rotorDuration - now) : 0;
  for (const path of controller.paths.values()) {
    if (!path.arrived) remaining = Math.max(remaining, path.started + path.duration - now);
  }
  return Math.max(0, remaining);
}

/** Cancel before masking; no private token persists outside the removed SVG. */
export function cancelBoardMotion(container) {
  const controller = container && controllers.get(container);
  if (controller?.frame) cancelAnimationFrame(controller.frame);
  if (container) controllers.delete(container);
}
