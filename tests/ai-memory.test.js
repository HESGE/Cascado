import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createGame, getView } from '../src/engine.js';
import { configurePlayers } from '../src/players.js';
import { newSession } from '../src/flow.js';
import { configureGameSet } from '../src/starting-position.js';
import { getGameSet } from '../src/game-sets.js';
import { physicalAngleFor, OUTPUT_GATE, GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION } from '../src/geometry.js';
import { isSimulationSession, playSimulationTurn } from '../src/simulation.js';
import { AI_MEMORY_LIMIT, aiPositionKey, aiStagnation, defensiveMode, rememberedOptions, rememberAIPosition, isValidAIMemory } from '../src/ai-memory.js';

function fresh(set = 'reference', face = 0) {
  const game = configurePlayers(createGame(['A', 'B'], face, getGameSet(set, 5).geometryVersion),
    [{ controller: 'ai', level: 'hard' }, { controller: 'ai', level: 'hard' }]);
  configureGameSet(game, set, { mode: set === 'reference' ? 'original-v1' : 'miroir-50', seed: 1 });
  return game;
}

function unchangedObservations(length, face = 0, set = 'reference') {
  const initial = getView(fresh(set, face), face);
  return Array.from({ length }, (_, index) => ({
    ...structuredClone(initial),
    angles: initial.angles.map((angle, wheel) => wheel === 0
      ? (angle + (index % 2) * 6) % 360 : wheel === 1 ? (angle + index * 6) % 360 : angle),
    lastWheel: 1,
  }));
}

test('semantic stagnation recognises moving angles and repeated own wheel beside an opposing lock', () => {
  for (const face of [0, 1]) for (const set of ['reference', 'miroir-50']) {
    const observations = unchangedObservations(4, face, set);
    const current = observations.at(-1);
    const options = { recentPositions: observations.slice(0, -1).map(aiPositionKey) };
    const before = structuredClone({ current, options });
    Object.freeze(current.angles);
    Object.freeze(current.queue);
    current.slots.forEach(Object.freeze);
    Object.freeze(current.slots);
    Object.freeze(current.exited);
    Object.freeze(current);
    Object.freeze(options.recentPositions);
    Object.freeze(options);
    assert.deepEqual(aiStagnation(current, 'hard', options), { turns: 3, wheelCounts: [0, 3, 0, 0, 0] });
    assert.deepEqual(aiStagnation(current, 'expert', { recentPositions: observations.map(aiPositionKey) }),
      { turns: 3, wheelCounts: [0, 3, 0, 0, 0] });
    assert.deepEqual({ current, options }, before, 'the real current key is added only to a local copy');
  }
});

test('one or two preparatory turns are counted distinctly from a longer stall', () => {
  for (const turns of [0, 1, 2]) {
    const observations = unchangedObservations(turns + 1);
    assert.deepEqual(aiStagnation(observations.at(-1), 'hard', { recentPositions: observations.map(aiPositionKey) }),
      { turns, wheelCounts: [0, turns, 0, 0, 0] });
  }
});

test('a loaded, transferred or exited pion resets the semantic stagnation suffix', () => {
  const history = unchangedObservations(5);
  const before = history.map(aiPositionKey);
  const loaded = structuredClone(history.at(-1));
  loaded.queue = [2, 3, 4, 5];
  loaded.slots[0][0] = 1;
  const transferred = structuredClone(loaded);
  transferred.slots[0][0] = null;
  transferred.slots[1][0] = 1;
  const exited = structuredClone(transferred);
  exited.slots[1][0] = null;
  exited.exited = [1];
  for (const [current, previous] of [[loaded, before],
    [transferred, [...before, aiPositionKey(loaded)]],
    [exited, [...before, aiPositionKey(loaded), aiPositionKey(transferred)]]]) {
    assert.deepEqual(aiStagnation(current, 'hard', { recentPositions: previous }),
      { turns: 0, wheelCounts: [0, 0, 0, 0, 0] });
  }
  const preparation = structuredClone(transferred);
  preparation.angles[2] = (preparation.angles[2] + 6) % 360;
  assert.deepEqual(aiStagnation(preparation, 'hard', { recentPositions: [...before, aiPositionKey(transferred)] }),
    { turns: 1, wheelCounts: [0, 0, 1, 0, 0] });
});

test('shared wheel five and multiple unassigned angle changes do not invent an own action', () => {
  const previous = getView(fresh(), 0);
  const shared = structuredClone(previous);
  shared.lastWheel = 5;
  shared.angles[4] = (shared.angles[4] + 6) % 360;
  assert.deepEqual(aiStagnation(shared, 'hard', { recentPositions: [aiPositionKey(previous)] }),
    { turns: 1, wheelCounts: [0, 0, 0, 0, 0] });
  const ambiguous = structuredClone(shared);
  ambiguous.angles[1] = (ambiguous.angles[1] + 6) % 360;
  ambiguous.angles[2] = (ambiguous.angles[2] + 6) % 360;
  assert.deepEqual(aiStagnation(ambiguous, 'hard', { recentPositions: [aiPositionKey(previous)] }),
    { turns: 1, wheelCounts: [0, 0, 0, 0, 0] });
});

test('semantic history is private, bounded and inactive outside current ordered five-pion defense', () => {
  const observations = unchangedObservations(20);
  const current = observations.at(-1);
  const history = observations.map(aiPositionKey);
  const other = getView(fresh('reference', 1), 1);
  const options = { recentPositions: [aiPositionKey(other), 'secret', ...history], seed: 42, opponent: { private: true } };
  assert.deepEqual(aiStagnation(current, 'hard', options),
    { turns: AI_MEMORY_LIMIT - 1, wheelCounts: [0, AI_MEMORY_LIMIT - 1, 0, 0, 0] });
  const zero = { turns: 0, wheelCounts: [0, 0, 0, 0, 0] };
  for (const level of ['easy', 'normal']) assert.deepEqual(aiStagnation(current, level, options), zero);
  assert.deepEqual(aiStagnation({ ...current, tokenOrder: 'shuffled' }, 'hard', options), zero);
  assert.deepEqual(aiStagnation(getView(createGame(), 0), 'hard', options), zero);
  assert.deepEqual(aiStagnation(null, 'hard', options), zero);
  assert.deepEqual(aiStagnation({ geometryVersion: current.geometryVersion }, 'hard', options), zero);
  assert.deepEqual(aiStagnation(current, 'hard', { recentPositions: [aiPositionKey(other), 'private'] }), zero);
});

test('angle wrapping and rounded sub-microdegree noise do not create spurious wheel counts', () => {
  const previous = getView(fresh(), 0);
  previous.lastWheel = 1;
  previous.angles[1] = 359.9999999;
  const current = structuredClone(previous);
  current.angles[1] = 0;
  assert.deepEqual(aiStagnation(current, 'hard', { recentPositions: [aiPositionKey(previous)] }),
    { turns: 1, wheelCounts: [0, 0, 0, 0, 0] });
});

test('the position key contains only the authorised face and rounds sub-microdegree noise', () => {
  const game = fresh();
  const view = getView(game, 0);
  const key = aiPositionKey(view);
  const hidden = structuredClone(game);
  hidden.faces[1].queue.reverse();
  hidden.faces[1].slots[4][0] = 5;
  hidden.verdict = { private: true };
  hidden.events = [{ secret: true }];
  assert.equal(aiPositionKey(getView(hidden, 0)), key);
  assert.equal(aiPositionKey({ ...view, angles: view.angles.map(angle => angle + 1e-8) }), key);
  assert.notEqual(aiPositionKey({ ...view, lastWheel: 2 }), key);
  assert.notEqual(aiPositionKey({ ...view, engaged: 2 }), key);
  assert.equal(JSON.parse(key).length, 8);
});

test('real own observations are deduplicated, bounded, serializable and isolated by face', () => {
  const game = fresh();
  const first = rememberAIPosition(game, 0, getView(game, 0), 'hard');
  const other = rememberAIPosition(game, 1, getView(game, 1), 'expert');
  assert.equal(first.recentPositions.length, 1);
  assert.equal(other.recentPositions.length, 1);
  const otherBefore = [...game.aiMemory[1]];
  rememberAIPosition(game, 0, getView(game, 0), 'hard');
  assert.equal(game.aiMemory[0].length, 1);
  for (let index = 0; index < 30; index++) {
    const view = getView(game, 0);
    view.angles[0] += index / 10;
    rememberAIPosition(game, 0, view, 'hard');
  }
  assert.equal(game.aiMemory[0].length, AI_MEMORY_LIMIT);
  assert.deepEqual(game.aiMemory[1], otherBefore);
  assert.equal(isValidAIMemory(JSON.parse(JSON.stringify(game))), true);
  first.recentPositions.push('mutated caller array');
  assert.equal(game.aiMemory[0].includes('mutated caller array'), false);
});

test('unsupported modes and lower levels retain the former model shape', () => {
  const cases = [
    [createGame(['A', 'B'], 0, GEOMETRY_VERSION), 'hard'],
    [createGame(['A', 'B'], 0, LEGACY_GEOMETRY_VERSION), 'expert'],
    [fresh(), 'easy'], [fresh(), 'normal'],
    [Object.assign(fresh(), { tokenStart: { mode: 'shuffled', seed: 1 } }), 'hard'],
  ];
  for (const [game, level] of cases) {
    const before = structuredClone(game);
    assert.equal(defensiveMode(getView(game, 0), level), false);
    assert.deepEqual(rememberAIPosition(game, 0, getView(game, 0), level), {});
    assert.deepEqual(game, before);
    assert.deepEqual(rememberedOptions(getView(game, 0), level, { recentPositions: ['private'] }), {});
  }
});

test('memory options discard hidden-face keys, arbitrary data and oversized histories', () => {
  const game = fresh();
  const own = getView(game, 0);
  const ownKey = aiPositionKey(own);
  const otherKey = aiPositionKey(getView(game, 1));
  const options = rememberedOptions(own, 'hard', {
    recentPositions: [otherKey, 'private', {}, 'x'.repeat(3000), ...Array(20).fill(ownKey)],
    opponent: { secret: true }, seed: 42,
  });
  assert.deepEqual(Object.keys(options), ['recentPositions']);
  assert.equal(options.recentPositions.length, AI_MEMORY_LIMIT);
  assert.ok(options.recentPositions.every(key => key === ownKey));
  assert.deepEqual(rememberedOptions(own, 'hard', { recentPositions: [otherKey, 'private', {}] }), { recentPositions: [] });
});

test('malformed memory is rejected for snapshots and repaired without exposing the other face', () => {
  const game = fresh();
  assert.equal(isValidAIMemory(game), true);
  const own = rememberAIPosition(game, 0, getView(game, 0), 'hard');
  game.aiMemory[1] = ['private data'];
  assert.equal(isValidAIMemory(game), false);
  const repaired = rememberAIPosition(game, 0, getView(game, 0), 'hard');
  assert.deepEqual(repaired, own);
  assert.deepEqual(game.aiMemory[1], []);
  assert.equal(isValidAIMemory(game), true);
  const state = newSession(game);
  assert.equal(isSimulationSession(state), true);
  for (const memory of [null, {}, [], [[], [], []], [Array(13).fill(own.recentPositions[0]), []], [[own.recentPositions[0]], [own.recentPositions[0]]]]) {
    const broken = structuredClone(state);
    broken.game.aiMemory = memory;
    assert.equal(isSimulationSession(broken), false);
  }
});

test('the worker independently sanitizes memory options before calling the planner', async () => {
  const source = await readFile(new URL('../src/ai-worker.js', import.meta.url), 'utf8');
  const own = getView(fresh(), 0);
  const key = aiPositionKey(own);
  const calls = [], messages = [];
  const context = vm.createContext({ rememberedOptions,
    chooseAIMove(view, level, options) { calls.push({ view, level, options }); return { wheel: 1, localDelta: 6 }; },
    postMessage: value => messages.push(value),
  });
  vm.runInContext(source.replace(/^import .*;\n/gm, ''), context);
  context.onmessage({ data: { requestId: 1, view: own, level: 'hard',
    options: { recentPositions: [key, 'private'], opponent: { secret: true } } } });
  assert.deepEqual(calls[0].options, { recentPositions: [key] });
  assert.equal(messages[0].requestId, 1);
});

test('headless planning remembers only the acting face and survives a saved terminal snapshot', () => {
  const game = fresh();
  const own = game.faces[0];
  own.queue = [];
  own.exited = [1, 2, 3, 4];
  own.slots[4][0] = 5;
  game.angles[4] = physicalAngleFor(0, 5, 0, OUTPUT_GATE - 25, game.geometryVersion);
  const expected = aiPositionKey(getView(game, 0));
  const state = newSession(game);
  const step = playSimulationTurn(state);
  assert.equal(step.status, 'result');
  assert.deepEqual(game.aiMemory, [[expected], []]);
  assert.equal(game.verdict.reason, 'complete');
  assert.equal(game.verdict.winner, 0);
  assert.equal(isSimulationSession(JSON.parse(JSON.stringify(state))), true);
});
