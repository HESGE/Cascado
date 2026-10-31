import { chooseAIMove } from './ai.js';

globalThis.onmessage = event => {
  const { requestId, view, level } = event.data ?? {};
  if (!Number.isInteger(requestId) || requestId < 1) return;
  try {
    const move = chooseAIMove(view, level);
    globalThis.postMessage({ requestId, move });
  } catch {
    globalThis.postMessage({ requestId, error: true });
  }
};
