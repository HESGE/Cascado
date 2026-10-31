import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createGame, rotate, getView, allowedWheels } from '../src/engine.js';
import { renderBoard, wheelCenter } from '../src/board.js';
import { visibleTransfers, hasOpponentFall } from '../src/flow.js';
import { getOpponentProgress } from '../src/opponent-progress.js';
import { physicalAngleFor, gates, angularDistance, OUTPUT_GATE } from '../src/geometry.js';
import { createMagneticDrag, advanceMagneticDrag } from '../src/magnet.js';
import { createWheelGesture, advanceWheelGesture } from '../src/gesture.js';
import { wheelAtPoint } from '../src/wheel-hit.js';
import { ROTATION_STEP, rotationDetentDelta } from '../src/detents.js';
import { createAlignmentFeedback } from '../src/feedback.js';
import { createPassageFeedbackTracker, advancePassageFeedbackTracker } from '../src/passage-feedback.js';
import { displayedFaceIndex, playerSettings } from '../src/players.js';
import { createAIRotation, advanceAIRotation, completeAIRotation, AI_THINK_MS, AI_SELECT_MS, AI_TOKEN_DURATION_SCALE, AI_SETTLE_MS } from '../src/ai-motion.js';
import { aiSpeedProfile } from '../src/ai-speed.js';

const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function between(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `App routing boundary remains available: ${start}`);
  return source.slice(first, last);
}

// Run the app's real routing and captured event handlers in Node. Only browser
// surfaces, audio output and persistence are replaced; gestures, geometry,
// magnets, passage tracking, rendering and the game engine are production code.
// No browser execution, application export or production test hook is needed.
const routing = between('const alignmentFeedback = createAlignmentFeedback({', '\nconst landscape =')
  + between('function refreshPlay(', '\nfunction cancelAITurn(')
  + between('async function runAITurn()', '\nasync function finishTurn(');

function emptyGame(face) {
  const game = createGame(['A', 'B'], face);
  for (const board of game.faces) {
    board.queue = [];
    board.slots.forEach(slots => slots.fill(null));
    board.exited = [];
  }
  return game;
}

function passageGame(face, receiverOpen = true, offset = -25) {
  const game = emptyGame(face);
  const gate = gates(face).find(item => item.from === 1 && item.to === 2);
  game.angles[0] = physicalAngleFor(face, 1, 0, gate.sourceAngle + offset, game.geometryVersion);
  game.angles[1] = physicalAngleFor(face, 2, 0, gate.targetAngle + (receiverOpen ? 0 : 60), game.geometryVersion);
  return game;
}

function harness(game, options = {}) {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const timers = new Map();
  const appListeners = new Map();
  const documentListeners = new Map();
  const captures = new Set();
  const sounds = [];
  const animations = [];
  const saves = [];
  const failures = [];
  let turnsFinished = 0;
  const board = { innerHTML: '' };
  const labels = new Map();
  const svg = {
    getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }),
  };
  const app = {
    dataset: {},
    addEventListener(name, callback) { appListeners.set(name, callback); },
    querySelector(selector) {
      if (selector === '.board-wrap') return board;
      if (selector === '.game-board') return svg;
      if (selector.startsWith('[data-wheel=')) return null;
      if (!labels.has(selector)) labels.set(selector, { textContent: '', focus() {} });
      return labels.get(selector);
    },
    querySelectorAll: () => [],
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture(id) { captures.delete(id); },
  };
  const document = { hidden: false, addEventListener(name, callback) { documentListeners.set(name, callback); } };
  const sound = Object.fromEntries(['turn', 'detent', 'slide', 'drop', 'unlock', 'stop'].map(name =>
    [name, () => sounds.push({ name, time: now })]));
  const context = vm.createContext({
    app, document, sound, session: { game }, mode: options.mode ?? 'play', selected: null,
    surfacePress: null, contacts: new Set(), HOLD_DELAY: 250, REPEAT_INTERVAL: 100,
    failed: false, aiGeneration: 0, aiDirtyGame: null, aiSpeed: options.aiSpeed ?? 'normal',
    performance: { now: () => now },
    getView, rotate, allowedWheels, renderBoard, wheelCenter, getOpponentProgress,
    visibleTransfers, hasOpponentFall, createMagneticDrag, advanceMagneticDrag,
    createWheelGesture, advanceWheelGesture, wheelAtPoint, ROTATION_STEP, rotationDetentDelta,
    createPassageFeedbackTracker, advancePassageFeedbackTracker,
    displayedFaceIndex, playerSettings, createAIRotation, advanceAIRotation, completeAIRotation,
    AI_THINK_MS, AI_SELECT_MS, AI_TOKEN_DURATION_SCALE, AI_SETTLE_MS, aiSpeedProfile,
    createAlignmentFeedback: settings => createAlignmentFeedback({ ...settings,
      now: () => now, reducedMotion: () => false, vibrate: () => false,
      setTimer(callback) { const id = ++nextId; timers.set(id, callback); return id; },
      clearTimer(id) { timers.delete(id); },
    }),
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    boardVisible: () => ['play', 'ai-play'].includes(context.mode),
    displayedView: () => getView(game, displayedFaceIndex(game)),
    updatePlayUI() {}, cancelBoardMotion() {},
    animateBoard(container, before, after, settings) {
      animations.push({ before, after, ...settings });
      // Exercise the real app's visible-motion audio callbacks. Timing and
      // cancellation of the actual animation are covered by motion.test.js.
      if (settings.events.length) { settings.onSlide(); settings.onDrop(); }
    },
    persist(meta) { saves.push(meta); return Promise.resolve(); },
    cancelAITurn() { context.aiGeneration++; },
    landscape: () => false, renderPlay() {},
    renderAIReady(message) { failures.push(message); },
    ai: { choose: async () => options.move ?? { wheel: 1, localDelta: 50 } },
    waitForAI: async () => true,
    waitAIFrame: async elapsed => { now += Math.max(16, elapsed); return true; },
    saveAIMovement: async () => {},
    finishTurn: async () => { turnsFinished++; context.mode = 'transition'; },
  });
  vm.runInContext(routing, context, { filename: 'app-audio-routing.js' });
  const api = vm.runInContext('({applyRotations, applyRotation, flushWheelGesture, finishSurfacePress, stopMotion, runAITurn})', context);
  const point = (wheel, degrees) => {
    const center = wheelCenter(wheel, game.active);
    const radians = degrees * Math.PI / 180;
    return { clientX: center.x + center.radius * .7 * Math.cos(radians),
      clientY: center.y + center.radius * .7 * Math.sin(radians) };
  };
  const event = (wheel, degrees, extras = {}) => ({
    ...point(wheel, degrees), pointerId: 7, button: 0, isPrimary: true, isTrusted: false,
    target: { closest: () => null }, preventDefault() {}, ...extras,
  });
  return { game, context, api, sounds, animations, saves, failures, frames,
    count: name => sounds.filter(item => item.name === name).length,
    down(wheel = 1, degrees = 0) { appListeners.get('pointerdown')(event(wheel, degrees)); },
    move(wheel, degrees, coalesced) {
      appListeners.get('pointermove')(event(wheel, degrees, coalesced ? {
        getCoalescedEvents: () => coalesced.map(angle => event(wheel, angle)),
      } : {}));
    },
    up(wheel = 1, degrees = 50) { documentListeners.get('pointerup')(event(wheel, degrees)); },
    frame(elapsed = 200) {
      now += elapsed;
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(now); }
    },
    finished: () => turnsFinished,
  };
}

for (const face of [0, 1]) {
  test(`app face ${face}: the real pointer handler creates its tracker and a common opening clicks once`, () => {
    const h = harness(passageGame(face));
    const before = getView(h.game, face).angles[0];
    h.down();
    assert.ok(h.context.surfacePress?.passageFeedback, 'pointerdown creates the geometry tracker used by the gesture');
    h.move(1, 50); h.frame(); h.up();
    assert.ok(angularDistance(getView(h.game, face).angles[0], before + 50) < 1e-8,
      'a clockwise finger gesture remains clockwise on the displayed face');
    assert.equal(h.count('detent'), 1);
    assert.equal(h.count('turn'), 0, 'the distinct alignment cue replaces this frame’s soft rotation');
    assert.equal(h.count('drop'), 0, 'an empty but genuinely open passage still clicks without inventing a fall');
  });

  test(`app face ${face}: a source magnet with a closed receiving wheel produces only soft rotation`, () => {
    const h = harness(passageGame(face, false));
    h.down(); h.move(1, 50); h.frame(); h.up();
    assert.equal(h.count('detent'), 0, 'aligning one mouth alone never produces a passage click');
    assert.equal(h.count('turn'), 1);
  });

  test(`app face ${face}: a narrow visible overlap stays soft until the common passage admits a token`, () => {
    const h = harness(passageGame(face));
    h.down(); h.move(1, 10); h.frame();
    assert.equal(h.count('detent'), 0, 'rim overlap below the 20-unit passage width is not an alignment cue');
    assert.equal(h.count('turn'), 1);
    h.move(1, 20); h.frame(); h.up(1, 20);
    assert.equal(h.count('detent'), 1);
  });

  test(`app face ${face}: coalesced samples cross the opening without duplicate frame cues`, () => {
    const h = harness(passageGame(face));
    h.down(); h.move(1, 50, [10, 20, 30, 40, 50]); h.frame(); h.up();
    assert.equal(h.count('detent'), 1);
    assert.equal(h.saves.filter(item => item.type === 'rotation').length, 1);
  });

  test(`app face ${face}: jitter and a new touch inside an open passage do not replay its click`, () => {
    const h = harness(passageGame(face));
    h.down(); h.move(1, 20); h.frame();
    assert.equal(h.count('detent'), 1);
    for (const degrees of [20.05, 19.95, 20.02, 20]) { h.move(1, degrees); h.frame(); }
    h.up(1, 20);
    h.down(1, 20); h.move(1, 23); h.frame(); h.up(1, 23);
    assert.equal(h.count('detent'), 1, 'the new gesture starts latched inside the existing common opening');
  });

  test(`app face ${face}: exiting then crossing back re-arms the passage cue`, () => {
    const h = harness(passageGame(face));
    h.down(); h.move(1, 50); h.frame(); h.move(1, 0); h.frame(); h.up(1, 0);
    assert.equal(h.count('detent'), 2);
  });

  test(`app face ${face}: opponent collection remains anonymous and audible during rotation`, () => {
    const game = emptyGame(face);
    const opponent = 1 - face;
    game.faces[opponent].slots[4][0] = 1;
    game.angles[4] = physicalAngleFor(opponent, 5, 0, OUTPUT_GATE + 25, game.geometryVersion);
    const h = harness(game);
    h.down(5); h.move(5, 50); h.frame(); h.up(5, 50);
    assert.deepEqual(game.faces[opponent].exited, [1]);
    assert.equal(h.count('drop'), 1, 'the hidden collection keeps its generic fall sound');
    assert.ok(h.animations.every(animation => animation.events.length === 0),
      'hidden transfer details never enter the displayed motion callbacks');
  });
}

test('app: masking before a queued gesture cancels movement, click and late frame callbacks', () => {
  const h = harness(passageGame(0));
  const before = [...h.game.angles];
  h.down(); h.move(1, 50);
  const stale = [...h.frames.values()];
  h.api.stopMotion(); h.context.mode = 'handoff';
  for (const callback of stale) callback(500);
  assert.deepEqual(h.game.angles, before);
  assert.equal(h.count('detent'), 0);
  assert.equal(h.count('turn'), 0);
  assert.equal(h.count('drop'), 0);
  assert.equal(h.count('stop'), 1);
  assert.equal(h.context.surfacePress, null);
});

test('app: rejected engine movement cannot advance a tracker or create an audio cue', () => {
  const h = harness(passageGame(0));
  h.context.selected = 1;
  h.game.engaged = 2;
  const tracker = createPassageFeedbackTracker(getView(h.game, 0), 1);
  const before = tracker.angle;
  assert.equal(h.api.applyRotations([50], true, null, tracker), false);
  assert.equal(tracker.angle, before);
  assert.equal(h.count('detent'), 0);
  assert.equal(h.count('turn'), 0);
});

test('app: keyboard rotation retains its soft sound without treating a mechanical stop as two open mouths', () => {
  const h = harness(passageGame(0, false, -4));
  h.context.selected = 1;
  assert.equal(h.api.applyRotation(ROTATION_STEP), true);
  assert.equal(h.count('turn'), 1);
  assert.equal(h.count('detent'), 0);
});

test('app: visible token motion keeps its separate slide and fall callbacks alongside the passage click', () => {
  const game = passageGame(0);
  game.faces[0].slots[0][0] = 1;
  const h = harness(game);
  h.down(); h.move(1, 50); h.frame(); h.up();
  assert.equal(h.count('detent'), 1);
  assert.equal(h.count('slide'), 1);
  assert.equal(h.count('drop'), 1);
  assert.ok(h.animations.some(animation => animation.events.some(event => event.token === 1)));
});

for (const face of [0, 1]) {
  test(`app AI face ${face}: the real AI loop keeps rotation sound without playing human alignment cues`, async () => {
    const game = passageGame(face);
    game.players.forEach(player => { player.controller = 'ai'; });
    const h = harness(game, { mode: 'ai-play' });
    await h.api.runAITurn();
    assert.deepEqual(h.failures, []);
    assert.equal(h.finished(), 1);
    assert.ok(h.count('turn') > 0);
    assert.equal(h.count('detent'), 0);
  });

  test(`app mixed AI face ${face}: the displayed human face determines which falls remain anonymous`, async () => {
    const game = emptyGame(face);
    const human = 1 - face;
    game.players[face].controller = 'ai';
    game.players[human].controller = 'human';
    game.faces[face].slots[4][0] = 1;
    game.angles[4] = physicalAngleFor(face, 5, 0, OUTPUT_GATE + 25, game.geometryVersion);
    assert.equal(displayedFaceIndex(game), human);
    const h = harness(game, { mode: 'ai-play', move: { wheel: 5, localDelta: -50 } });
    await h.api.runAITurn();
    assert.deepEqual(h.failures, []);
    assert.equal(h.finished(), 1);
    assert.deepEqual(game.faces[face].exited, [1]);
    assert.equal(h.count('drop'), 1, 'an AI collection remains audible from the fixed human view');
    assert.ok(h.count('turn') > 0);
    assert.equal(h.count('detent'), 0);
    assert.ok(h.animations.every(animation => animation.after.faceIndex === human && animation.events.length === 0),
      'only the human face is animated, without any AI transfer details');
  });
}

test('app AI Full: wheel and opponent fall routing stay silent', async () => {
  const game = emptyGame(0);
  game.players.forEach(player => { player.controller = 'ai'; });
  game.faces[1].slots[4][0] = 1;
  game.angles[4] = physicalAngleFor(1, 5, 0, OUTPUT_GATE + 25, game.geometryVersion);
  const h = harness(game, { mode: 'ai-play', aiSpeed: 'full', move: { wheel: 5, localDelta: 50 } });
  await h.api.runAITurn();
  assert.deepEqual(h.failures, []);
  assert.equal(h.finished(), 1);
  assert.deepEqual(game.faces[1].exited, [1]);
  assert.equal(h.count('turn'), 0);
  assert.equal(h.count('drop'), 0);
  assert.equal(h.count('detent'), 0);
});
