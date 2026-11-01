import { isSimulationSession, playSimulationTurn } from './simulation.js';

function copySession(value) {
  try {
    const copy = structuredClone(value);
    return isSimulationSession(copy) ? copy : null;
  } catch { return null; }
}

function validProgress(value, before, maxTurns) {
  if (!value || !['turn', 'result', 'blocked'].includes(value.status) ||
      !Number.isSafeInteger(value.turns) || value.turns < 0 || value.turns > maxTurns) return null;
  const session = copySession(value.session);
  if (!session || session.game.turn - before.game.turn !== value.turns ||
      session.game.statsId !== before.game.statsId ||
      session.game.series?.id !== before.game.series?.id ||
      session.game.series?.round !== before.game.series?.round ||
      session.game.starter !== before.game.starter ||
      session.game.simulationMode !== before.game.simulationMode ||
      JSON.stringify(session.game.startConfig) !== JSON.stringify(before.game.startConfig) ||
      JSON.stringify(session.game.startingAngles) !== JSON.stringify(before.game.startingAngles) ||
      JSON.stringify(session.game.startingPose) !== JSON.stringify(before.game.startingPose) ||
      session.game.gameSetId !== before.game.gameSetId ||
      session.game.geometryVersion !== before.game.geometryVersion ||
      JSON.stringify(session.game.players) !== JSON.stringify(before.game.players) ||
      session.game.active !== (before.game.active ^ (value.turns % 2))) return null;
  if (value.status === 'result' ? session.phase !== 'revealed-result' :
      value.status === 'turn' ? session.phase !== 'open' || value.turns < 1 :
        session.phase === 'revealed-result') return null;
  if (value.status === 'blocked' &&
      (typeof value.reason !== 'string' || !value.reason || value.reason.length > 80)) return null;
  return {
    session, status: value.status, turns: value.turns,
    ...(value.status === 'blocked' ? { reason: value.reason } : {}),
  };
}

/** One persistent worker advances copied positions in small batches. A fault
 * returns null so the page pauses with its last accepted position. With no
 * worker, a fresh task runs exactly one turn before giving control back. */
export function createSimulationClient({
  WorkerClass = globalThis.Worker, step = playSimulationTurn, timeoutMs = 10000,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let sequence = 0;
  let worker = null;
  let active = null;

  function destroyWorker() {
    if (!worker) return;
    const previous = worker;
    worker = null;
    previous.onmessage = null;
    previous.onerror = null;
    previous.onmessageerror = null;
    try { previous.terminate(); } catch { /* Best effort cleanup. */ }
  }

  function finish(job, result, terminate = false) {
    if (active !== job) return;
    active = null;
    if (job.timer !== null) clearTimer(job.timer);
    if (job.fallbackTimer !== null) clearTimer(job.fallbackTimer);
    job.timer = null;
    job.fallbackTimer = null;
    if (terminate) destroyWorker();
    job.resolve(result);
  }

  function cancel() {
    sequence += 1;
    if (active) finish(active, null, true);
    else destroyWorker();
  }

  function ensureWorker() {
    if (worker) return true;
    if (typeof WorkerClass !== 'function') return false;
    let created;
    try {
      created = new WorkerClass(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
    } catch { return false; }
    worker = created;
    created.onmessage = event => {
      const job = active;
      if (worker !== created || !job || event.data?.requestId !== job.requestId) return;
      let result = null;
      try { result = event.data.error ? null : validProgress(event.data, job.before, 8); }
      catch { /* A malformed reply cannot replace the last accepted position. */ }
      finish(job, result, !result);
    };
    const failed = event => {
      event?.preventDefault?.();
      if (worker !== created) return;
      if (active) finish(active, null, true);
      else destroyWorker();
    };
    created.onerror = failed;
    created.onmessageerror = failed;
    return true;
  }

  function advance(value) {
    if (active) cancel();
    const before = copySession(value);
    if (!before) return Promise.resolve(null);
    return new Promise(resolve => {
      const job = { requestId: ++sequence, before, resolve, timer: null, fallbackTimer: null };
      active = job;
      if (!ensureWorker()) {
        job.fallbackTimer = setTimer(() => {
          job.fallbackTimer = null;
          if (active !== job) return;
          let result = null;
          try {
            const session = structuredClone(job.before);
            const initialTurn = session.game.turn;
            const outcome = step(session);
            result = validProgress({ ...outcome, session, turns: session.game.turn - initialTurn }, job.before, 1);
          } catch { /* Pause instead of inventing an outcome. */ }
          finish(job, result);
        }, 0);
        return;
      }
      job.timer = setTimer(() => finish(job, null, true),
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
      try { worker.postMessage({ requestId: job.requestId, session: structuredClone(before) }); }
      catch { finish(job, null, true); }
    });
  }

  return { advance, cancel };
}
