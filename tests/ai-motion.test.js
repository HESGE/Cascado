import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_THINK_MS, AI_SELECT_MS, AI_SPEED_DEG_PER_SECOND, AI_TOKEN_DURATION_SCALE,
  AI_SETTLE_MS, AI_MIN_ROTATION_MS, AI_MAX_FRAME_MS,
  createAIRotation, advanceAIRotation, completeAIRotation,
} from '../src/ai-motion.js';
import { chooseAIMove } from '../src/ai.js';
import { createGame, getView, rotate, endTurn } from '../src/engine.js';
import { OUTPUT_GATE, physicalAngleFor, angularDistance } from '../src/geometry.js';

function finish(state, frameMs = 1000 / 60, consume = () => {}) {
  let total = 0;
  let steps = 0;
  while (!state.done) {
    const increment = advanceAIRotation(state, frameMs);
    consume(increment);
    total += increment;
    assert.ok(++steps < 20000, 'a finite command must finish');
  }
  return { total, steps };
}

function assertPosition(actual, expected) {
  assert.deepEqual(actual.faces, expected.faces);
  for (let index = 0; index < expected.angles.length; index++) {
    assert.ok(angularDistance(actual.angles[index], expected.angles[index]) < 1e-8);
  }
  assert.equal(actual.active, expected.active);
  assert.equal(actual.engaged, expected.engaged);
  assert.equal(actual.lastWheel, expected.lastWheel);
  assert.equal(actual.turn, expected.turn);
  // A batch may be emitted on a different animation frame. The actual ordered
  // transfers and first adjudicated result must stay identical.
  assert.deepEqual(actual.events.flatMap(event => event.transfers), expected.events.flatMap(event => event.transfers));
  assert.equal(actual.verdict?.winner, expected.verdict?.winner);
  assert.equal(actual.verdict?.reason, expected.verdict?.reason);
  if (expected.verdict) {
    assert.deepEqual(actual.verdict.snapshot.faces, expected.verdict.snapshot.faces);
    expected.verdict.snapshot.angles.forEach((angle, index) => {
      assert.ok(angularDistance(actual.verdict.snapshot.angles[index], angle) < 1e-8);
    });
  }
}

test('readable turn pacing has stable shared values', () => {
  assert.equal(AI_THINK_MS, 900);
  assert.equal(AI_SELECT_MS, 500);
  assert.equal(AI_SPEED_DEG_PER_SECOND, 90);
  assert.equal(AI_TOKEN_DURATION_SCALE, 1.5);
  assert.equal(AI_SETTLE_MS, 1000);
  assert.equal(AI_MIN_ROTATION_MS, 700);
  assert.equal(AI_MAX_FRAME_MS, 40);
});

test('invalid and zero commands finish immediately without motion', () => {
  for (const command of [0, -0, NaN, Infinity, -Infinity, undefined, null, '90', Number.MAX_VALUE]) {
    const state = createAIRotation(command);
    assert.equal(state.done, true);
    assert.equal(state.localDelta, 0);
    assert.equal(state.appliedDelta, 0);
    const before = structuredClone(state);
    assert.equal(advanceAIRotation(state, 16), 0);
    assert.deepEqual(state, before);
  }
});

test('short AI movements last at least 700 ms instead of appearing instantaneous', () => {
  for (const delta of [.05, -.5, 6]) {
    const state = createAIRotation(delta);
    assert.equal(state.durationMs, 700);
    advanceAIRotation(state, 40);
    assert.ok(Math.abs(state.appliedDelta) > 0 && Math.abs(state.appliedDelta) < Math.abs(delta));
    assert.equal(state.done, false);
    const { steps } = finish(state, 40);
    assert.equal(steps, 17);
    assert.equal(state.appliedDelta, delta);
    assert.equal(state.elapsedMs, 700);
  }
});

test('smooth movement starts and finishes gently at the exact requested angle', () => {
  const state = createAIRotation(90);
  assert.equal(state.durationMs, 1000);
  const first = advanceAIRotation(state, 20);
  for (let frame = 0; frame < 23; frame++) advanceAIRotation(state, 20);
  const middle = advanceAIRotation(state, 20);
  assert.ok(middle > first * 10);
  assert.equal(state.appliedDelta, 45);
  for (let frame = 0; frame < 24; frame++) advanceAIRotation(state, 20);
  const last = advanceAIRotation(state, 20);
  assert.ok(Math.abs(last - first) < 1e-12);
  assert.equal(state.appliedDelta, 90);
  assert.equal(state.done, true);
});

test('zero, negative and non-finite frame delays neither move nor alter a timeline', () => {
  const state = createAIRotation(90);
  advanceAIRotation(state, 16);
  const before = structuredClone(state);
  for (const elapsed of [0, -1, NaN, Infinity, -Infinity, undefined, null, '16']) {
    assert.equal(advanceAIRotation(state, elapsed), 0);
    assert.deepEqual(state, before);
  }
  assert.equal(advanceAIRotation(null, 16), 0);
});

test('a background-tab gap consumes only 40 ms and never catches up later', () => {
  const state = createAIRotation(180);
  const reference = createAIRotation(180);
  assert.equal(advanceAIRotation(state, 60000), advanceAIRotation(reference, 40));
  assert.equal(state.elapsedMs, 40);
  assert.equal(state.done, false);
  assert.equal(advanceAIRotation(state, 16), advanceAIRotation(reference, 16));
  assert.equal(state.elapsedMs, 56);
  assert.deepEqual(state, reference);
});

test('rotation rate scales active time after capping a background frame', () => {
  for (const rate of [.5, 1, 2]) {
    const state = createAIRotation(180);
    const reference = createAIRotation(180);
    assert.equal(advanceAIRotation(state, 60000, rate), advanceAIRotation(reference, 40, rate));
    assert.equal(state.elapsedMs, 40 * rate);
    assert.equal(state.done, false);
    assert.equal(advanceAIRotation(state, 16, rate), advanceAIRotation(reference, 16, rate));
    assert.deepEqual(state, reference);
  }
});

test('a live rotation speed change keeps all elapsed motion without restarting or jumping', () => {
  const state = createAIRotation(90);
  advanceAIRotation(state, 40, 1);
  assert.equal(state.elapsedMs, 40);
  const before = state.appliedDelta;
  const increment = advanceAIRotation(state, 40, 2);
  assert.equal(state.elapsedMs, 120);
  assert.equal(state.appliedDelta, before + increment);
  const reference = createAIRotation(90);
  for (let frame = 0; frame < 3; frame++) advanceAIRotation(reference, 40);
  assert.deepEqual(state, reference);
  advanceAIRotation(state, 40, .5);
  assert.equal(state.elapsedMs, 140);
});

test('invalid rotation rates fall back to the normal speed', () => {
  for (const rate of [0, -1, NaN, Infinity, -Infinity, undefined, null, '2']) {
    const state = createAIRotation(90);
    const reference = createAIRotation(90);
    assert.equal(advanceAIRotation(state, 40, rate), advanceAIRotation(reference, 40));
    assert.deepEqual(state, reference);
  }
});

test('Full completes only the remaining signed rotation, including after progressive motion', () => {
  for (const delta of [-360, -.5, .5, 360]) {
    const state = createAIRotation(delta);
    const applied = advanceAIRotation(state, 40);
    const remainder = completeAIRotation(state);
    assert.equal(applied + remainder, delta);
    assert.equal(state.appliedDelta, delta);
    assert.equal(state.elapsedMs, state.durationMs);
    assert.equal(state.done, true);
    const before = structuredClone(state);
    assert.equal(completeAIRotation(state), 0);
    assert.equal(advanceAIRotation(state, 40, .5), 0);
    assert.deepEqual(state, before);
  }
  assert.equal(completeAIRotation(null), 0);
  assert.equal(completeAIRotation(createAIRotation(0)), 0);
});

for (const delta of [-360, -270, -.5, .5, 270, 360]) {
  test(`${delta}° retains its complete signed path at 30, 60 and 120 frames/s`, () => {
    for (const cadence of [30, 60, 120]) {
      const state = createAIRotation(delta);
      let previous = 0;
      const { total } = finish(state, 1000 / cadence, increment => {
        assert.ok(Math.sign(increment) === Math.sign(delta));
        assert.ok(Math.abs(state.appliedDelta) >= Math.abs(previous));
        assert.ok(Math.abs(state.appliedDelta) <= Math.abs(delta));
        previous = state.appliedDelta;
      });
      assert.ok(Math.abs(total - delta) < 1e-10);
      assert.equal(state.appliedDelta, delta);
      assert.equal(state.elapsedMs, state.durationMs);
      const before = structuredClone(state);
      for (let frame = 0; frame < 5; frame++) assert.equal(advanceAIRotation(state, 1000 / cadence), 0);
      assert.deepEqual(state, before, 'finished movement cannot drift');
    }
  });
}

for (const face of [0, 1]) {
  test(`face ${face}: changing speed then finishing in Full preserves the planned move and every fall`, () => {
    const expected = createGame(['A', 'B'], face);
    const actual = structuredClone(expected);
    for (let turn = 0; turn < 12 && !expected.verdict; turn++) {
      const move = chooseAIMove(getView(expected, expected.active), 'normal');
      assert.ok(move);
      const sign = expected.active === 0 ? 1 : -1;
      assert.equal(rotate(expected, move.wheel, move.localDelta * sign), true);
      const timeline = createAIRotation(move.localDelta);
      for (const rate of [1, .5, 2, .5, 1]) {
        const increment = advanceAIRotation(timeline, 40, rate);
        if (Math.abs(increment) >= 1e-12) assert.equal(rotate(actual, move.wheel, increment * sign), true);
      }
      const remainder = completeAIRotation(timeline);
      if (Math.abs(remainder) >= 1e-12) assert.equal(rotate(actual, move.wheel, remainder * sign), true);
      assertPosition(actual, expected);
      assert.equal(endTurn(expected), true);
      assert.equal(endTurn(actual), true);
    }
  });

  test(`face ${face}: progressive AI preparation produces the same real falls as the atomic planned move`, () => {
    const expected = createGame(['A', 'B'], face);
    const actual = structuredClone(expected);
    for (let turn = 0; turn < 12 && !expected.verdict; turn++) {
      const move = chooseAIMove(getView(expected, expected.active), 'normal');
      assert.ok(move);
      const sign = expected.active === 0 ? 1 : -1;
      assert.equal(rotate(expected, move.wheel, move.localDelta * sign), true);
      const timeline = createAIRotation(move.localDelta);
      finish(timeline, 1000 / 60, increment => {
        if (Math.abs(increment) >= 1e-12) assert.equal(rotate(actual, move.wheel, increment * sign), true);
      });
      assertPosition(actual, expected);
      assert.equal(endTurn(expected), true);
      assert.equal(endTurn(actual), true);
    }
  });

  for (const token of [2, 10]) {
    test(`face ${face}: a progressive long path preserves the first ${token === 10 ? 'winning' : 'out-of-order'} exit verdict`, () => {
      const expected = createGame(['A', 'B'], face);
      expected.faces.forEach(side => { side.queue = []; });
      expected.faces[face].exited = token === 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [];
      expected.faces[face].slots[4][2] = token;
      expected.angles[4] = physicalAngleFor(face, 5, 2, OUTPUT_GATE - 25);
      const actual = structuredClone(expected);
      const delta = 270;
      const sign = face === 0 ? 1 : -1;
      assert.equal(rotate(expected, 5, delta * sign), true);
      finish(createAIRotation(delta), 1000 / 30, increment => {
        if (Math.abs(increment) >= 1e-12) assert.equal(rotate(actual, 5, increment * sign), true);
      });
      assert.equal(expected.verdict?.reason, token === 10 ? 'complete' : 'order');
      assertPosition(actual, expected);
    });
  }
}
