import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/engine.js';
import { playerSettings, isAIPlayer, singleHumanIndex, displayedFaceIndex, configurePlayers } from '../src/players.js';

test('les anciennes parties gardent deux joueurs humains de niveau normal', () => {
  const game = createGame();
  assert.deepEqual(playerSettings(game.players[0]), { controller: 'human', level: 'normal' });
  assert.equal(isAIPlayer(game, 0), false);
  assert.equal(isAIPlayer(game, 1), false);
});

test('les trois niveaux sont conservés sur chacun des contrôleurs reconnus', () => {
  for (const controller of ['human', 'ai']) {
    for (const level of ['easy', 'normal', 'hard']) {
      assert.deepEqual(playerSettings({ controller, level }), { controller, level });
    }
  }
});

test('les options invalides reviennent indépendamment aux valeurs par défaut', () => {
  for (const value of [undefined, null, false, 3, 'ai', [], {}]) {
    assert.deepEqual(playerSettings(value), { controller: 'human', level: 'normal' });
  }
  assert.deepEqual(playerSettings({ controller: 'robot', level: 'hard' }), { controller: 'human', level: 'hard' });
  assert.deepEqual(playerSettings({ controller: 'ai', level: 'unknown' }), { controller: 'ai', level: 'normal' });
});

test('chaque siège peut être humain ou IA, y compris deux IA', () => {
  for (const first of ['human', 'ai']) {
    for (const second of ['human', 'ai']) {
      const game = createGame();
      assert.equal(configurePlayers(game, [
        { controller: first, level: 'easy' },
        { controller: second, level: 'hard' },
      ]), game);
      assert.equal(isAIPlayer(game, 0), first === 'ai');
      assert.equal(isAIPlayer(game, 1), second === 'ai');
    }
  }
});

test('configurer les sièges préserve leur identité et ne modifie pas la partie', () => {
  const game = createGame(['Alex', 'Sam'], 1);
  const before = structuredClone(game);
  const configurations = [
    { controller: 'ai', level: 'easy', name: 'Écrasé', symbol: '!', color: 'red' },
    { controller: 'ai', level: 'hard' },
  ];
  const originalConfigurations = structuredClone(configurations);
  configurePlayers(game, configurations);
  assert.deepEqual(configurations, originalConfigurations);
  for (let index = 0; index < 2; index += 1) {
    for (const key of ['name', 'symbol', 'color']) {
      assert.equal(game.players[index][key], before.players[index][key]);
    }
  }
  assert.deepEqual({ ...game, players: before.players }, before);
});

test('la configuration normalise aussi un siège ancien ou incomplet', () => {
  const game = createGame();
  configurePlayers(game, [null, { controller: 'ai' }]);
  assert.deepEqual(playerSettings(game.players[0]), { controller: 'human', level: 'normal' });
  assert.deepEqual(playerSettings(game.players[1]), { controller: 'ai', level: 'normal' });
});

test('une configuration mal dimensionnée échoue sans mutation partielle', () => {
  const game = createGame();
  const before = structuredClone(game);
  for (const configurations of [null, {}, [], [{}], [{}, {}, {}]]) {
    assert.throws(() => configurePlayers(game, configurations), TypeError);
    assert.deepEqual(game, before);
  }
  for (const invalidGame of [null, {}, { players: [] }, { players: [{}] }]) {
    assert.throws(() => configurePlayers(invalidGame, [{}, {}]), TypeError);
  }
});

test('un indice de joueur incorrect ne sélectionne jamais une IA', () => {
  const game = configurePlayers(createGame(), [{ controller: 'ai' }, { controller: 'ai' }]);
  for (const index of [-1, 2, 0.5, '0', null, undefined, NaN]) {
    assert.equal(isAIPlayer(game, index), false);
  }
  assert.equal(isAIPlayer(null, 0), false);
  assert.equal(isAIPlayer({}, 1), false);
});

test('les réglages restent lisibles après une sauvegarde JSON', () => {
  const game = configurePlayers(createGame(), [
    { controller: 'ai', level: 'easy' },
    { controller: 'ai', level: 'hard' },
  ]);
  const restored = JSON.parse(JSON.stringify(game));
  assert.deepEqual(restored.players, game.players);
  assert.equal(isAIPlayer(restored, 0), true);
  assert.deepEqual(playerSettings(restored.players[1]), { controller: 'ai', level: 'hard' });
});

test('un duel humain contre IA garde la face humaine quel que soit le joueur actif', () => {
  for (const human of [0, 1]) {
    const game = configurePlayers(createGame(), [0, 1].map(index => ({
      controller: index === human ? 'human' : 'ai',
    })));
    for (const active of [0, 1]) {
      game.active = active;
      const before = structuredClone(game);
      assert.equal(singleHumanIndex(game), human);
      assert.equal(displayedFaceIndex(game), human);
      assert.deepEqual(game, before, 'choisir la face ne change ni le tour ni les données privées');
    }
  }
});

test('les parties à deux humains ou à deux IA suivent toujours la face active', () => {
  for (const controller of ['human', 'ai']) {
    const game = configurePlayers(createGame(), [{ controller }, { controller }]);
    assert.equal(singleHumanIndex(game), null);
    for (const active of [0, 1]) {
      game.active = active;
      assert.equal(displayedFaceIndex(game), active);
    }
  }
});

test('une ancienne configuration sans contrôleur reste humaine face à une IA', () => {
  const game = createGame();
  game.players[1].controller = 'ai';
  game.active = 1;
  assert.equal(singleHumanIndex(game), 0);
  assert.equal(displayedFaceIndex(game), 0);
  delete game.players[1].controller;
  assert.equal(singleHumanIndex(game), null);
  assert.equal(displayedFaceIndex(game), 1);
});

test('la face affichée ne dépend pas des jetons, événements ou résultats cachés', () => {
  const game = configurePlayers(createGame(), [{ controller: 'ai' }, { controller: 'human' }]);
  const projectionOnly = { active: game.active, players: game.players };
  for (const key of ['faces', 'events', 'verdict']) {
    Object.defineProperty(projectionOnly, key, {
      get() { throw new Error(`Donnée privée consultée : ${key}`); },
    });
  }
  assert.equal(singleHumanIndex(projectionOnly), 1);
  assert.equal(displayedFaceIndex(projectionOnly), 1);
});

test('une liste de joueurs incorrecte ne définit pas un match humain contre IA', () => {
  for (const game of [null, {}, { players: [] }, { players: [{ controller: 'ai' }] },
    { players: [{ controller: 'ai' }, {}, {}] }]) {
    assert.equal(singleHumanIndex(game), null);
  }
});
