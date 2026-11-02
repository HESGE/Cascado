import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createGame } from '../src/engine.js';
import { newSession } from '../src/flow.js';
import { configurePlayers, playerSettings } from '../src/players.js';
import { loadHumanRoster, mergeHumanNames, rememberHumanNames } from '../src/player-roster.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const start = source.indexOf('\nasync function boot()');
const end = source.indexOf('\nboot();', start);
assert.ok(start >= 0 && end > start, 'The production boot function remains available');
const productionBoot = source.slice(start, end);
const KEY = 'ddc-human-roster';

/** Run the actual startup migration. Physics/legacy-ID upgrades are stubbed
 * unchanged so any modification here belongs to roster recovery alone. */
function bootHarness({ saved = null, statistics = { profiles: [] }, statisticsError = null,
  preferences = new Map(), blockedStorage = false } = {}) {
  const storage = {
    getItem(key) { if (blockedStorage) throw new Error('Storage blocked'); return preferences.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw new Error('Storage blocked'); preferences.set(key, value); },
  };
  const calls = { loadGame: 0, loadStatistics: 0, mask: 0, home: 0, pwa: 0, persist: [], failures: [] };
  const app = { dataset: {} };
  const context = vm.createContext({
    app, session: null, storageReady: false,
    humanRoster: loadHumanRoster(storage), playerSettings, mergeHumanNames,
    rememberHumanNames: (roster, names) => rememberHumanNames(roster, names, storage),
    async loadGame() { calls.loadGame++; return saved; },
    async loadStatistics() { calls.loadStatistics++; if (statisticsError) throw statisticsError; return statistics; },
    upgradeGameGeometry: () => false,
    ensureLegacyStatisticsIdentity: async () => false,
    renderMask() { calls.mask++; }, renderHome() { calls.home++; },
    setupPWA() { calls.pwa++; },
    async persist(meta) { calls.persist.push(structuredClone(meta)); },
    failStorage(error) { calls.failures.push(error); },
  });
  vm.runInContext(productionBoot, context, { filename: 'app-player-roster-migration.js' });
  return { context, calls, storage, preferences, async boot() { await vm.runInContext('boot()', context); } };
}

function mixedLegacySave() {
  const game = configurePlayers(createGame(['  E\u0301lodie  Martin  ', 'Ancienne IA'], 0),
    [{ controller: 'human' }, { controller: 'ai', level: 'hard' }]);
  // Old saves can lack a controller; their first place must remain human.
  delete game.players[0].controller;
  return newSession(game);
}

test('startup persists human names from saved game and statistics while excluding AI profiles', async () => {
  const saved = mixedLegacySave(), originalSave = structuredClone(saved);
  const statistics = { profiles: [
    { name: '  Zoé  ', controller: 'human', played: 3 },
    { name: 'IA 1', controller: 'ai', level: 'normal' },
    { name: 'Ancienne IA', controller: 'ai', level: 'hard' },
  ] }, originalStatistics = structuredClone(statistics);
  const h = bootHarness({ saved, statistics });
  await h.boot();
  assert.equal(h.context.storageReady, true);
  assert.equal(h.context.session, saved);
  assert.deepEqual(saved, originalSave, 'Roster migration must not rewrite any saved name or game state');
  assert.deepEqual(statistics, originalStatistics, 'Historical profiles remain unchanged');
  const persisted = JSON.parse(h.preferences.get(KEY));
  assert.ok(persisted.names.includes('Élodie Martin'));
  assert.ok(persisted.names.includes('Zoé'));
  assert.ok(!persisted.names.includes('IA 1'));
  assert.ok(!persisted.names.includes('Ancienne IA'));
  assert.deepEqual(persisted.lastNames, [null, null], 'Migration must not invent recent seat selections');
  assert.equal(h.calls.mask, 1);assert.equal(h.calls.home, 0);assert.equal(h.calls.pwa, 1);
  assert.deepEqual(h.calls.persist, [], 'Unchanged source game needs no migration save');
  assert.deepEqual(h.calls.failures, []);
});

test('migrated statistical names survive statistics reset and reload before any new game', async () => {
  const preferences = new Map();
  const first = bootHarness({ preferences, statistics: { profiles: [
    { name: 'Anaïs', controller: 'human' }, { name: 'Noé', controller: 'human' },
    { name: 'IA 2', controller: 'ai', level: 'easy' },
  ] } });
  await first.boot();
  assert.equal(first.calls.home, 1);
  const beforeReset = JSON.parse(preferences.get(KEY));
  assert.deepEqual(beforeReset.names, ['Anaïs', 'Noé']);
  // The reset clears only statistical counters; no game was created in between.
  const reopened = bootHarness({ preferences, statistics: { profiles: [] } });
  await reopened.boot();
  assert.deepEqual(loadHumanRoster(reopened.storage), beforeReset);
  assert.deepEqual(structuredClone(reopened.context.humanRoster), beforeReset);
  assert.equal(reopened.calls.home, 1);assert.deepEqual(reopened.calls.failures, []);
});

test('startup migration preserves both last human selections and adds only known humans', async () => {
  const preferences = new Map(), initialStorage = {
    getItem: key => preferences.get(key) ?? null,
    setItem: (key, value) => preferences.set(key, value),
  };
  rememberHumanNames(loadHumanRoster(initialStorage), ['Camille', 'Léa'], initialStorage);
  const h = bootHarness({ preferences, saved: mixedLegacySave(), statistics: { profiles: [
    { name: 'Nouveau profil', controller: 'human' }, { name: 'IA 1', controller: 'ai' },
  ] } });
  await h.boot();
  const roster = loadHumanRoster(h.storage);
  assert.deepEqual(roster.lastNames, ['Camille', 'Léa']);
  for (const name of ['Camille', 'Léa', 'Élodie Martin', 'Nouveau profil']) assert.ok(roster.names.includes(name));
  assert.ok(!roster.names.includes('IA 1'));assert.deepEqual(h.calls.failures, []);
});

test('unavailable statistics cannot block a saved game or persistence of its human names', async () => {
  const saved = mixedLegacySave(), originalSave = structuredClone(saved);
  const h = bootHarness({ saved, statisticsError: new Error('Statistics unavailable') });
  await h.boot();
  assert.equal(h.calls.loadStatistics, 1);assert.equal(h.calls.mask, 1);assert.equal(h.calls.pwa, 1);
  assert.deepEqual(h.calls.failures, []);assert.deepEqual(saved, originalSave);
  const roster = loadHumanRoster(h.storage);
  assert.deepEqual(roster.names, ['Élodie Martin']);assert.deepEqual(roster.lastNames, [null, null]);
});

test('optional roster storage failure does not prevent normal startup or mutate saved data', async () => {
  const saved = mixedLegacySave(), originalSave = structuredClone(saved);
  const h = bootHarness({ saved, blockedStorage: true, statistics: { profiles: [{ name: 'Zoé', controller: 'human' }] } });
  await h.boot();
  assert.equal(h.context.storageReady, true);assert.equal(h.calls.mask, 1);assert.equal(h.calls.pwa, 1);
  assert.deepEqual(h.calls.failures, []);assert.deepEqual(saved, originalSave);
  assert.ok(h.context.humanRoster.names.includes('Zoé'));assert.ok(h.context.humanRoster.names.includes('Élodie Martin'));
  assert.equal(h.preferences.size, 0);
});
