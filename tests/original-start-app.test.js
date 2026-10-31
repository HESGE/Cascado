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
  ORIGINAL_START_ANGLES, startingAnglesFor } from '../src/starting-position.js';

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
  const preferences = new Map();
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
    localStorage: { setItem: (name, value) => preferences.set(name, value) },
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
  const h = harness();
  h.prepare();
  await h.submit({ 'start-mode': 'classic' });
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
