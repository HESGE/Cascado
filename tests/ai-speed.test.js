import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_SPEEDS, normalizeAISpeed, aiSpeedProfile, createAIWait, advanceAIWait,
} from '../src/ai-speed.js';

test('AI speeds expose stable French labels and finite serializable preferences', () => {
  assert.deepEqual(AI_SPEEDS, [
    { id: 'slow', label: 'Lent', rate: .5, full: false },
    { id: 'normal', label: 'Normal', rate: 1, full: false },
    { id: 'fast', label: 'Rapide', rate: 2, full: false },
    { id: 'full', label: 'Full', rate: 0, full: true },
  ]);
  assert.ok(Object.isFrozen(AI_SPEEDS));
  assert.ok(AI_SPEEDS.every(Object.isFrozen));
  assert.deepEqual(JSON.parse(JSON.stringify(AI_SPEEDS)), AI_SPEEDS);
  for (const profile of AI_SPEEDS) {
    assert.equal(normalizeAISpeed(profile.id), profile.id);
    assert.equal(aiSpeedProfile(profile.id), profile);
  }
});

test('missing, malformed and old speed preferences fall back to Normal', () => {
  for (const value of [undefined, null, '', 'Slow', 'lent', 'instant', 0, 2, NaN, Infinity, {}, ['fast']]) {
    assert.equal(normalizeAISpeed(value), 'normal');
    assert.equal(aiSpeedProfile(value), AI_SPEEDS[1]);
  }
});

test('zero, negative and invalid waits are already complete', () => {
  for (const duration of [0, -0, -1, NaN, Infinity, -Infinity, undefined, null, '900']) {
    const state = createAIWait(duration);
    assert.deepEqual(state, { remainingMs: 0, done: true });
    assert.equal(advanceAIWait(state, 16), true);
    assert.deepEqual(state, { remainingMs: 0, done: true });
  }
  assert.equal(advanceAIWait(null, 16), true);
});

test('Lent, Normal and Rapide consume the same delay in proportion to their speed', () => {
  for (const [speed, expectedFrames] of [['slow', 50], ['normal', 25], ['fast', 13]]) {
    const state = createAIWait(1000);
    let frames = 0;
    while (!state.done) {
      const done = advanceAIWait(state, 40, speed);
      assert.equal(done, state.done);
      assert.ok(++frames <= expectedFrames);
    }
    assert.equal(frames, expectedFrames);
    assert.equal(state.remainingMs, 0);
  }
});

test('changing speed during a wait consumes only the new frame and preserves prior progress', () => {
  const state = createAIWait(1000);
  advanceAIWait(state, 40, 'normal');
  assert.equal(state.remainingMs, 960);
  advanceAIWait(state, 40, 'fast');
  assert.equal(state.remainingMs, 880);
  advanceAIWait(state, 40, 'slow');
  assert.equal(state.remainingMs, 860);
  advanceAIWait(state, 40, 'not-a-speed');
  assert.equal(state.remainingMs, 820);
  assert.equal(state.done, false);
});

test('background gaps are capped before speed multiplication and never caught up later', () => {
  for (const profile of AI_SPEEDS.filter(profile => !profile.full)) {
    const state = createAIWait(1000);
    const reference = createAIWait(1000);
    advanceAIWait(state, 60000, profile.id);
    advanceAIWait(reference, 40, profile.id);
    assert.deepEqual(state, reference);
    assert.equal(state.remainingMs, 1000 - 40 * profile.rate);
    advanceAIWait(state, 16, profile.id);
    advanceAIWait(reference, 16, profile.id);
    assert.deepEqual(state, reference);
  }
});

test('Full skips a pending wait immediately, and later changes cannot restart it', () => {
  const state = createAIWait(1000);
  advanceAIWait(state, 40, 'slow');
  assert.equal(advanceAIWait(state, 0, 'full'), true);
  assert.deepEqual(state, { remainingMs: 0, done: true });
  for (const speed of ['slow', 'normal', 'fast', 'full']) {
    assert.equal(advanceAIWait(state, 40, speed), true);
    assert.deepEqual(state, { remainingMs: 0, done: true });
  }
});

test('invalid or paused frames do not consume a wait', () => {
  const state = createAIWait(1000);
  for (const elapsed of [0, -1, NaN, Infinity, -Infinity, undefined, null, '16']) {
    const before = structuredClone(state);
    assert.equal(advanceAIWait(state, elapsed, 'fast'), false);
    assert.deepEqual(state, before);
  }
});

test('fractional frame residues finish exactly without an extra frame', () => {
  for (const speed of ['slow', 'normal', 'fast']) {
    const rate = aiSpeedProfile(speed).rate;
    const state = createAIWait(1000);
    const frameMs = 1000 / 120;
    const frames = 120 / rate;
    for (let index = 0; index < frames; index++) advanceAIWait(state, frameMs, speed);
    assert.deepEqual(state, { remainingMs: 0, done: true });
  }
});
