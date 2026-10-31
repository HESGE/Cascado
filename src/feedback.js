/** Optional feedback for a geometric opening, never for token events. */
export const ALIGNMENT_FEEDBACK_MS = 300;
export const ALIGNMENT_VIBRATION_MS = 12;
export const ALIGNMENT_FEEDBACK_INTERVAL = 140;

export function createAlignmentFeedback(options = {}) {
  const now = options.now ?? (() => performance.now());
  const vibrate = options.vibrate ?? (duration => globalThis.navigator?.vibrate?.(duration));
  const allowed = options.allowed ?? (() => true);
  const reducedMotion = options.reducedMotion
    ?? (() => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const changed = options.onChange ?? (() => {});
  const arrived = options.onArrival ?? (() => {});
  const schedule = options.setTimer ?? setTimeout;
  const cancel = options.clearTimer ?? clearTimeout;
  let wheel = null;
  let timer = null;
  let generation = 0;
  let lastPulse = -Infinity;
  let vibrating = false;

  return {
    get wheel() { return wheel; },
    pulse(wheelId) {
      if (!Number.isInteger(wheelId) || wheelId < 1 || wheelId > 5 || !allowed()) return false;
      const time = now();
      if (!Number.isFinite(time) || time - lastPulse < ALIGNMENT_FEEDBACK_INTERVAL) return false;
      lastPulse = time;
      if (timer !== null) cancel(timer);
      const current = ++generation;
      wheel = wheelId;
      try { arrived(wheel); } catch { /* Optional sound never blocks the cue. */ }
      changed(wheel);
      if (!reducedMotion()) {
        try { vibrating = vibrate(ALIGNMENT_VIBRATION_MS) === true; }
        catch { /* Unsupported or blocked vibration never interrupts a move. */ }
      }
      timer = schedule(() => {
        if (current !== generation) return;
        timer = null;
        wheel = null;
        vibrating = false;
        changed(null);
      }, ALIGNMENT_FEEDBACK_MS);
      return true;
    },
    stop() {
      generation++;
      if (timer !== null) cancel(timer);
      timer = null;
      const hadCue = wheel !== null;
      wheel = null;
      lastPulse = -Infinity;
      if (vibrating) {
        try { vibrate(0); } catch { /* Best effort cancellation. */ }
      }
      vibrating = false;
      if (hadCue) changed(null);
    },
  };
}
