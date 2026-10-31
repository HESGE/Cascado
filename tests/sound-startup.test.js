import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createSoundPlayer, SOUND_PREFERENCE_KEY } from '../src/sound.js';
import { createGame } from '../src/engine.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function between(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `App sound startup boundary remains available: ${start}`);
  return source.slice(first, last);
}

// Exercise the real screen, async cancellation, click routing and lifecycle
// listeners, together with the real sound player. Only browser surfaces, clock,
// audio hardware and clip transport are replaced. No browser injection or
// runtime test hook is used.
const startup = between('function renderHome()', '\nfunction ensureStatisticsIdentity(')
  + between('function soundIcon()', '\nfunction renderPlay(')
  + between('function stopMotion()', '\nfunction cancelAITurn(')
  + between('function interrupt()', "\ndocument.addEventListener('pointerdown'")
  + between("app.addEventListener('click',async event=>{", "\napp.addEventListener('keydown'")
  + between("document.addEventListener('visibilitychange'", "\nwindow.addEventListener('beforeinstallprompt'");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function drain() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function harness(options = {}) {
  let now = 0;
  let timerId = 0;
  let html = '';
  let writes = 0;
  let reveals = 0;
  const timers = new Map();
  const nodes = new Map();
  const appListeners = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const preferenceWrites = [];
  const calls = [];
  const audio = { contexts: [], sources: [], requests: [] };
  const forbiddenSave = () => { writes++; throw new Error('The sound help must not write game data'); };
  const node = action => ({
    dataset: { action }, disabled: false, textContent: '', innerHTML: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    closest(selector) { return selector === '[data-action]' || selector === 'button' ? this : null; },
  });
  const app = {
    dataset: {},
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      nodes.clear();
      for (const match of value.matchAll(/<button\b[^>]*data-action="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)) {
        const button = node(match[1]); button.textContent = match[2];
        nodes.set(`[data-action="${match[1]}"]`, button);
      }
      const status = value.match(/<p\b[^>]*id="sound-test-status"[^>]*>([\s\S]*?)<\/p>/);
      if (status) nodes.set('#sound-test-status', { textContent: status[1] });
    },
    querySelector: selector => nodes.get(selector) ?? null,
    addEventListener(name, callback) { appListeners.set(name, callback); },
  };
  const document = { hidden: false, addEventListener(name, callback) { documentListeners.set(name, callback); } };
  const window = { addEventListener(name, callback) { windowListeners.set(name, callback); } };
  class AudioContext {
    constructor() {
      if (options.constructorError) throw new Error('Audio unavailable');
      this.state = 'suspended'; this.currentTime = 1; this.sampleRate = 44100; this.destination = {};
      audio.contexts.push(this);
    }
    async resume() {
      if (options.resumeGate) await options.resumeGate.promise;
      this.state = 'running';
    }
    async close() { this.state = 'closed'; }
    createGain() {
      return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
    createBuffer(channels, frames, sampleRate) { return { duration: frames / sampleRate, warmup: true }; }
    createBufferSource() {
      const voice = { started: false, stopped: false, playbackRate: { value: 1 },
        connect() {}, disconnect() {},
        start() { this.started = true; }, stop() { this.stopped = true; },
      };
      audio.sources.push(voice);
      return voice;
    }
    async decodeAudioData() { return { duration: .3, decoded: true }; }
  }
  const player = createSoundPlayer({
    enabled: options.enabled ?? false, AudioContext, now: () => now,
    fetch: async url => {
      audio.requests.push(url);
      if (options.fetchGate) await options.fetchGate.promise;
      return { ok: !options.fetchError, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  const sound = {
    get enabled() { return player.enabled; }, get available() { return player.available; },
    setEnabled(value) { calls.push({ name: 'setEnabled', value }); player.setEnabled(value); },
    confirmEnabled() { calls.push({ name: 'confirmEnabled' }); return player.confirmEnabled(); },
    unlock() { calls.push({ name: 'unlock' }); return player.unlock(); },
    stop() { calls.push({ name: 'stop' }); player.stop(); },
  };
  const context = vm.createContext({
    app, document, window, sound, SOUND_PREFERENCE_KEY,
    mode: options.mode ?? 'home', session: options.session ?? null,
    soundTestRequest: 0, soundTestTimer: null, soundTestCancel: null,
    updateAvailable: false, brand: '<div>CASCADO</div>',
    selected: null, surfacePress: null, contacts: new Set(), keys: new Set(), blockers: new Set(),
    localStorage: { setItem(key, value) { preferenceWrites.push([key, value]); } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    focusFirst() {}, offlineStatus: () => 'Mode navigateur',
    cancelAITurn() {}, finishSurfacePress() {}, alignmentFeedback: { stop() {} }, cancelBoardMotion() {},
    landscape: () => false,
    renderMask() { context.mode = 'handoff'; },
    activationAllowed: () => options.activationAllowed ?? true,
    confirmReveal: async () => { reveals++; context.mode = 'play'; },
    persist: forbiddenSave, saveGame: forbiddenSave, clearGame: forbiddenSave,
    loadGame: forbiddenSave, resetStatistics: forbiddenSave,
  });
  vm.runInContext(startup, context, { filename: 'app-sound-startup.js' });
  const api = vm.runInContext('({renderHome, renderSoundHelp, testSound, cancelSoundTest, stopMotion, interrupt})', context);
  return { app, document, context, api, audio, player, calls, timers, preferenceWrites,
    button: () => app.querySelector('[data-action="sound-test"]'),
    status: () => app.querySelector('#sound-test-status')?.textContent,
    audible: () => audio.sources.filter(voice => voice.started && voice.buffer?.decoded),
    count: name => calls.filter(call => call.name === name).length,
    saves: () => writes, reveals: () => reveals,
    async click(action) {
      const target = app.querySelector(`[data-action="${action}"]`) ?? node(action);
      return appListeners.get('click')({ target, detail: 0 });
    },
    emit(name) {
      if (name === 'visibilitychange') document.hidden = true;
      (documentListeners.get(name) ?? windowListeners.get(name))?.({ persisted: false });
    },
    advance(elapsed) {
      now += elapsed;
      for (const [id, timer] of [...timers]) if (timer.due <= now) {
        timers.delete(id); timer.callback();
      }
    },
  };
}

test('sound help: the home entry renders a dedicated screen without starting or enabling audio', async () => {
  const h = harness();
  h.api.renderHome();
  assert.match(h.app.innerHTML, /data-action="sound-help"/);
  await h.click('sound-help');
  assert.equal(h.context.mode, 'sound-help');
  assert.ok(h.button());
  assert.match(h.app.innerHTML, /data-action="home"/);
  assert.equal(h.player.enabled, false);
  assert.equal(h.audio.contexts.length, 0);
  assert.deepEqual(h.preferenceWrites, []);
  assert.equal(h.saves(), 0);
});

test('sound help: only the dedicated mode accepts a test and only home accepts its entry action', async () => {
  for (const mode of ['play', 'handoff', 'ai-play', 'result']) {
    const h = harness({ mode });
    await h.click('sound-help');
    await h.click('sound-test');
    assert.equal(h.context.mode, mode);
    assert.equal(h.count('confirmEnabled'), 0);
    assert.equal(h.audio.contexts.length, 0);
    assert.deepEqual(h.preferenceWrites, []);
    assert.equal(h.timers.size, 0);
  }
});

test('sound help: explicit activation saves only the sound preference and confirms a launched click', async () => {
  const h = harness();
  await h.click('sound-help');
  await h.click('sound-test');
  assert.equal(h.player.enabled, true);
  assert.deepEqual(h.preferenceWrites, [[SOUND_PREFERENCE_KEY, 'on']]);
  assert.equal(h.count('confirmEnabled'), 1);
  assert.equal(h.audible().length, 1, 'the real sound player launches one decoded confirmation, excluding its silent warmup');
  assert.match(h.status(), /clic de test a été lancé/);
  assert.equal(h.button().disabled, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.saves(), 0);
});

test('sound help: a repeated press while activation is pending does not create another test', async () => {
  const gate = deferred();
  const h = harness({ fetchGate: gate });
  await h.click('sound-help');
  const pending = h.click('sound-test');
  assert.equal(h.button().disabled, true);
  await h.click('sound-test');
  assert.equal(h.count('confirmEnabled'), 1);
  assert.equal(h.timers.size, 1);
  gate.resolve(); await pending;
  assert.equal(h.audible().length, 1);
  assert.equal(h.button().disabled, false);
});

test('sound help: 2500ms timeout cancels audio, rearms the button and rejects a late confirmation', async () => {
  const gate = deferred();
  const h = harness({ fetchGate: gate });
  await h.click('sound-help');
  const stoppedBefore = h.count('stop');
  const pending = h.click('sound-test');
  h.advance(2499); await drain();
  assert.equal(h.button().disabled, true);
  assert.match(h.status(), /Activation du son/);
  h.advance(1); await pending;
  assert.ok(h.count('stop') > stoppedBefore);
  assert.equal(h.button().disabled, false);
  assert.equal(h.timers.size, 0);
  assert.match(h.status(), /n’a pas démarré/);
  gate.resolve(); await drain();
  assert.equal(h.audible().length, 0, 'finishing clip loading after the timeout cannot play a delayed click');
  assert.equal(h.player.ready, false);
  await h.click('sound-test');
  assert.equal(h.audible().length, 1, 'the next explicit press can recover without reloading the page');
});

for (const event of ['blur', 'visibilitychange', 'pagehide']) {
  test(`sound help: ${event} cancels a pending test even without an existing game`, async () => {
    const gate = deferred();
    const h = harness({ fetchGate: gate });
    await h.click('sound-help');
    const pending = h.click('sound-test');
    h.emit(event);
    await pending;
    assert.equal(h.button().disabled, false);
    assert.equal(h.timers.size, 0);
    assert.match(h.status(), /Test interrompu/);
    gate.resolve(); await drain();
    assert.equal(h.audible().length, 0);
    assert.equal(h.player.ready, false);
    assert.equal(h.saves(), 0);
  });
}

test('sound help: leaving for home resolves cancellation immediately and never updates the new screen', async () => {
  const gate = deferred();
  const h = harness({ fetchGate: gate });
  await h.click('sound-help');
  const pending = h.click('sound-test');
  await h.click('home'); await pending;
  assert.equal(h.context.mode, 'home');
  assert.equal(h.button(), null);
  assert.equal(h.timers.size, 0);
  const home = h.app.innerHTML;
  gate.resolve(); await drain();
  assert.equal(h.audible().length, 0);
  assert.equal(h.app.innerHTML, home);
});

test('sound help: an unavailable audio context reports failure without leaving a disabled button or timer', async () => {
  const h = harness({ constructorError: true });
  await h.click('sound-help'); await h.click('sound-test');
  assert.match(h.status(), /n’a pas démarré/);
  assert.equal(h.button().disabled, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.audible().length, 0);
});

test('sound help: help, successful tests and interruptions preserve the complete saved session', async () => {
  const session = { game: createGame(['A', 'B']), phase: 'passed', recipient: 1 };
  const before = JSON.stringify(session);
  const h = harness({ session });
  await h.click('sound-help'); await h.click('sound-test'); h.emit('blur'); await h.click('home');
  assert.equal(h.context.session, session);
  assert.equal(JSON.stringify(session), before);
  assert.equal(h.saves(), 0);
  assert.equal(h.reveals(), 0);
  assert.ok(h.preferenceWrites.every(([key]) => key === SOUND_PREFERENCE_KEY));
});

test('sound startup: the existing board toggle still switches its preference and confirms activation', async () => {
  const h = harness({ mode: 'play' });
  await h.click('sound'); await drain();
  assert.equal(h.player.enabled, true);
  assert.equal(h.count('confirmEnabled'), 1);
  assert.equal(h.audible().length, 1);
  assert.equal(h.context.mode, 'play');
  await h.click('sound');
  assert.equal(h.player.enabled, false);
  assert.deepEqual(h.preferenceWrites, [[SOUND_PREFERENCE_KEY, 'on'], [SOUND_PREFERENCE_KEY, 'off']]);
  assert.equal(h.count('confirmEnabled'), 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.saves(), 0);
});

test('sound startup: the single phone-handoff confirmation keeps its existing route', async () => {
  const h = harness({ mode: 'handoff', session: { game: createGame(['A', 'B']), phase: 'passed', recipient: 1 } });
  await h.click('identify');
  assert.equal(h.reveals(), 1);
  assert.equal(h.count('unlock'), 1);
  assert.equal(h.count('confirmEnabled'), 0);
  assert.equal(h.context.mode, 'play');
  assert.deepEqual(h.preferenceWrites, []);
  assert.equal(h.timers.size, 0);
});
