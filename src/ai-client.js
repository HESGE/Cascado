import { chooseAIMove } from './ai.js';
import { SUPPORTED_GEOMETRY_VERSIONS, LEGACY_GEOMETRY_VERSION } from './geometry.js';
import { tokenTotal, queueLanes, nextBySeries } from './tokens.js';

function finiteMove(value) {
  return value && Number.isInteger(value.wheel) && value.wheel >= 1 && value.wheel <= 5 &&
    Number.isFinite(value.localDelta) && value.localDelta !== 0
    ? { wheel: value.wheel, localDelta: value.localDelta } : null;
}

/** Copy only the current face's projection, never a game or an opponent. */
function projectedView(view) {
  const geometryVersion = view?.geometryVersion ?? LEGACY_GEOMETRY_VERSION;
  if (view?.geometryVersion === null || !SUPPORTED_GEOMETRY_VERSIONS.includes(geometryVersion)) return null;
  const totalTokens = tokenTotal(geometryVersion);
  const token = value => Number.isInteger(value) && value >= 1 && value <= totalTokens;
  const wheelId = value => Number.isInteger(value) && value >= 1 && value <= 5;
  const wheel = value => value === null || value === undefined || wheelId(value);
  const notchCounts = [1, 3, 2, 4, 5];
  if (!view || ![0, 1].includes(view.faceIndex) ||
      !Array.isArray(view.angles) || view.angles.length !== 5 || !view.angles.every(Number.isFinite) ||
      !Array.isArray(view.queue) || !view.queue.every(token) ||
      !Array.isArray(view.exited) || !view.exited.every(token) ||
      !Array.isArray(view.slots) || view.slots.length !== 5 ||
      !view.slots.every((slots, index) => Array.isArray(slots) && slots.length === notchCounts[index] &&
        slots.every(value => value === null || token(value))) ||
      !wheel(view.engaged) || !wheel(view.lastWheel) ||
      !Array.isArray(view.allowedWheels) || !view.allowedWheels.every(wheelId)) return null;
  return {
    faceIndex: view.faceIndex,
    geometryVersion,
    angles: [...view.angles],
    queue: [...view.queue],
    queues: queueLanes({ queue: view.queue }, geometryVersion).map(queue => [...queue]),
    slots: view.slots.map(slots => [...slots]),
    exited: [...view.exited],
    nextBySeries: [...nextBySeries({ exited: view.exited }, geometryVersion)],
    totalTokens,
    engaged: view.engaged ?? null,
    lastWheel: view.lastWheel ?? null,
    allowedWheels: [...view.allowedWheels],
  };
}

/** One cancellable calculation. Worker failures keep the bounded local planner. */
export function createAIClient({
  WorkerClass = globalThis.Worker,
  fallback = chooseAIMove,
  timeoutMs = 5000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let sequence = 0;
  let active = null;

  function clearWorker(job) {
    if (job.timer !== null) clearTimer(job.timer);
    job.timer = null;
    if (!job.worker) return;
    job.worker.onmessage = null;
    job.worker.onerror = null;
    job.worker.onmessageerror = null;
    try { job.worker.terminate(); } catch { /* Best effort cleanup. */ }
    job.worker = null;
  }

  function finish(job, move) {
    if (active !== job) return;
    active = null;
    clearWorker(job);
    if (job.fallbackTimer !== null) clearTimer(job.fallbackTimer);
    job.fallbackTimer = null;
    job.resolve(move);
  }

  function useFallback(job) {
    if (active !== job || job.fallbackStarted) return;
    clearWorker(job);
    job.fallbackStarted = true;
    // A fresh task lets a pause or cancellation win before synchronous work.
    job.fallbackTimer = setTimer(() => {
      job.fallbackTimer = null;
      if (active !== job) return;
      let result;
      try { result = fallback(job.view, job.level); }
      catch { finish(job, null); return; }
      Promise.resolve(result).then(
        move => finish(job, finiteMove(move)),
        () => finish(job, null),
      );
    }, 0);
  }

  function cancel() {
    sequence++;
    if (active) finish(active, null);
  }

  function choose(view, level = 'normal') {
    cancel();
    const projection = projectedView(view);
    if (!projection) return Promise.resolve(null);
    return new Promise(resolve => {
      const job = {
        requestId: ++sequence, view: projection,
        level: ['easy', 'normal', 'hard'].includes(level) ? level : 'normal',
        resolve, worker: null, timer: null, fallbackTimer: null, fallbackStarted: false,
      };
      active = job;
      if (typeof WorkerClass !== 'function') { useFallback(job); return; }
      try {
        job.worker = new WorkerClass(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
        job.worker.onmessage = event => {
          if (active !== job || job.fallbackStarted || event.data?.requestId !== job.requestId) return;
          if (event.data.error) { useFallback(job); return; }
          if (event.data.move === null) { finish(job, null); return; }
          const move = finiteMove(event.data.move);
          if (move) finish(job, move);
          else useFallback(job);
        };
        job.worker.onerror = event => { event.preventDefault?.(); useFallback(job); };
        job.worker.onmessageerror = () => useFallback(job);
        job.timer = setTimer(() => useFallback(job),
          Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000);
        job.worker.postMessage({ requestId: job.requestId, view: job.view, level: job.level });
      } catch { useFallback(job); }
    });
  }

  return { choose, cancel };
}
