/** Visible AI pacing. All angles remain signed, unwrapped local wheel travel. */
export const AI_THINK_MS = 900;
export const AI_SELECT_MS = 500;
export const AI_SPEED_DEG_PER_SECOND = 90;
export const AI_TOKEN_DURATION_SCALE = 1.5;
export const AI_SETTLE_MS = 1000;
export const AI_MIN_ROTATION_MS = 700;
export const AI_MAX_FRAME_MS = 40;

/** A short movement is still visible; longer movements average 90 degrees/s.
 * Smoothstep starts and ends at rest, peaking at 1.5 times the average speed.
 * An invalid command is a completed no-op rather than an endless animation. */
export function createAIRotation(localDelta) {
  const duration = Math.abs(localDelta) * (1000 / AI_SPEED_DEG_PER_SECOND);
  const valid = Number.isFinite(localDelta) && Number.isFinite(duration) && localDelta !== 0;
  return {
    localDelta: valid ? localDelta : 0,
    durationMs: valid ? Math.max(AI_MIN_ROTATION_MS, duration) : 0,
    elapsedMs: 0,
    appliedDelta: 0,
    done: !valid,
  };
}

/** Consume this frame's active time only, never a wall-clock timestamp.
 * Discard excess time after a slow frame or a background tab: resuming cannot
 * jump across the rest of a turn. Pauses simply stop calling this function.
 * The caller applies the returned increment to the real simulation before
 * drawing it, so intermediate opening crossings and falls remain visible. */
export function advanceAIRotation(state, elapsedMs, speedRate = 1) {
  if (!state || state.done || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const rate = Number.isFinite(speedRate) && speedRate > 0 ? speedRate : 1;
  let elapsed = Math.min(state.durationMs, state.elapsedMs + Math.min(elapsedMs, AI_MAX_FRAME_MS) * rate);
  // A cadence such as 1000/120 accumulates a fractional final millisecond.
  // Finish that numerical residue here, without an extra zero/reverse frame.
  if (state.durationMs - elapsed < 1e-9) elapsed = state.durationMs;
  const progress = elapsed / state.durationMs;
  const done = elapsed >= state.durationMs;
  const eased = Math.min(1, Math.max(0, progress * progress * (3 - 2 * progress)));
  const next = done ? state.localDelta : state.localDelta * eased;
  const increment = next - state.appliedDelta;
  state.elapsedMs = elapsed;
  state.appliedDelta = next;
  state.done = done;
  return increment;
}

/** Full speed applies only the remaining path through the normal engine, so
 * intermediate opening crossings keep their simulation order. Calling this
 * after completion is a no-op and never reapplies an already consumed angle. */
export function completeAIRotation(state) {
  if (!state || state.done) return 0;
  const increment = state.localDelta - state.appliedDelta;
  state.elapsedMs = state.durationMs;
  state.appliedDelta = state.localDelta;
  state.done = true;
  return increment;
}
