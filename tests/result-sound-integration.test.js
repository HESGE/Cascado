import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createGame } from '../src/engine.js';
import { acceptReveal, newSession } from '../src/flow.js';
import { configurePlayers, isAIPlayer, singleHumanIndex } from '../src/players.js';
import { createSeries, seriesOf, seriesGameId, recordSeriesResult, createNextSeriesGame } from '../src/series.js';
import { tokenTotal } from '../src/tokens.js';
import { aiSpeedProfile } from '../src/ai-speed.js';
import { getResultSound } from '../src/result-sound.js';
import { getGameSet, gameSetIdForGeometry } from '../src/game-sets.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function between(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `App result-sound boundary remains available: ${start}`);
  return source.slice(first, last);
}

// Execute the real reveal, result rendering, series boundary and UI router.
// Storage completion is controlled; sound output is observed at its public API.
// Audio hardware/asset playback belongs to sound.test.js, while this suite
// verifies when the app is permitted to disclose and announce the outcome.
const routing = between('const gameSetLabel =', '\n// Keep the controls connected')
  + between('function playRevealedResultSound()', '\nfunction startingProtocolInfo(')
  + between('function renderSeriesSummary(', '\nfunction renderRules(')
  + between('async function confirmReveal()', '\nfunction interrupt(')
  + between('function interrupt()', "\ndocument.addEventListener('pointerdown'")
  + between('function stopMotion()', '\nfunction cancelAITurn(')
  + between("app.addEventListener('click',async event=>{", "\napp.addEventListener('keydown'");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function finished({ active = 0, winner = active, controllers = ['human', 'human'], phase = 'passed' } = {}) {
  const game = configurePlayers(createGame(['A', 'B'], active), controllers.map(controller => ({ controller })));
  game.statsId = 'result-sound-game';
  game.turn = 8;
  game.verdict = winner === null ? { reason: 'draw', winner: null } : { reason: 'complete', winner };
  return { game, phase, recipient: active };
}

function seriesResult({ target = 3, previousWins = [1, 1], winner = 0, simulationMode = 'board' } = {}) {
  const session = finished({ controllers: ['ai', 'ai'], winner });
  const completed = previousWins[0] + previousWins[1];
  const series = createSeries(target, { id: 'result-sound-series' });
  Object.assign(series, { completed, round: completed + 1, wins: [...previousWins], totalTurns: completed * 7,
    lastGameId: completed ? seriesGameId(series, completed) : null });
  session.game.series = series;
  session.game.statsId = seriesGameId(series);
  session.game.simulationMode = simulationMode;
  return session;
}

function harness(session = finished(), options = {}) {
  const sounds = [];
  const trace = [];
  const saves = [];
  const waits = [];
  const listeners = new Map();
  const app = {
    innerHTML: '', dataset: {},
    querySelector: () => null,
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  const document = { hidden: false };
  let masks = 0;
  let aiTurns = 0;
  let headlessRuns = 0;
  let portrait = true;
  const sound = {
    unlock() { trace.push('unlock'); },
    stop() { trace.push('stop'); },
    result(kind) {
      sounds.push({ kind, phase: context.session.phase, mode: context.mode,
        saved: saves.some(save => save.session === context.session && save.done) });
      trace.push('result'); return true;
    },
  };
  const context = vm.createContext({
    app, document, sound, session, aiGeneration: 0, failed: false, mode: options.mode ?? 'handoff',
    aiSpeed: options.aiSpeed ?? 'normal', selected: null, contacts: new Set(), keys: new Set(), blockers: new Set(),
    statisticsReturn: 'result', brand: '<div>CASCADO</div>',
    acceptReveal, isAIPlayer, getResultSound, seriesOf, recordSeriesResult, createNextSeriesGame, newSession,
    tokenTotal, aiSpeedProfile, getGameSet, gameSetIdForGeometry,
    symbol: value => value, escape: value => String(value), focusFirst() {},
    seriesScore: () => '', speedSlot: () => '',
    hasAI: () => [0, 1].some(index => isAIPlayer(context.session.game, index)),
    mixedGame: () => singleHumanIndex(context.session.game) !== null,
    headlessSeries: () => context.session?.game.simulationMode === 'headless' && Boolean(seriesOf(context.session.game)),
    landscape: () => !portrait,
    cancelSoundTest() {}, finishSurfacePress() {}, alignmentFeedback: { stop() {} }, cancelBoardMotion() {},
    cancelAITurn() { context.aiGeneration++; },
    renderMask() { masks++; context.stopMotion(); context.mode = 'handoff'; app.innerHTML = '<div>Masqué</div>'; },
    renderPlay() { context.mode = 'play'; },
    renderAIReady() { context.mode = 'ai-ready'; },
    runAITurn: async () => { aiTurns++; context.mode = 'ai-play'; },
    runHeadlessSimulation: async () => { headlessRuns++; context.mode = 'ai-simulation'; },
    async persist(meta) {
      const save = { session: context.session, meta, done: false };
      const gate = options.saveGates?.[saves.length];
      saves.push(save); trace.push('save-start');
      if (gate) await gate.promise;
      save.done = true; trace.push('save-end');
    },
    async waitForAI(duration) { waits.push(duration); return false; },
    waitAIFrame: async () => false,
    activationAllowed: () => true,
  });
  vm.runInContext(routing, context, { filename: 'app-result-sound.js' });
  const api = vm.runInContext('({confirmReveal, renderResult, playRevealedResultSound, interrupt})', context);
  return { context, api, app, document, sounds, trace, saves, waits,
    masks: () => masks, aiTurns: () => aiTurns, headlessRuns: () => headlessRuns,
    landscape(value = true) { portrait = !value; },
    async click(action) {
      const button = { dataset: { action }, closest: selector => selector === '[data-action]' ? button : null };
      await listeners.get('click')({ target: button, detail: 0 });
    },
  };
}

test('result music: a passed verdict stays silent until the reveal has been durably saved and rendered', async () => {
  const gate = deferred();
  const h = harness(finished(), { saveGates: [gate] });
  assert.equal(h.api.playRevealedResultSound(), false);
  const pending = h.api.confirmReveal();
  assert.equal(h.context.session.phase, 'revealed-result', 'the in-memory reveal alone must not announce a result');
  assert.equal(h.context.mode, 'revealing');
  assert.deepEqual(h.sounds, []);
  gate.resolve(); await pending;
  assert.deepEqual(h.sounds, [{ kind: 'victory', phase: 'revealed-result', mode: 'result', saved: true }]);
  assert.ok(h.trace.indexOf('result') > h.trace.indexOf('save-end'));
});

test('result music: an open hidden verdict is not consulted by the result-audio path', async () => {
  const session = finished({ phase: 'open' });
  Object.defineProperty(session.game, 'verdict', { get() { throw new Error('Hidden verdict was read by presentation'); } });
  const h = harness(session);
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'play');
  assert.equal(session.phase, 'open');
  assert.deepEqual(h.sounds, []);
});

for (const human of [0, 1]) {
  for (const winner of [0, 1]) {
    test(`result music: mixed game human ${human}, winner ${winner} uses the human perspective`, async () => {
      const controllers = [0, 1].map(index => index === human ? 'human' : 'ai');
      const h = harness(finished({ active: 1 - human, winner, controllers }));
      await h.api.confirmReveal();
      assert.deepEqual(h.sounds.map(sound => sound.kind), [winner === human ? 'victory' : 'defeat']);
    });
  }
}

for (const recipient of [0, 1]) {
  for (const winner of [0, 1]) {
    test(`result music: two humans announce winner ${winner} to phone recipient ${recipient}`, async () => {
      const h = harness(finished({ active: recipient, winner }));
      await h.click('identify');
      assert.deepEqual(h.sounds.map(sound => sound.kind), [winner === recipient ? 'victory' : 'defeat']);
    });
  }
}

test('result music: a draw renders the result without victory or defeat music', async () => {
  const h = harness(finished({ winner: null }));
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.match(h.app.innerHTML, /Égalité/);
  assert.deepEqual(h.sounds, []);
});

test('result music: re-rendering, statistics return and another reveal cannot repeat a newly announced result', async () => {
  const h = harness();
  await h.api.confirmReveal();
  h.api.renderResult(); h.api.renderResult();
  h.context.mode = 'statistics'; await h.click('statistics-back');
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.equal(h.sounds.length, 1);
});

test('result music: an already revealed saved session resumes silently after a fresh load', async () => {
  const h = harness(finished({ phase: 'revealed-result' }));
  await h.click('identify');
  assert.equal(h.context.mode, 'result');
  assert.deepEqual(h.sounds, []);
});

test('result music: pausing during the reveal save cancels music and its later masked resume stays silent', async () => {
  const gate = deferred();
  const h = harness(finished(), { saveGates: [gate] });
  const pending = h.api.confirmReveal();
  h.api.interrupt(); gate.resolve(); await pending;
  assert.equal(h.context.mode, 'handoff');
  assert.deepEqual(h.sounds, []);
  await h.click('identify');
  assert.equal(h.context.mode, 'result');
  assert.deepEqual(h.sounds, []);
});

for (const condition of ['hidden', 'landscape', 'failed-save', 'session-replaced', 'stale-generation']) {
  test(`result music: ${condition} during persistence suppresses the stale reveal callback`, async () => {
    const gate = deferred();
    const h = harness(finished(), { saveGates: [gate] });
    const pending = h.api.confirmReveal();
    if (condition === 'hidden') h.document.hidden = true;
    if (condition === 'landscape') h.landscape();
    if (condition === 'failed-save') { h.context.failed = true; h.context.mode = 'error'; }
    if (condition === 'session-replaced') h.context.session = finished();
    if (condition === 'stale-generation') h.context.aiGeneration++;
    gate.resolve(); await pending;
    assert.deepEqual(h.sounds, []);
  });
}

test('result music: overlapping reveal callbacks cannot announce the same result twice', async () => {
  const first = deferred(); const second = deferred();
  const h = harness(finished(), { saveGates: [first, second] });
  const one = h.api.confirmReveal(); const two = h.api.confirmReveal();
  first.resolve(); second.resolve(); await Promise.all([one, two]);
  assert.ok(h.sounds.length <= 1);
  await h.api.confirmReveal();
  assert.ok(h.sounds.length <= 1);
});

for (const winner of [0, 1]) {
  test(`result music: an observed AI duel celebrates winner ${winner} independently of the next active seat`, async () => {
    const h = harness(finished({ active: 1 - winner, winner, controllers: ['ai', 'ai'] }));
    await h.api.confirmReveal();
    assert.deepEqual(h.sounds.map(sound => sound.kind), ['victory']);
    assert.equal(h.aiTurns(), 0, 'a revealed result cannot start another AI turn');
  });
}

test('result music: Full AI results remain silent', async () => {
  const h = harness(finished({ controllers: ['ai', 'ai'] }), { aiSpeed: 'full' });
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.deepEqual(h.sounds, []);
});

test('result music: a previously selected Full speed does not mute a later game between humans', async () => {
  const h = harness(finished(), { aiSpeed: 'full' });
  await h.api.confirmReveal();
  assert.deepEqual(h.sounds.map(sound => sound.kind), ['victory']);
});

test('result music: intermediate series results keep their normal transition without music', async () => {
  const h = harness(seriesResult({ previousWins: [0, 0] }));
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'series-next');
  assert.deepEqual(h.waits, [1200]);
  assert.equal(h.context.session.game.series.completed, 1);
  assert.deepEqual(h.sounds, []);
});

test('result music: a final series winner receives one victory melody at the rendered aggregate summary', async () => {
  const h = harness(seriesResult());
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.match(h.app.innerHTML, /Bilan des confrontations/);
  assert.deepEqual(h.sounds.map(sound => sound.kind), ['victory']);
  h.api.renderResult(); await h.api.confirmReveal();
  assert.equal(h.sounds.length, 1);
});

test('result music: an aggregate series draw stays silent even when its final individual round had a winner', async () => {
  const h = harness(seriesResult({ target: 2, previousWins: [1, 0], winner: 1 }));
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.deepEqual(h.context.session.game.series.wins, [1, 1]);
  assert.deepEqual(h.sounds, []);
});

test('result music: a final round draw still celebrates an unequal aggregate series score', async () => {
  const h = harness(seriesResult({ previousWins: [2, 0], winner: null }));
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.deepEqual(h.sounds.map(sound => sound.kind), ['victory']);
});

test('result music: the final headless summary is silent even though it takes the rendered-result branch', async () => {
  const h = harness(seriesResult({ simulationMode: 'headless' }));
  await h.api.confirmReveal();
  assert.equal(h.context.mode, 'result');
  assert.equal(h.headlessRuns(), 0, 'the final headless round bypasses the continuing-simulation branch');
  assert.deepEqual(h.sounds, []);
});

test('result music: announcement adds no persistence marker or other game-state mutation', async () => {
  const session = finished();
  const before = JSON.stringify(session.game);
  const keys = Object.keys(session).sort();
  const h = harness(session);
  await h.api.confirmReveal();
  assert.equal(JSON.stringify(session.game), before);
  assert.deepEqual(Object.keys(session).sort(), keys);
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0].meta.type, 'reveal');
});
