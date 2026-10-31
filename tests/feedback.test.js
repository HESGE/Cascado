import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlignmentFeedback } from '../src/feedback.js';

function rig(options = {}) {
  let time = 0;
  let next = 0;
  const timers = new Map();
  const changes = [];
  const vibrations = [];
  const feedback = createAlignmentFeedback({
    now: () => time,
    vibrate: duration => { vibrations.push(duration); return true; },
    onChange: wheel => changes.push(wheel),
    setTimer: (callback, delay) => { const id = ++next; timers.set(id, { callback, due: time + delay }); return id; },
    clearTimer: id => timers.delete(id),
    ...options,
  });
  return { feedback, changes, vibrations, timers,
    advance(value) {
      time += value;
      for (const [id, job] of [...timers]) if (job.due <= time) { timers.delete(id); job.callback(); }
    },
  };
}

test('alignment feedback: brief single vibration and halo expire without replay', () => {
  const r = rig();
  assert.equal(r.feedback.wheel, null);
  assert.deepEqual(r.vibrations, []);
  assert.equal(r.feedback.pulse(2), true);
  assert.equal(r.feedback.wheel, 2);
  assert.deepEqual(r.vibrations, [12]);
  r.advance(299);
  assert.equal(r.feedback.wheel, 2);
  r.advance(1);
  assert.equal(r.feedback.wheel, null);
  assert.deepEqual(r.changes, [2, null]);
  r.advance(10_000);
  assert.deepEqual(r.vibrations, [12]);
});

test('alignment feedback: closely crossed stops are throttled and never queued', () => {
  const r = rig();
  r.feedback.pulse(1);
  for (let i = 0; i < 10; i++) { r.advance(10); assert.equal(r.feedback.pulse(1), false); }
  assert.deepEqual(r.vibrations, [12]);
  r.advance(40);
  assert.equal(r.feedback.pulse(1), true);
  assert.equal(r.timers.size, 1);
  r.advance(300);
  assert.deepEqual(r.changes, [1, 1, null]);
  assert.deepEqual(r.vibrations, [12, 12]);
});

test('alignment feedback: masking cancels vibration, cue and even stale callbacks', () => {
  let allowed = true;
  const r = rig({ allowed: () => allowed });
  r.feedback.pulse(4);
  const stale = [...r.timers.values()][0].callback;
  allowed = false;
  r.feedback.stop();
  assert.equal(r.feedback.wheel, null);
  assert.equal(r.timers.size, 0);
  assert.deepEqual(r.vibrations, [12, 0]);
  assert.equal(r.feedback.pulse(4), false);
  stale();
  assert.deepEqual(r.changes, [4, null]);
  allowed = true;
  assert.equal(r.feedback.wheel, null);
  assert.equal(r.feedback.pulse(5), true);
  stale();
  assert.equal(r.feedback.wheel, 5);
});

test('alignment feedback: unavailable or rejected vibration preserves visual cue', () => {
  for (const vibrate of [() => undefined, () => false, () => { throw new Error('Unavailable'); }]) {
    const r = rig({ vibrate });
    assert.doesNotThrow(() => r.feedback.pulse(3));
    assert.equal(r.feedback.wheel, 3);
    assert.doesNotThrow(() => r.feedback.stop());
    assert.equal(r.feedback.wheel, null);
  }
});

test('alignment feedback: reduced motion keeps static halo without vibration', () => {
  const r = rig({ reducedMotion: () => true });
  r.feedback.pulse(3);
  assert.equal(r.feedback.wheel, 3);
  r.advance(300);
  assert.deepEqual(r.changes, [3, null]);
  assert.deepEqual(r.vibrations, []);
});

test('alignment feedback: invalid wheels and blocked view cause no effects', () => {
  const r = rig();
  for (const wheel of [0, 6, 1.5, NaN, Infinity, null]) assert.equal(r.feedback.pulse(wheel), false);
  r.feedback.stop();
  assert.deepEqual(r.vibrations, []);
  assert.deepEqual(r.changes, []);
  const blocked = rig({ allowed: () => false });
  assert.equal(blocked.feedback.pulse(1), false);
  assert.equal(blocked.timers.size, 0);
  assert.deepEqual(blocked.changes, []);
});

test('alignment feedback: the click shares the accepted geometric pulse and is never replayed on expiry or masking', () => {
  const clicks=[];
  let allowed=true;
  const r=rig({onArrival:id=>clicks.push(id),allowed:()=>allowed});
  r.feedback.pulse(2);
  r.advance(50);
  r.feedback.pulse(2);
  assert.deepEqual(clicks,[2]);
  r.advance(250);
  assert.deepEqual(clicks,[2]);
  allowed=false;
  r.feedback.stop();
  r.feedback.pulse(3);
  assert.deepEqual(clicks,[2]);
  allowed=true;
  r.feedback.pulse(3);
  assert.deepEqual(clicks,[2,3]);
});

test('alignment feedback: a refused audio cue leaves the halo and gesture available', () => {
  const r=rig({onArrival:()=>{throw new Error('Audio blocked');}});
  assert.doesNotThrow(()=>r.feedback.pulse(1));
  assert.equal(r.feedback.wheel,1);
  r.advance(300);
  assert.equal(r.feedback.wheel,null);
});
