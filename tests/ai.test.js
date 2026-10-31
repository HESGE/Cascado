import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_LEVELS, chooseAIMove } from '../src/ai.js';
import { createGame as createVersionedGame, getView, rotate, endTurn, allowedWheels } from '../src/engine.js';
import { WHEELS, OUTPUT_GATE, physicalAngleFor as versionedPhysicalAngleFor, gates, normalizeAngle,
  GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, wheelsFor, inputGates } from '../src/geometry.js';
import { tokenSeries, tokenNumber, tokenTotal, nextBySeries } from '../src/tokens.js';

// Retain the established five-token scenarios as a v1.4 regression suite.
const createGame = (players, starter, version = PREVIOUS_GEOMETRY_VERSION) => createVersionedGame(players, starter, version);
const physicalAngleFor = (...args) => versionedPhysicalAngleFor(...args, PREVIOUS_GEOMETRY_VERSION);

function emptyGame(face = 0) {
  const state = createGame(['A', 'B'], face);
  for (const side of state.faces) side.queue = [];
  return state;
}

function apply(state, move) {
  assert.ok(move, 'the AI must return a movement');
  assert.ok(allowedWheels(state).includes(move.wheel), 'the wheel obeys the live game rule');
  assert.ok(Number.isFinite(move.localDelta) && Math.abs(move.localDelta) > 0);
  assert.ok(Math.abs(move.localDelta) <= 360);
  assert.equal(rotate(state, move.wheel, move.localDelta * (state.active === 0 ? 1 : -1)), true);
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function seededRandom(initial) {
  let seed = initial;
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
}

test('the three offline levels have stable saved identifiers and French labels', () => {
  assert.deepEqual(AI_LEVELS, [
    { id: 'easy', label: 'Facile' }, { id: 'normal', label: 'Normal' }, { id: 'hard', label: 'Difficile' },
  ]);
  assert.ok(Object.isFrozen(AI_LEVELS) && AI_LEVELS.every(Object.isFrozen));
});

test('planning accepts a deeply frozen active projection without mutating it', () => {
  const view = freeze(getView(createGame(), 0));
  const before = JSON.stringify(view);
  for (const { id } of AI_LEVELS) assert.ok(chooseAIMove(view, id, { random: () => 0 }));
  assert.equal(JSON.stringify(view), before);
});

test('no legal wheel returns null and invalid level falls back to Normal', () => {
  const view = getView(createGame(), 0);
  assert.equal(chooseAIMove({ ...view, allowedWheels: [] }), null);
  assert.equal(chooseAIMove(null), null);
  assert.deepEqual(chooseAIMove(view, 'unknown'), chooseAIMove(view, 'normal'));
});

test('an engaged turn remains on its one selected wheel', () => {
  const state = createGame();
  rotate(state, 3, 1);
  for (const { id } of AI_LEVELS) {
    const move = chooseAIMove(getView(state, 0), id, { random: () => 0 });
    assert.equal(move.wheel, 3);
    apply(structuredClone(state), move);
  }
});

test('last-wheel prohibition is respected even when the forbidden wheel holds the next token', () => {
  const state = emptyGame();
  state.faces[0].slots[1][0] = 1;
  state.lastWheel = 2;
  for (const { id } of AI_LEVELS) {
    const move = chooseAIMove(getView(state, 0), id, { random: () => 0 });
    assert.notEqual(move.wheel, 2);
    apply(structuredClone(state), move);
  }
});

for (const face of [0, 1]) {
  test(`face ${face}: the last-token exception permits wheel five and mirrors local rotation correctly`, () => {
    const state = emptyGame(face);
    state.faces[face].exited = [1, 2, 3, 4];
    state.faces[face].slots[4][2] = 5;
    state.lastWheel = 5;
    state.angles[4] = physicalAngleFor(face, 5, 2, OUTPUT_GATE - 25);
    for (const { id } of AI_LEVELS) {
      const copy = structuredClone(state);
      const move = chooseAIMove(getView(copy, face), id, { random: () => 0 });
      assert.equal(move.wheel, 5);
      assert.ok(Math.abs(move.localDelta - 25) < 1e-8);
      apply(copy, move);
      assert.equal(copy.verdict.reason, 'complete');
      assert.equal(copy.verdict.winner, face);
      assert.deepEqual(copy.faces[face].exited, [1, 2, 3, 4, 5]);
    }
  });

  test(`face ${face}: a later token on the bottom wheel is not deliberately released before number one`, () => {
    const state = emptyGame(face);
    state.faces[face].queue = [1, 3, 4, 5];
    state.faces[face].slots[4][0] = 2;
    state.angles[4] = physicalAngleFor(face, 5, 0, OUTPUT_GATE - 25);
    for (const { id } of AI_LEVELS) {
      const copy = structuredClone(state);
      apply(copy, chooseAIMove(getView(copy, face), id, { random: () => 0.99 }));
      assert.equal(copy.verdict, null);
      assert.deepEqual(copy.faces[face].exited, []);
      assert.equal(copy.faces[face].slots[4][0], 2);
    }
  });

  test(`face ${face}: a narrow twelve-degree mouth is prepared with a legal move, rather than treating it as a fall`, () => {
    const state = emptyGame(face);
    const gate = gates(face)[0];
    state.faces[face].slots[0][0] = 1;
    state.angles[0] = physicalAngleFor(face, 1, 0, gate.sourceAngle + 12);
    state.angles[1] = physicalAngleFor(face, 2, 0, gate.targetAngle);
    const before = structuredClone(state.faces[face]);
    const move = chooseAIMove(getView(state, face), 'hard');
    assert.deepEqual(state.faces[face], before, 'planning alone must not move any token');
    apply(state, move);
    assert.equal(state.faces[face].slots[0][0], null);
    assert.ok(state.faces[face].slots[1].includes(1));
    assert.equal(state.verdict, null);
  });
}

test('a hidden opponent board or verdict cannot influence an AI decision', () => {
  const ordinary = createGame();
  const hidden = structuredClone(ordinary);
  hidden.faces[1].queue = [];
  hidden.faces[1].exited = [5, 3, 4];
  hidden.faces[1].slots[4][0] = 2;
  hidden.verdict = { winner: 0, reason: 'order', snapshot: { confidential: true } };
  hidden.events = [{ confidential: true }];
  assert.deepEqual(getView(ordinary, 0), getView(hidden, 0));
  for (const { id } of AI_LEVELS) {
    assert.deepEqual(chooseAIMove(getView(ordinary, 0), id, { random: () => 0.8 }),
      chooseAIMove(getView(hidden, 0), id, { random: () => 0.8 }));
  }
});

test('five own visible exits still produce a normal legal turn instead of using a hidden result', () => {
  const state = emptyGame();
  state.faces[0].exited = [1, 2, 3, 4, 5];
  for (const { id } of AI_LEVELS) apply(structuredClone(state), chooseAIMove(getView(state, 0), id));
});

test('easy randomness is injectable and sometimes selects a longer safe rotation', () => {
  const view = getView(createGame(), 0);
  const careful = chooseAIMove(view, 'easy', { random: () => 0 });
  const imprecise = chooseAIMove(view, 'easy', { random: () => 0.99 });
  assert.ok(Math.abs(imprecise.localDelta) > Math.abs(careful.localDelta));
  assert.deepEqual(chooseAIMove(view, 'easy', { random: seededRandom(42) }),
    chooseAIMove(view, 'easy', { random: seededRandom(42) }));
});

for (const { id: level } of AI_LEVELS) {
  for (const face of [0, 1]) {
    test(`${level}, face ${face}: own queue can be completed safely from neutral without a prepared solution`, () => {
      const state = emptyGame(face);
      state.faces[face].queue = [1, 2, 3, 4, 5];
      const random = seededRandom(321);
      let turns = 0;
      while (!state.verdict && turns < 80) {
        apply(state, chooseAIMove(getView(state, face), level, { random }));
        assert.equal(endTurn(state), true);
        // This isolated own-board exercise supplies no opposing movement. The
        // coupled, alternating, legal two-player case is tested below.
        state.active = face;
        state.lastWheel = null;
        turns++;
      }
      assert.equal(state.verdict?.reason, 'complete');
      assert.equal(state.verdict.winner, face);
      assert.deepEqual(state.faces[face].exited, [1, 2, 3, 4, 5]);
    });
  }
}

for (const { id: first } of AI_LEVELS) {
  for (const { id: second } of AI_LEVELS) {
    test(`${first} versus ${second}: both starting faces reach an ordered result through real alternating turns`, () => {
      for (const starter of [0, 1]) {
        const state = createGame(['A', 'B'], starter);
        const random = seededRandom(321);
        let turns = 0;
        while (!state.verdict && turns < 120) {
          const level = [first, second][state.active];
          apply(state, chooseAIMove(getView(state, state.active), level, { random }));
          assert.equal(endTurn(state), true);
          for (const face of state.faces) {
            const tokens = [...face.queue, ...face.slots.flat().filter(token => token !== null), ...face.exited];
            assert.deepEqual(tokens.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
            assert.deepEqual(face.exited, Array.from({ length: face.exited.length }, (_, index) => index + 1));
          }
          turns++;
        }
        assert.equal(state.verdict?.reason, 'complete', `starter ${starter}: no endless preparation loop`);
      }
    });
  }
}

test('hard planning has a bounded practical cost on a busy visible board', () => {
  const state = emptyGame();
  for (const [token, wheel, notch] of [[1, 2, 0], [2, 3, 1], [3, 4, 2], [4, 5, 3], [5, 1, 0]]) {
    state.faces[0].slots[wheel - 1][notch] = token;
  }
  state.angles = [218.5, 149, 54, 317, 205];
  const started = performance.now();
  const move = chooseAIMove(getView(state, 0), 'hard');
  const elapsed = performance.now() - started;
  apply(state, move);
  assert.ok(elapsed < 1500, `bounded depth/beam unexpectedly took ${elapsed} ms`);
  assert.equal(state.faces[0].slots.flat().filter(token => token !== null).length + state.faces[0].exited.length, 5);
  assert.equal(WHEELS.length, 5);
});

test('AI keeps legacy projections compatible and rejects unknown geometry', () => {
  const view = getView(createGame(['A', 'B'], 1, LEGACY_GEOMETRY_VERSION), 1);
  const oldPayload = { ...view };
  delete oldPayload.geometryVersion;
  assert.deepEqual(chooseAIMove(oldPayload, 'hard'), chooseAIMove(view, 'hard'));
  for (const geometryVersion of ['unknown', 'ddc-v1.2', null, {}, 4]) {
    assert.equal(chooseAIMove({ ...view, geometryVersion }, 'hard'), null);
  }
});

for (const geometryVersion of [LEGACY_GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION]) {
  test(`${geometryVersion}: floating noise at a half-turn cannot reverse a mirrored hard decision`, () => {
    const a = { geometryVersion, faceIndex: 0,
      angles: [240.56151032532853, 180.56151032532853, 14.145795494102913, 65.71853990448903, 263.71853990448903],
      queue: [], slots: [[5], [null, null, null], [null, null], [null, null, null, null], [null, null, null, null, null]],
      exited: [1, 2, 3, 4], next: 5, engaged: null, lastWheel: 2, allowedWheels: [1, 3, 4, 5] };
    const b = { ...a, faceIndex: 1, angles: a.angles.map(angle => normalizeAngle(180 - angle)) };
    const first = chooseAIMove(a, 'hard');
    const reflected = chooseAIMove(b, 'hard');
    assert.equal(first.wheel, 1);
    assert.equal(reflected.wheel, first.wheel);
    assert.ok(Math.abs(first.localDelta + 180) < 1e-6);
    assert.ok(Math.abs(first.localDelta + reflected.localDelta) < 1e-6);
  });
}

test('the v1.4 hard planner keeps its complete face-exchange invariance, including notch relabeling', () => {
  const game = emptyGame(0);
  game.angles = [138.7, 256.2, 19.9, 87.3, 201.5];
  game.faces[0].queue = [5];
  game.faces[0].slots[1][1] = 1;
  game.faces[0].slots[2][0] = 2;
  game.faces[0].slots[3][3] = 3;
  game.faces[0].slots[4][2] = 4;
  game.lastWheel = 3;
  const paired = structuredClone(game);
  paired.active = 1;
  paired.angles = game.angles.map((angle, index) => normalizeAngle(angle + wheelsFor(PREVIOUS_GEOMETRY_VERSION)[index].delta));
  paired.faces[1] = structuredClone(game.faces[0]);
  paired.faces[1].slots = game.faces[0].slots.map(slots => slots.map((_, index) => slots[(index + 1) % slots.length]));
  const first = chooseAIMove(getView(game, 0), 'hard');
  const second = chooseAIMove(getView(paired, 1), 'hard');
  assert.equal(first.wheel, second.wheel);
  assert.ok(Math.abs(first.localDelta + second.localDelta) < 1e-6);
});

for (const face of [0, 1]) {
  for (const { id: level } of AI_LEVELS) {
    test(`v1.5 ${level}, face ${face}: ten tokens finish with independent ordered series`, () => {
      const game = createVersionedGame(['A', 'B'], face);
      game.faces[1 - face].queue = [];
      const random = seededRandom(321);
      let turns = 0;
      while (!game.verdict && turns < 160) {
        apply(game, chooseAIMove(getView(game, face), level, { random }));
        const own = game.faces[face];
        const ids = [...own.queue, ...own.exited, ...own.slots.flat().filter(token => token !== null)].sort((a, b) => a - b);
        assert.deepEqual(ids, Array.from({ length: 10 }, (_, index) => index + 1));
        for (const lane of [0, 1]) {
          const numbers = own.exited.filter(token => tokenSeries(token) === lane).map(tokenNumber);
          assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, index) => index + 1));
        }
        if (own.exited.length < 10) assert.notEqual(game.verdict?.reason, 'complete');
        endTurn(game); game.active = face; game.lastWheel = null;
        turns++;
      }
      assert.equal(game.geometryVersion, GEOMETRY_VERSION);
      assert.equal(game.verdict?.reason, 'complete', `planner stalled after ${turns} turns`);
      assert.equal(game.verdict.winner, face);
      assert.equal(game.faces[face].exited.length, tokenTotal(game.geometryVersion));
      assert.deepEqual(nextBySeries(game.faces[face], game.geometryVersion), [6, 6]);
    });
  }

  for (const lane of [0, 1]) {
    test(`v1.5 face ${face}: each queue can load through its own entrance ${lane}`, () => {
      const game = createVersionedGame(['A', 'B'], face);
      game.faces.forEach(side => { side.queue = []; });
      game.faces[face].queue = Array.from({ length: 5 }, (_, index) => lane * 5 + index + 1);
      game.engaged = 1;
      const before = getView(game, face);
      for (const { id: level } of AI_LEVELS) {
        const copy = structuredClone(game);
        const move = chooseAIMove(before, level, { random: () => 0 });
        apply(copy, move);
        assert.equal(copy.faces[face].slots[0][0], lane * 5 + 1);
        assert.equal(copy.faces[face].queue.length, 4);
        const local = getView(copy, face).angles[0];
        assert.ok(Math.abs(normalizeAngle(local - inputGates(game.geometryVersion)[lane])) < 1e-7);
      }
    });
  }

  test(`v1.5 face ${face}: finishing five tokens does not discard the remaining series`, () => {
    const game = createVersionedGame(['A', 'B'], face);
    game.faces.forEach(side => { side.queue = []; });
    game.faces[face].exited = [1, 2, 3, 4, 5];
    game.faces[face].queue = [6, 7, 8, 9, 10];
    game.engaged = 1;
    for (const { id: level } of AI_LEVELS) {
      const copy = structuredClone(game);
      apply(copy, chooseAIMove(getView(copy, face), level, { random: () => 0 }));
      assert.equal(copy.verdict, null);
      assert.equal(copy.faces[face].slots[0][0], 6);
      assert.equal(copy.faces[face].exited.length, 5);
    }
  });
}
