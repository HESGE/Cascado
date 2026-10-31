import { AI_MAX_FRAME_MS } from './ai-motion.js';

/** Speed is a presentation preference, independent of an AI's playing level. */
export const AI_SPEEDS = Object.freeze([
  Object.freeze({ id: 'slow', label: 'Lent', rate: .5, full: false }),
  Object.freeze({ id: 'normal', label: 'Normal', rate: 1, full: false }),
  Object.freeze({ id: 'fast', label: 'Rapide', rate: 2, full: false }),
  Object.freeze({ id: 'full', label: 'Full', rate: 0, full: true }),
]);

export function normalizeAISpeed(value) {
  return AI_SPEEDS.some(profile => profile.id === value) ? value : 'normal';
}

export function aiSpeedProfile(value) {
  return AI_SPEEDS.find(profile => profile.id === normalizeAISpeed(value));
}

/** Keep remaining virtual time rather than a deadline, so changing speed or
 * pausing does not restart the wait or count time spent outside the game. */
export function createAIWait(durationMs) {
  const valid = Number.isFinite(durationMs) && durationMs > 0;
  return { remainingMs: valid ? durationMs : 0, done: !valid };
}

/** Return whether the wait is complete. Cap real elapsed time before applying
 * the current rate: a slow/background frame cannot consume an entire turn,
 * while Rapide remains twice as fast as Normal at every frame cadence.
 * Full explicitly skips the remaining wait, even without an elapsed frame. */
export function advanceAIWait(state, elapsedMs, speed = 'normal') {
  if (!state || state.done) return true;
  const profile = aiSpeedProfile(speed);
  if (profile.full) {
    state.remainingMs = 0;
    state.done = true;
    return true;
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
  state.remainingMs = Math.max(0, state.remainingMs - Math.min(elapsedMs, AI_MAX_FRAME_MS) * profile.rate);
  if (state.remainingMs < 1e-9) state.remainingMs = 0;
  state.done = state.remainingMs === 0;
  return state.done;
}
