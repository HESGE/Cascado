import { isSimulationSession, playSimulationTurn } from './simulation.js';

export const SIMULATION_BATCH_TURNS = 8;
export const SIMULATION_BATCH_MS = 120;

/** A batch never crosses a match boundary: the page must commit its result first.
 * A single bounded planner call can exceed the time budget; check it between
 * turns, and return at once after a result or a planning failure. */
export function advanceSimulationBatch(session, {
  step = playSimulationTurn, now = () => performance.now(),
} = {}) {
  if (!isSimulationSession(session)) throw new TypeError('Session de simulation invalide.');
  const initialTurn = session.game.turn;
  const started = now();
  let outcome;
  for (let count = 0; count < SIMULATION_BATCH_TURNS; count += 1) {
    outcome = step(session);
    if (!outcome || !['turn', 'result', 'blocked'].includes(outcome.status)) {
      throw new TypeError('Le moteur n’a pas retourné une progression valide.');
    }
    if (outcome.status !== 'turn' || now() - started >= SIMULATION_BATCH_MS) break;
  }
  return {
    session, status: outcome.status, turns: session.game.turn - initialTurn,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
  };
}

// Requests run synchronously and in order on this persistent worker. Cancellation
// terminates the worker from the page, including a planner currently calculating.
if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  let lastRequest = 0;
  globalThis.onmessage = event => {
    const { requestId, session } = event.data ?? {};
    if (!Number.isSafeInteger(requestId) || requestId <= lastRequest) return;
    lastRequest = requestId;
    try {
      globalThis.postMessage({ requestId, ...advanceSimulationBatch(session) });
    } catch {
      globalThis.postMessage({ requestId, error: true });
    }
  };
}
