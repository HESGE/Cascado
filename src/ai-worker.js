import { chooseAIMove } from './ai.js';
import { rememberedOptions } from './ai-memory.js';

globalThis.onmessage = event => {
  const { requestId, view, level, options } = event.data ?? {};
  if (!Number.isInteger(requestId) || requestId < 1) return;
  try {
    const move = chooseAIMove(view, level, rememberedOptions(view, level, options));
    globalThis.postMessage({ requestId, move });
  } catch {
    globalThis.postMessage({ requestId, error: true });
  }
};
