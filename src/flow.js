import { endTurn } from './engine.js';

// Seuls ces états durables sont enregistrés ; jamais une permission de révéler.
export function newSession(game) {
  return { game, phase: 'open', recipient: game.active };
}

export function revealTarget(session) {
  if (session.phase === 'revealed-result') return 'result';
  if (session.phase === 'passed' && session.game.verdict) return 'result';
  return 'play';
}

export function recipientOf(session) {
  return session.phase === 'open' ? session.game.active : session.recipient;
}

export function transmit(session) {
  if (!endTurn(session.game)) return false;
  session.phase = 'passed';
  session.recipient = session.game.active;
  return true;
}

export function acceptReveal(session) {
  const target = revealTarget(session);
  session.phase = target === 'result' ? 'revealed-result' : 'open';
  session.recipient = session.game.active;
  return target;
}

/** Drop all opponent transfers and global event identifiers before presentation. */
export function visibleTransfers(batches, faceIndex) {
  return batches.flatMap(batch => batch.transfers
    .filter(transfer => transfer.face === faceIndex)
    .map(({ token, from, to }) => ({ token, from: { ...from }, to: { ...to }, wheel: batch.wheel, angle: batch.angle })));
}

/** One anonymous cue for newly supplied opponent falls, including internal
 * ones. Detailed transfers stay private and never enter the animation layer. */
export function hasOpponentFall(batches, viewerFaceIndex) {
  if (viewerFaceIndex !== 0 && viewerFaceIndex !== 1) throw new RangeError('Face inconnue.');
  const isWheel = location => Number.isInteger(location?.wheel) && location.wheel >= 1 && location.wheel <= 5;
  return batches.some(batch => batch.transfers.some(transfer => {
    if (transfer.face !== 1 - viewerFaceIndex) return false;
    const fromWheel = isWheel(transfer.from);
    const toWheel = isWheel(transfer.to);
    return (transfer.from?.queue === true && toWheel)
      || (fromWheel && (toWheel || transfer.to?.exited === true));
  }));
}
