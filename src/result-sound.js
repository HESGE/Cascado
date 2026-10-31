/** Result music receives only an already revealed outcome. Presentation guards
 * are injected so this decision stays independent of the browser and storage. */
import { isAIPlayer, singleHumanIndex } from './players.js';
import { recipientOf } from './flow.js';
import { seriesOf } from './series.js';

export function getResultSound(session, { hidden = false, full = false } = {}) {
  if (session?.phase !== 'revealed-result' || hidden || full) return null;
  const game = session.game;
  if (!game || game.simulationMode === 'headless'
    || !Array.isArray(game.players) || game.players.length !== 2) return null;
  const duel = isAIPlayer(game, 0) && isAIPlayer(game, 1);
  if (duel && game.series != null) {
    const series = seriesOf(game);
    if (!series || series.completed < series.target) return null;
    // Celebrate the series winner, never the result of its final individual
    // round. An equal series score has no victory or defeat melody.
    return series.wins[0] === series.wins[1] ? null : 'victory';
  }
  const winner = game.verdict?.winner;
  if (winner !== 0 && winner !== 1) return null;
  const human = singleHumanIndex(game);
  if (human !== null) return winner === human ? 'victory' : 'defeat';
  // Spectators celebrate the announced winner, without assigning them a seat.
  if (duel) return 'victory';
  const recipient = recipientOf(session);
  const viewer = recipient === 0 || recipient === 1 ? recipient : game.active;
  if (viewer !== 0 && viewer !== 1) return null;
  return winner === viewer ? 'victory' : 'defeat';
}
