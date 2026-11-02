import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createGame, rotate } from '../src/engine.js';
import { GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION } from '../src/geometry.js';
import { newSession } from '../src/flow.js';
import { AI_LEVELS } from '../src/ai.js';
import { configurePlayers, playerSettings, singleHumanIndex } from '../src/players.js';
import { createSeries, seriesOf, seriesGameId, parseSeriesCount } from '../src/series.js';
import { configureStartingPosition, normalizeStartConfig, ORIGINAL_START_MODE,
  ORIGINAL_START_ANGLES, startingAnglesFor, MIROIR50_START_MODE, randomMiroir50Seed,
  miroir50RematchSeed, miroir50ScheduleEntry } from '../src/starting-position.js';
import { GAME_SETS, getGameSet, gameSetIdForGeometry } from '../src/game-sets.js';
import { loadHumanRoster, normalizeHumanName, mergeHumanNames, rememberHumanNames, removeHumanName } from '../src/player-roster.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function between(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `App setup boundary remains available: ${start}`);
  return source.slice(first, last);
}
const setup = between('function prepare(', '\nconst phoneIcon =')
  + between('function ensureStatisticsIdentity(', '\nasync function ensureLegacyStatisticsIdentity(')
  + between("app.addEventListener('click',async event=>{", "\napp.addEventListener('keydown'");

// Read defaults from the actual rendered controls. Submitting then executes the
// production callback with the real mechanical configuration and session APIs.
function formDefaults(html) {
  const values = new Map();
  for (const [, attributes] of html.matchAll(/<input\b([^>]*)>/g)) {
    const name = attributes.match(/\bname="([^"]+)"/)?.[1];
    if (name) values.set(name, attributes.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
  }
  for (const [, attributes, content] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const name = attributes.match(/\bname="([^"]+)"/)?.[1];
    const options = [...content.matchAll(/<option\b([^>]*)>/g)];
    const choice = options.find(([, attrs]) => /\bselected\b/.test(attrs)) ?? options[0];
    if (name && choice) values.set(name, choice[1].match(/\bvalue="([^"]*)"/)?.[1] ?? '');
  }
  return values;
}

function harness(saved = null, options = {}) {
  const listeners = new Map();
  const formListeners = new Map();
  const calls = [];
  const saves = [];
  const preferences = options.preferences ?? new Map();
  const storage = { getItem: name => preferences.get(name) ?? null, setItem: (name, value) => preferences.set(name, value) };
  // Mechanical setup tests begin with two already known humans. This is input
  // fixture state, never a production-name fallback or a submit-time override.
  // Explicit empty/stored rosters remain empty, just as a completed deletion.
  const legacyHumans = saved?.game.players.filter(p => playerSettings(p).controller === 'human').map(p => p.name) ?? [];
  const fixtureRoster = options.humanRoster ?? (preferences.has('ddc-human-roster') ? loadHumanRoster(storage)
    : mergeHumanNames(rememberHumanNames(loadHumanRoster(null), ['Camille', 'Léa'], null), legacyHumans));
  const form = { addEventListener: (name, callback) => formListeners.set(name, callback) };
  const countField = { value: '10', addEventListener() {}, setCustomValidity() {}, reportValidity() {} };
  const app = {
    innerHTML: '', dataset: {},
    addEventListener: (name, callback) => listeners.set(name, callback),
    querySelectorAll: () => [],
    querySelector: selector => selector === '#setup' ? form : selector === '[name="series-count"]' ? countField : null,
  };
  let overrides = {};
  let masks = 0;
  const context = vm.createContext({
    app, session: saved, mode: 'home', storageReady: options.storageReady ?? true, failed: false,
    GEOMETRY_VERSION, ORIGINAL_START_MODE, ORIGINAL_START_ANGLES, AI_LEVELS,
    GAME_SETS, getGameSet, gameSetIdForGeometry, MIROIR50_START_MODE, randomMiroir50Seed, miroir50RematchSeed,
    gameSetPreference: options.setPreference ?? 'reference',
    gameStartPreference: options.gameStartPreference ?? ORIGINAL_START_MODE,
    humanRoster: fixtureRoster,
    normalizeHumanName, mergeHumanNames,
    rememberHumanNames: (roster, names, suppliedStorage = storage) => rememberHumanNames(roster, names, suppliedStorage),
    removeHumanName: (roster, name, suppliedStorage = storage) => removeHumanName(roster, name, suppliedStorage),
    seriesCountPreference: 10, simulationModePreference: 'headless', startModePreference: options.preference ?? 'varied',
    aiGeneration: 0, selected: null, document: { hidden: false }, brand: '<div>CASCADO</div>',
    createGame, configurePlayers, playerSettings, newSession,
    normalizeStartConfig, createSeries, seriesOf, seriesGameId, parseSeriesCount,
    configureStartingPosition(game, config, round) {
      calls.push({ game, config: { ...config }, round });
      return configureStartingPosition(game, config, round);
    },
    crypto: {
      getRandomValues(array) { array[0] = 42; return array; },
      randomUUID: () => 'setup-test-game',
    },
    FormData: class {
      constructor(target) {
        assert.equal(target, form);
        this.values = formDefaults(app.innerHTML);
        for (const [name, value] of Object.entries(overrides)) this.values.set(name, String(value));
      }
      get(name) { return this.values.get(name) ?? null; }
    },
    localStorage: storage,
    escape: value => String(value), speedSlot: () => '', syncSpeedPanel() {},
    stopMotion() { context.aiGeneration++; },
    mixedGame: () => context.session && singleHumanIndex(context.session.game) !== null,
    landscape: () => false,
    renderPlay() { context.mode = 'play'; }, lockBoardForTransition() {},
    renderMask() { masks++; context.mode = 'handoff'; },
    renderHome() { context.mode = 'home'; app.innerHTML = '<div>Accueil</div>'; },
    sound: { unlock() {} },
    async persist(meta) { saves.push({ session: structuredClone(context.session), meta }); },
    confirmReveal: async () => { throw new Error('Setup must not disclose a masked board in this fixture'); },
  });
  vm.runInContext(setup, context, { filename: 'app-original-start-setup.js' });
  const prepare = vm.runInContext('prepare', context);
  return {
    context, app, calls, saves, preferences, prepare, masks: () => masks,
    defaults: () => formDefaults(app.innerHTML),
    async submit(values = {}) {
      overrides = values;
      await formListeners.get('submit')({ preventDefault() {}, currentTarget: form });
    },
    async click(action) {
      const button = { dataset: { action }, closest: selector => selector === '[data-action]' ? button : null };
      await listeners.get('click')({ target: button, detail: 0 });
    },
  };
}

function sessionFor(mode, version = GEOMETRY_VERSION) {
  const game = configurePlayers(createGame(['Camille', 'Léa'], 0, version),
    [{ controller: 'human' }, { controller: 'human' }]);
  if (mode) configureStartingPosition(game, { mode, seed: 42 });
  game.starter = 0;
  return newSession(game);
}

for (const preference of ['varied', 'classic', ORIGINAL_START_MODE]) {
  test(`ordinary setup uses the reconstructed original pose independently of automatic preference ${preference}`, async () => {
    const h = harness(null, { preference });
    await h.click('new');
    assert.equal(h.defaults().get('start-mode'), ORIGINAL_START_MODE);
    await h.submit({ starter: 1 });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].config.mode, ORIGINAL_START_MODE);
    assert.deepEqual(h.context.session.game.angles, [...ORIGINAL_START_ANGLES]);
    assert.equal(h.context.session.game.active, 1);
    assert.equal(h.context.session.game.starter, 1);
    assert.equal(h.context.session.game.startConfig.mode, ORIGINAL_START_MODE);
    assert.equal(h.saves.length, 1);
    assert.deepEqual(h.saves[0].session.game.angles, [...ORIGINAL_START_ANGLES]);
    assert.equal(h.preferences.has('ddc-start-mode'), false, 'ordinary setup must not overwrite the automatic comparison preference');
  });
}

test('ordinary setup can explicitly choose the former neutral pose and still configures it before saving', async () => {
  const h = harness(null, { gameStartPreference: 'classic' });
  h.prepare();
  assert.equal(h.defaults().get('start-mode'), 'classic');
  await h.submit();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].config.mode, 'classic');
  assert.deepEqual(h.context.session.game.angles, [0, 0, 0, 0, 0]);
  assert.equal(h.context.session.game.startConfig, undefined);
  assert.deepEqual(h.saves[0].session.game.angles, [0, 0, 0, 0, 0]);
  assert.equal(h.preferences.has('ddc-start-mode'), false);
});

test('automatic setup retains paired varied starts as its default and saves its own preference', async () => {
  const h = harness();
  await h.click('automatic');
  assert.equal(h.defaults().get('start-mode'), 'varied');
  await h.submit({ 'series-count': 4 });
  const game = h.context.session.game;
  assert.equal(h.calls.length, 1);
  assert.equal(game.startConfig.mode, 'varied');
  assert.deepEqual(game.angles, startingAnglesFor(42, 1));
  assert.equal(game.series.target, 4);
  assert.equal(game.simulationMode, 'headless');
  assert.equal(h.preferences.get('ddc-start-mode'), 'varied');
  assert.ok(game.players.every(player => player.controller === 'ai'));
});

for (const mode of [ORIGINAL_START_MODE, 'classic']) {
  test(`automatic setup configures the explicitly selected ${mode} start`, async () => {
    const h = harness();
    h.prepare(false, false, true);
    await h.submit({ 'start-mode': mode, 'series-count': 3 });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].config.mode, mode);
    assert.deepEqual(h.context.session.game.angles, mode === ORIGINAL_START_MODE ? [...ORIGINAL_START_ANGLES] : [0, 0, 0, 0, 0]);
    assert.equal(h.context.session.game.series.target, 3);
    assert.equal(h.preferences.get('ddc-start-mode'), mode);
  });
}

for (const mode of [ORIGINAL_START_MODE, 'classic']) {
  test(`ordinary rematch retains a saved current-profile ${mode} start and alternates the starter`, async () => {
    const saved = sessionFor(mode);
    rotate(saved.game, 1, 20);
    const snapshot = structuredClone(saved);
    const h = harness(saved);
    await h.click('rematch');
    assert.equal(h.defaults().get('start-mode'), mode);
    assert.deepEqual(saved, snapshot, 'merely opening a rematch must not realign the old session');
    await h.submit();
    assert.notEqual(h.context.session, saved);
    assert.deepEqual(saved, snapshot);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].config.mode, mode);
    assert.deepEqual(h.context.session.game.angles, mode === ORIGINAL_START_MODE ? [...ORIGINAL_START_ANGLES] : [0, 0, 0, 0, 0]);
    assert.equal(h.context.session.game.starter, 1);
    assert.deepEqual(Array.from(h.context.session.game.players, player => player.name), ['Camille', 'Léa']);
  });
}

for (const mode of [ORIGINAL_START_MODE, 'classic']) {
  test(`automatic rematch preserves its saved ${mode} setting, count and display instead of the global preference`, async () => {
    const saved = sessionFor(mode);
    configurePlayers(saved.game, [{ controller: 'ai', level: 'hard' }, { controller: 'ai', level: 'normal' }]);
    saved.game.series = createSeries(8, { id: 'previous-series', firstStarter: 0 });
    saved.game.statsId = seriesGameId(saved.game.series);
    saved.game.simulationMode = 'board';
    const snapshot = structuredClone(saved);
    const h = harness(saved, { preference: 'varied' });
    await h.click('rematch');
    assert.equal(h.defaults().get('start-mode'), mode);
    assert.equal(h.defaults().get('series-count'), '8');
    assert.equal(h.defaults().get('simulation-mode'), 'board');
    await h.submit();
    const game = h.context.session.game;
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].config.mode, mode);
    assert.equal(game.series.target, 8);
    assert.equal(game.series.firstStarter, 1);
    assert.equal(game.simulationMode, 'board');
    assert.equal(game.players[0].level, 'hard');
    assert.equal(game.players[1].level, 'normal');
    assert.equal(h.preferences.get('ddc-start-mode'), mode);
    assert.deepEqual(saved, snapshot);
  });
}

test('an older neutral game retains its explicit rematch choice while the fresh game uses the current profile', async () => {
  const saved = sessionFor(null, PREVIOUS_GEOMETRY_VERSION);
  const h = harness(saved);
  await h.click('rematch');
  assert.equal(h.defaults().get('start-mode'), 'classic');
  await h.submit();
  assert.equal(h.context.session.game.geometryVersion, GEOMETRY_VERSION);
  assert.deepEqual(h.context.session.game.angles, [0, 0, 0, 0, 0]);
  assert.equal(saved.game.geometryVersion, PREVIOUS_GEOMETRY_VERSION);
  assert.deepEqual(saved.game.angles, [0, 0, 0, 0, 0]);
});

for (const automatic of [false, true]) {
  test(`${automatic ? 'automatic' : 'ordinary'} setup rejects an invalid start mode before replacing or saving the active game`, async () => {
    const saved = sessionFor(ORIGINAL_START_MODE);
    const snapshot = structuredClone(saved);
    const h = harness(saved);
    h.prepare(true, false, automatic);
    await h.submit({ 'start-mode': 'unknown', 'series-count': 4 });
    assert.equal(h.context.session, saved);
    assert.deepEqual(saved, snapshot);
    assert.equal(h.calls.length, 0);
    assert.equal(h.saves.length, 0);
    assert.equal(h.preferences.has('ddc-start-mode'), false);
  });
}

test('opening or cancelling setup and resuming an active save never reapplies a starting pose', async () => {
  const saved = sessionFor(ORIGINAL_START_MODE);
  rotate(saved.game, 1, 20);
  const snapshot = structuredClone(saved);
  const h = harness(saved);
  await h.click('new');
  assert.equal(h.context.mode, 'preparation');
  await h.click('home');
  await h.click('resume');
  assert.equal(h.context.session, saved);
  assert.deepEqual(saved, snapshot);
  assert.equal(h.context.mode, 'handoff');
  assert.equal(h.calls.length, 0);
  assert.equal(h.saves.length, 0);
  assert.equal(h.masks(), 1);
});

test('setup cannot replace or reconfigure a save before storage is ready', async () => {
  const saved = sessionFor(ORIGINAL_START_MODE);
  const snapshot = structuredClone(saved);
  const h = harness(saved, { storageReady: false });
  h.prepare(true);
  await h.submit();
  assert.equal(h.context.session, saved);
  assert.deepEqual(saved, snapshot);
  assert.equal(h.calls.length, 0);
  assert.equal(h.saves.length, 0);
});

for (const automatic of [false, true]) {
  test(`${automatic ? 'automatic' : 'ordinary'} setup selects the exact Miroir 50 profile and pool before saving`, async () => {
    const h = harness(null, { setPreference: 'miroir-50' });
    h.prepare(false, false, automatic);
    assert.equal(h.defaults().get('game-set'), 'miroir-50');
    assert.match(h.app.innerHTML, /<input[^>]*type="hidden"[^>]*name="game-set"[^>]*value="miroir-50"/);
    assert.doesNotMatch(h.app.innerHTML, /<select[^>]*name="game-set"/);
    await h.submit({ 'start-mode': 'unknown', 'series-count': 100, starter: 1 });
    const game = h.context.session.game;
    assert.equal(game.gameSetId, 'miroir-50');
    assert.equal(game.geometryVersion, getGameSet('miroir-50').geometryVersion);
    assert.equal(game.startConfig.mode, MIROIR50_START_MODE);
    assert.deepEqual(game.startingAngles, miroir50ScheduleEntry(0, 1).angles);
    assert.equal(h.saves[0].session.game.startingPose.poseId, game.startingPose.poseId);
    assert.equal(h.preferences.has('ddc-game-set'), false, 'Options owns the set preference; starting a game does not rewrite it');
    assert.equal(h.preferences.has('ddc-start-mode'), false);
    assert.equal(h.context.app.dataset.gameSet, 'miroir-50');
    assert.ok(game.faces.every(face => face.queue.length === 10));
    if(automatic) assert.equal(game.series.target, 100);
    else assert.equal(game.starter, 1);
  });
}

test('Miroir 50 rematch complements the stored initial pose and reverses the starter without altering the save', async () => {
  const game = configureStartingPosition(createGame(['A','B'], 1, getGameSet('miroir-50').geometryVersion), { mode:MIROIR50_START_MODE, seed:17 });
  game.starter = 1;
  rotate(game, 2, 15);
  const saved = newSession(game);
  const snapshot = structuredClone(saved);
  const h = harness(saved);
  await h.click('rematch');
  assert.equal(h.defaults().get('game-set'), 'miroir-50');
  assert.deepEqual(saved, snapshot);
  await h.submit();
  const next = h.context.session.game;
  assert.equal(next.starter, 0);
  assert.equal(next.startingPose.familyId, game.startingPose.familyId);
  assert.notEqual(next.startingPose.role, game.startingPose.role);
  assert.deepEqual(next.startingAngles, miroir50ScheduleEntry(miroir50RematchSeed(game), 1).angles);
  assert.deepEqual(saved, snapshot);
});

test('invalid set selection never replaces the saved session or writes preferences', async () => {
  const saved = sessionFor(ORIGINAL_START_MODE);
  const snapshot = structuredClone(saved);
  const h = harness(saved);
  h.prepare(true);
  await h.submit({ 'game-set':'miroir-500' });
  assert.equal(h.context.session, saved);
  assert.deepEqual(saved, snapshot);
  assert.equal(h.saves.length, 0);
  assert.equal(h.preferences.size, 0);
});

test('remembering Miroir 50 only selects a fresh setup and never changes a resumed Reference game', async () => {
  const saved = sessionFor(ORIGINAL_START_MODE);
  const snapshot = structuredClone(saved);
  const h = harness(saved, {setPreference:'miroir-50'});
  h.prepare(true);
  assert.equal(h.defaults().get('game-set'), 'miroir-50');
  await h.click('home');
  await h.click('resume');
  assert.equal(h.context.session, saved);
  assert.deepEqual(saved, snapshot);
  assert.equal(h.calls.length, 0);
  assert.equal(h.saves.length, 0);
});

test('ordinary setup takes hidden next-game settings from Options without rewriting their preferences', async () => {
  const h = harness(null, { gameStartPreference: 'classic', setPreference: 'reference', preference: 'varied' });
  h.prepare();
  assert.equal(h.defaults().get('game-set'), 'reference');
  assert.equal(h.defaults().get('start-mode'), 'classic');
  assert.match(h.app.innerHTML, /<input[^>]*type="hidden"[^>]*name="game-set"/);
  assert.match(h.app.innerHTML, /<input[^>]*type="hidden"[^>]*name="start-mode"/);
  assert.doesNotMatch(h.app.innerHTML, /<select[^>]*name="(?:game-set|start-mode)"/);
  await h.submit();
  assert.equal(h.context.session.game.startConfig, undefined);
  assert.deepEqual(h.context.session.game.angles, [0, 0, 0, 0, 0]);
  for (const key of ['ddc-game-set', 'ddc-game-start-mode', 'ddc-start-mode']) assert.equal(h.preferences.has(key), false);
});

test('new human names are normalized, remembered and selectable on subsequent setup and a later app opening', async () => {
  const h = harness(null, { humanRoster: loadHumanRoster(null) });
  h.prepare();
  await h.submit({ controller1: 'human', controller2: 'human', 'saved-name1': 'new', 'saved-name2': 'new', player1: '  Zoe\u0301   Martin  ', player2: '  Noé  ' });
  assert.deepEqual(Array.from(h.context.session.game.players, p => p.name), ['Zoé Martin', 'Noé']);
  const stored = JSON.parse(h.preferences.get('ddc-human-roster'));
  assert.deepEqual(stored.lastNames, ['Zoé Martin', 'Noé']);
  assert.ok(stored.names.includes('Zoé Martin'));assert.ok(stored.names.includes('Noé'));
  h.prepare();
  assert.equal(h.defaults().get('saved-name1'), String(h.context.humanRoster.names.indexOf('Zoé Martin')));
  assert.equal(h.defaults().get('saved-name2'), String(h.context.humanRoster.names.indexOf('Noé')));
  await h.submit({ player1: 'Ignored text for a saved name', player2: 'Ignored text for a saved name' });
  assert.deepEqual(Array.from(h.context.session.game.players, p => p.name), ['Zoé Martin', 'Noé']);
  const reopened = harness(null, { preferences: h.preferences });
  reopened.prepare();
  assert.equal(reopened.defaults().get('saved-name1'), String(reopened.context.humanRoster.names.indexOf('Zoé Martin')));
  assert.equal(reopened.defaults().get('saved-name2'), String(reopened.context.humanRoster.names.indexOf('Noé')));
  await reopened.submit();
  assert.deepEqual(Array.from(reopened.context.session.game.players, p => p.name), ['Zoé Martin', 'Noé']);
});

test('a mixed game ignores the AI name fields and remembers only the chosen human', async () => {
  const roster = rememberHumanNames(loadHumanRoster(null), ['Anaïs', 'Noé'], null);
  const h = harness(null, { humanRoster: roster });
  h.prepare();
  await h.submit({ controller1: 'ai', level1: 'hard', player1: 'Should not be remembered', 'saved-name1': 'new',
    controller2: 'human', 'saved-name2': 'new', player2: '  Éloïse  ' });
  assert.deepEqual(Array.from(h.context.session.game.players, p => p.name), ['IA 1', 'Éloïse']);
  assert.equal(h.context.session.game.players[0].level, 'hard');
  assert.equal(h.context.session.game.players[0].controller, 'ai');
  const stored = JSON.parse(h.preferences.get('ddc-human-roster'));
  assert.deepEqual(stored.lastNames, ['Anaïs', 'Éloïse']);
  assert.ok(!stored.names.includes('IA 1'));assert.ok(!stored.names.includes('Should not be remembered'));
  assert.ok(stored.names.includes('Anaïs'));assert.ok(stored.names.includes('Éloïse'));
});

test('an automatic duel has no editable name fields, applies both levels and preserves remembered humans', async () => {
  const roster = rememberHumanNames(loadHumanRoster(null), ['Anaïs', 'Noé'], null);
  const h = harness(null, { humanRoster: roster });
  h.prepare(false, false, true);
  for (const [, attributes] of h.app.innerHTML.matchAll(/<input\b([^>]*)>/g)) {
    if (/\bname="player[12]"/.test(attributes)) assert.ok(/\btype="hidden"/.test(attributes) || /\bdisabled\b/.test(attributes));
  }
  await h.submit({ level1: 'hard', level2: 'easy', player1: 'Injected name 1', player2: 'Injected name 2', 'series-count': 2 });
  const players = h.context.session.game.players;
  assert.deepEqual(Array.from(players, p => p.name), ['IA 1', 'IA 2']);
  assert.deepEqual(Array.from(players, p => p.level), ['hard', 'easy']);
  assert.ok(players.every(p => p.controller === 'ai'));
  assert.deepEqual(structuredClone(h.context.humanRoster), roster);
  assert.ok(!h.context.humanRoster.names.includes('IA 1'));assert.ok(!h.context.humanRoster.names.includes('IA 2'));
  assert.ok(!h.context.humanRoster.names.includes('Injected name 1'));
});

test('invalid saved-name indices fall back to normalized new human names without selecting a different person', async () => {
  const roster = rememberHumanNames(loadHumanRoster(null), ['Anaïs', 'Noé'], null);
  const h = harness(null, { humanRoster: roster });
  h.prepare();
  await h.submit({ controller1: 'human', controller2: 'human', 'saved-name1': '999', 'saved-name2': '-1',
    player1: '  Zoé  ', player2: '  Émile  ' });
  assert.deepEqual(Array.from(h.context.session.game.players, p => p.name), ['Zoé', 'Émile']);
  assert.deepEqual(JSON.parse(h.preferences.get('ddc-human-roster')).lastNames, ['Zoé', 'Émile']);
});


test('an intentionally empty human roster opens blank fields without resurrecting saved-session names', async () => {
  const saved = sessionFor(ORIGINAL_START_MODE), snapshot = structuredClone(saved);
  const empty = { names: [], lastNames: [null, null] };
  const preferences = new Map([['ddc-human-roster', JSON.stringify(empty)]]);
  const h = harness(saved, { preferences });
  h.prepare(true);
  assert.equal(h.defaults().get('saved-name1'), 'new');assert.equal(h.defaults().get('saved-name2'), 'new');
  assert.equal(h.defaults().get('player1'), '');assert.equal(h.defaults().get('player2'), '');
  assert.deepEqual(structuredClone(h.context.humanRoster), empty);
  await h.submit();
  assert.equal(h.context.session, saved);assert.deepEqual(saved, snapshot);assert.equal(h.saves.length, 0);
  assert.deepEqual(JSON.parse(h.preferences.get('ddc-human-roster')), empty);
});

test('a removed current-session name stays absent when preparation is reopened', () => {
  const saved = sessionFor(ORIGINAL_START_MODE), snapshot = structuredClone(saved);
  const initial = rememberHumanNames(loadHumanRoster(null), ['Camille', 'Léa'], null);
  const roster = removeHumanName(initial, 'Camille', null);
  const h = harness(saved, { humanRoster: roster });
  h.prepare(true);
  assert.equal(h.defaults().get('player1'), '');assert.equal(h.defaults().get('saved-name1'), 'new');
  assert.equal(h.defaults().get('saved-name2'), String(roster.names.indexOf('Léa')));
  assert.ok(!h.context.humanRoster.names.includes('Camille'));
  h.prepare(true);assert.ok(!h.context.humanRoster.names.includes('Camille'));
  assert.deepEqual(saved, snapshot);assert.equal(h.saves.length, 0);
});
