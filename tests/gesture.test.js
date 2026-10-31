import test from 'node:test';
import assert from 'node:assert/strict';
import { createWheelGesture, advanceWheelGesture } from '../src/gesture.js';

const center = { x: 180, y: 250 };
const pointAt = (angle, radius = 70, origin = center) => ({
  x: origin.x + Math.cos(angle * Math.PI / 180) * radius,
  y: origin.y + Math.sin(angle * Math.PI / 180) * radius,
});
const close = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-8,
  `Expected ${expected}°, received ${actual}°`,
);

test('contact, waiting and radial movement do not rotate or engage a wheel', () => {
  const gesture = createWheelGesture(center, pointAt(30));
  for (const radius of [70, 70, 30, 100, 40]) {
    assert.equal(advanceWheelGesture(gesture, pointAt(30, radius)), 0);
  }
  assert.equal(gesture.active, false);
});

test('small angular changes accumulate until activation and preserve the full 1:1 movement', () => {
  const gesture = createWheelGesture(center, pointAt(10));
  close(advanceWheelGesture(gesture, pointAt(10.7)), 0);
  close(advanceWheelGesture(gesture, pointAt(11.4)), 0);
  close(advanceWheelGesture(gesture, pointAt(12)), 2);
  close(advanceWheelGesture(gesture, pointAt(12.125)), .125);
  close(advanceWheelGesture(gesture, pointAt(11.625)), -.5);
  assert.equal(gesture.active, true);
});

test('repeated jitter below the threshold never engages or adds up to a turn', () => {
  const gesture = createWheelGesture(center, pointAt(0));
  for (let repetition = 0; repetition < 100; repetition += 1) {
    for (const angle of [1.5, -.7, 1.25, -1.5, 0]) {
      assert.equal(advanceWheelGesture(gesture, pointAt(angle)), 0);
    }
  }
  assert.equal(gesture.active, false);
  close(advanceWheelGesture(gesture, pointAt(-2.5)), -2.5);
});

test('clockwise and anticlockwise quarter-turns track multiple complete revolutions', () => {
  for (const direction of [-1, 1]) {
    const gesture = createWheelGesture(center, pointAt(13));
    let total = 0;
    for (let step = 1; step <= 12; step += 1) {
      const delta = advanceWheelGesture(gesture, pointAt(13 + direction * step * 90));
      close(delta, direction * 90);
      total += delta;
    }
    close(total, direction * 1080);
  }
});

test('the atan2 boundary unwraps without a jump in either direction', () => {
  const clockwise = createWheelGesture(center, pointAt(178));
  close(advanceWheelGesture(clockwise, pointAt(-178)), 4);
  close(advanceWheelGesture(clockwise, pointAt(-175.5)), 2.5);
  close(advanceWheelGesture(clockwise, pointAt(179)), -5.5);

  const anticlockwise = createWheelGesture(center, pointAt(-179));
  close(advanceWheelGesture(anticlockwise, pointAt(178)), -3);
  close(advanceWheelGesture(anticlockwise, pointAt(175.5)), -2.5);
});

test('activation can cross the angular boundary and then reverse with subdegree precision', () => {
  const gesture = createWheelGesture(center, pointAt(179));
  close(advanceWheelGesture(gesture, pointAt(179.8)), 0);
  close(advanceWheelGesture(gesture, pointAt(-179.6)), 0);
  close(advanceWheelGesture(gesture, pointAt(-178.8)), 2.2);
  close(advanceWheelGesture(gesture, pointAt(-178.9)), -.1);
  close(advanceWheelGesture(gesture, pointAt(-179)), -.1);
});

test('starting inside the hub rearms on exit without a jump or false activation', () => {
  const gesture = createWheelGesture(center, center);
  assert.equal(advanceWheelGesture(gesture, pointAt(90, 5)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(180, 12)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(180, 40)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(181, 40)), 0);
  close(advanceWheelGesture(gesture, pointAt(183, 40)), 3);
});

test('crossing the hub during a drag resets the baseline and preserves fine tracking after exit', () => {
  const gesture = createWheelGesture(center, pointAt(0));
  close(advanceWheelGesture(gesture, pointAt(20)), 20);
  assert.equal(advanceWheelGesture(gesture, pointAt(30, 10)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(180, 70)), 0);
  close(advanceWheelGesture(gesture, pointAt(180.25, 70)), .25);
  close(advanceWheelGesture(gesture, pointAt(179.75, 70)), -.5);
});

test('entering the hub before activation clears pending movement', () => {
  const gesture = createWheelGesture(center, pointAt(0));
  assert.equal(advanceWheelGesture(gesture, pointAt(1.5)), 0);
  assert.equal(advanceWheelGesture(gesture, center), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(90)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(91)), 0);
  close(advanceWheelGesture(gesture, pointAt(92)), 2);
});

test('invalid samples are safe and rearm without propagating a discontinuity', () => {
  const gesture = createWheelGesture(center, pointAt(0));
  close(advanceWheelGesture(gesture, pointAt(10)), 10);
  for (const invalid of [null, undefined, {}, { x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: '1', y: 2 }]) {
    assert.equal(advanceWheelGesture(gesture, invalid), 0);
    assert.equal(advanceWheelGesture(gesture, pointAt(120)), 0);
  }
  close(advanceWheelGesture(gesture, pointAt(120.1)), .1);

  const invalidCenter = createWheelGesture({ x: NaN, y: 0 }, pointAt(0));
  assert.equal(advanceWheelGesture(invalidCenter, pointAt(30)), 0);
  assert.equal(advanceWheelGesture(null, pointAt(30)), 0);
});

test('configurable thresholds and dead radius are independent of pointer type and game state', () => {
  const gesture = createWheelGesture(center, pointAt(0, 30), { deadRadius: 35, activationDegrees: 5 });
  assert.equal(advanceWheelGesture(gesture, pointAt(40, 34)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(40, 36)), 0);
  assert.equal(advanceWheelGesture(gesture, pointAt(44.5, 36)), 0);
  close(advanceWheelGesture(gesture, pointAt(45, 36)), 5);

  const immediate = createWheelGesture(center, pointAt(0), { deadRadius: 0, activationDegrees: 0 });
  assert.equal(advanceWheelGesture(immediate, pointAt(0)), 0);
  close(advanceWheelGesture(immediate, pointAt(.2)), .2);
  assert.equal(advanceWheelGesture(immediate, center), 0);

  const defaults = createWheelGesture(center, pointAt(0), { deadRadius: -1, activationDegrees: NaN });
  assert.equal(defaults.deadRadius, 12);
  assert.equal(defaults.activationDegrees, 2);
});

test('the gesture snapshots its centre and does not mutate coordinates passed by the caller', () => {
  const origin = { x: 25, y: 100 };
  const first = pointAt(0, 40, origin);
  const gesture = createWheelGesture(origin, first);
  origin.x = 500;
  const next = { x: 25, y: 140 };
  close(advanceWheelGesture(gesture, next), 90);
  assert.deepEqual(first, { x: 65, y: 100 });
  assert.deepEqual(next, { x: 25, y: 140 });
});
