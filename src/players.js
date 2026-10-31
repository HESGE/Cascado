const CONTROLLERS = new Set(['human', 'ai']);
const LEVELS = new Set(['easy', 'normal', 'hard']);

/** Old saves without a controller stay human; unknown options use safe defaults. */
export function playerSettings(player) {
  return {
    controller: CONTROLLERS.has(player?.controller) ? player.controller : 'human',
    level: LEVELS.has(player?.level) ? player.level : 'normal',
  };
}

export function isAIPlayer(game, index) {
  return Number.isInteger(index) && index >= 0 && index < 2 &&
    Array.isArray(game?.players) && playerSettings(game.players[index]).controller === 'ai';
}

/** A mixed match always presents the human's side, including during AI turns. */
export function singleHumanIndex(game) {
  if (!Array.isArray(game?.players) || game.players.length !== 2) return null;
  const firstAI = isAIPlayer(game, 0);
  const secondAI = isAIPlayer(game, 1);
  return firstAI === secondAI ? null : firstAI ? 1 : 0;
}

/** Presentation only: the acting player's planning view still uses game.active. */
export function displayedFaceIndex(game) {
  return singleHumanIndex(game) ?? game.active;
}

/** Apply only controller options, preserving the seat's name, symbol and color. */
export function configurePlayers(game, configurations) {
  if (!Array.isArray(game?.players) || game.players.length !== 2 ||
      !Array.isArray(configurations) || configurations.length !== 2) {
    throw new TypeError('Deux joueurs et deux configurations sont nécessaires.');
  }
  game.players = game.players.map((player, index) => ({
    ...player,
    ...playerSettings(configurations[index]),
  }));
  return game;
}
