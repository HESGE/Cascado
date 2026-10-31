/** Opening cues use only the displayed face's wheel geometry. Token state is
 * deliberately absent: an open passage may be empty or occupied. */
import { LEGACY_GEOMETRY_VERSION, wheelsFor, gates, normalizeAngle } from './geometry.js';
import { mouthInterval, openingAngleBounds } from './openings.js';

export const PASSAGE_FEEDBACK_HYSTERESIS = .2;
const EPSILON = 1e-9;

/** Canonical periodic windows, joined across zero when necessary. */
function mergeWindows(intervals) {
  const pieces = intervals.flatMap(([low, high]) => {
    if (high - low >= 360 - EPSILON) return [[0, 360]];
    const start = normalizeAngle(low);
    const end = start + high - low;
    return end > 360 ? [[start, 360], [0, end - 360]] : [[start, end]];
  }).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of pieces) {
    const last = merged.at(-1);
    if (last && start <= last[1] + EPSILON) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  if (merged.length > 1 && merged[0][0] <= EPSILON && merged.at(-1)[1] >= 360 - EPSILON) {
    const first = merged.shift();
    merged.at(-1)[1] = 360 + first[1];
  }
  return merged;
}

function liftedWindow(window, angle) {
  const revolution = Math.round((angle - (window[0] + window[1]) / 2) / 360);
  return { start: window[0] + revolution * 360, end: window[1] + revolution * 360 };
}

function contains(window, angle, margin = 0) {
  return angle >= window.start - margin - EPSILON && angle <= window.end + margin + EPSILON;
}

function initialLatch(windows, angle) {
  for (const window of windows) {
    const lifted = liftedWindow(window, angle);
    if (contains(lifted, angle)) return lifted;
  }
  return null;
}

/** The local angles are those of getView: notch zero in screen coordinates.
 * Other wheels stay fixed for this gesture; no slots or queue are consulted. */
export function createPassageFeedbackTracker(view, wheelId) {
  const faceIndex = view?.faceIndex;
  if (faceIndex !== 0 && faceIndex !== 1) throw new RangeError('Face inconnue.');
  const geometryVersion = view.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  const wheels = wheelsFor(geometryVersion);
  if (!Number.isInteger(wheelId) || wheelId < 1 || wheelId > wheels.length) throw new RangeError('Roue inconnue.');
  const angles = view.angles;
  if (!Array.isArray(angles) || angles.length !== wheels.length || !angles.every(Number.isFinite)) {
    throw new TypeError('Angles de roues invalides.');
  }
  const direction = faceIndex === 0 ? 1 : -1;
  const moving = wheels[wheelId - 1];
  const angle = angles[wheelId - 1];
  const passages = gates(faceIndex).filter(gate => gate.from === wheelId || gate.to === wheelId).map(gate => {
    const sourceMoves = gate.from === wheelId;
    const companionId = sourceMoves ? gate.to : gate.from;
    const ownGate = sourceMoves ? gate.sourceAngle : gate.targetAngle;
    const companionGate = sourceMoves ? gate.targetAngle : gate.sourceAngle;
    const companion = wheels[companionId - 1];
    const intervals = [];
    for (let notch = 0; notch < companion.notches; notch += 1) {
      const companionAngle = angles[companionId - 1] + direction * notch * 360 / companion.notches;
      // Express the stationary mouth in the moving wheel's tangent frame,
      // whether the moving wheel is the source or the receiver.
      const fixed = mouthInterval(companionId, companionAngle, companionGate, true);
      const bounds = fixed && openingAngleBounds(wheelId, fixed);
      if (!bounds) continue;
      for (let ownNotch = 0; ownNotch < moving.notches; ownNotch += 1) {
        const offset = ownGate - direction * ownNotch * 360 / moving.notches;
        intervals.push([offset + bounds[0], offset + bounds[1]]);
      }
    }
    const windows = mergeWindows(intervals);
    return { windows, active: initialLatch(windows, angle) };
  });
  return { angle, passages };
}

/** Count genuine entries, including windows crossed between samples. A small
 * release margin prevents repeated cues when the finger jitters at an edge. */
export function advancePassageFeedbackTracker(tracker, localAppliedDelta) {
  if (!tracker || !Number.isFinite(tracker.angle) || !Array.isArray(tracker.passages)
    || !Number.isFinite(localAppliedDelta) || localAppliedDelta === 0) return 0;
  const start = tracker.angle;
  const end = start + localAppliedDelta;
  if (!Number.isFinite(end) || end === start) return 0;
  const direction = Math.sign(localAppliedDelta);
  let count = 0;
  for (const passage of tracker.passages) {
    const previous = passage.active;
    for (const window of passage.windows) {
      if (window[1] - window[0] >= 360 - EPSILON) continue;
      const entry = direction > 0 ? window[0] : window[1];
      // Include the finish, exclude the start: a boundary is never counted twice.
      const first = direction > 0
        ? Math.floor((start - entry) / 360) + 1 : Math.ceil((end - entry) / 360);
      const last = direction > 0
        ? Math.floor((end - entry) / 360) : Math.ceil((start - entry) / 360) - 1;
      let entered = Math.max(0, last - first + 1);
      if (entered && previous) {
        const revolution = Math.round((previous.start - window[0]) / 360);
        if (Math.abs(previous.start - (window[0] + revolution * 360)) <= EPSILON
          && revolution >= first && revolution <= last) entered -= 1;
      }
      count = Math.min(Number.MAX_SAFE_INTEGER, count + entered);
    }
    passage.active = previous && contains(previous, end, PASSAGE_FEEDBACK_HYSTERESIS) ? previous : null;
    if (!passage.active) for (const window of passage.windows) {
      const lifted = liftedWindow(window, end);
      const crossed = Math.min(start, end) <= lifted.end && Math.max(start, end) >= lifted.start;
      if (crossed && contains(lifted, end, PASSAGE_FEEDBACK_HYSTERESIS)) {
        passage.active = lifted;
        break;
      }
    }
  }
  tracker.angle = end;
  return count;
}
