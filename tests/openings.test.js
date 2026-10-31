import test from 'node:test';
import assert from 'node:assert/strict';
import { WHEELS, gates, angularDistance } from '../src/geometry.js';
import {
  PASSAGE_HALF_WIDTH, MIN_PASSAGE_WIDTH, OVERLAP_TOLERANCE, mouthHalfAngle, mouthInterval,
  passableMouthInterval, isPassableOpening,
  overlapIntervals, openingAngleBounds, openingOverlap,
} from '../src/openings.js';

const radians = degrees => degrees * Math.PI / 180;
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon,
  `${actual} ≠ ${expected}`);
const nearInterval = (actual, expected) => {
  assert.ok(actual);
  actual.forEach((value, index) => near(value, expected[index]));
};

test('mouth width follows the actual SVG U at the outer contour, rather than a six-degree window', () => {
  assert.equal(PASSAGE_HALF_WIDTH, 14);
  assert.equal(MIN_PASSAGE_WIDTH, 20);
  assert.equal(OVERLAP_TOLERANCE, 1e-7);
  for (const wheel of WHEELS) {
    const half = mouthHalfAngle(wheel.id);
    near(wheel.radius * Math.sin(radians(half)), 14);
    assert.ok(wheel.radius * Math.cos(radians(half)) >= wheel.radius - 14);
    nearInterval(mouthInterval(wheel.id, 0, 0), [-14, 14]);
    assert.ok(half > 6);
  }
});

test('common tangent coordinates reverse the receiver and remain invariant under rotation', () => {
  for (const wheel of WHEELS) {
    for (const offset of [-20, -10, 0, 10, 20]) {
      const interval = mouthInterval(wheel.id, offset, 0);
      assert.ok(interval);
      nearInterval(mouthInterval(wheel.id, offset + 300, 300), interval);
      nearInterval(mouthInterval(wheel.id, offset, 0, true), [-interval[1], -interval[0]]);
    }
  }
});

test('a generous shared width passes, but narrow visible overlaps do not', () => {
  for (const gate of gates(0)) {
    for (const offset of [-5, 5]) {
      assert.ok(openingOverlap(gate.from, gate.sourceAngle + offset, gate.sourceAngle,
        gate.to, gate.targetAngle - offset, gate.targetAngle));
    }
    for (const offset of [-20, -10, 10, 20]) {
      const raw = overlapIntervals(mouthInterval(gate.from, gate.sourceAngle + offset, gate.sourceAngle),
        mouthInterval(gate.to, gate.targetAngle - offset, gate.targetAngle, true));
      assert.ok(raw && raw[1] - raw[0] > 0 && raw[1] - raw[0] < 20);
      assert.equal(openingOverlap(gate.from, gate.sourceAngle + offset, gate.sourceAngle,
        gate.to, gate.targetAngle - offset, gate.targetAngle), null);
    }
    for (const offset of [-20, 20]) {
      assert.equal(openingOverlap(gate.from, gate.sourceAngle + offset, gate.sourceAngle,
        gate.to, gate.targetAngle + offset, gate.targetAngle), null);
    }
  }
});

test('mirrored mouths give the same overlap width and the opposite tangent interval', () => {
  const front = gates(0);
  const back = gates(1);
  for (let index = 0; index < front.length; index++) {
    const a = front[index]; const b = back[index];
    for (const sourceOffset of [-20, -10, 0, 10, 20]) {
      for (const receiverOffset of [-20, -10, 0, 10, 20]) {
        const first = openingOverlap(a.from, a.sourceAngle + sourceOffset, a.sourceAngle,
          a.to, a.targetAngle + receiverOffset, a.targetAngle);
        const mirror = openingOverlap(b.from, b.sourceAngle - sourceOffset, b.sourceAngle,
          b.to, b.targetAngle - receiverOffset, b.targetAngle);
        if (!first) assert.equal(mirror, null);
        else nearInterval(mirror, [-first[1], -first[0]]);
      }
    }
  }
});

test('rim contact is accepted, a real gap is rejected, and no inverted intervals escape rounding', () => {
  nearInterval(overlapIntervals([-14, 0], [0, 14]), [0, 0]);
  const nearContact = overlapIntervals([-14, 0], [OVERLAP_TOLERANCE / 2, 14]);
  assert.ok(nearContact);
  assert.equal(nearContact[0], nearContact[1]);
  assert.equal(overlapIntervals([-14, 0], [OVERLAP_TOLERANCE * 2, 14]), null);
  for (const wheel of WHEELS) {
    const edge = 2 * mouthHalfAngle(wheel.id);
    nearInterval(mouthInterval(wheel.id, edge, 0), [14, 14]);
    nearInterval(mouthInterval(wheel.id, -edge, 0), [-14, -14]);
    assert.equal(mouthInterval(wheel.id, edge + 0.001, 0), null);
    assert.equal(mouthInterval(wheel.id, -edge - 0.001, 0), null);
  }
});

test('openings at the back or outside the fixed corridor cannot trigger a transfer', () => {
  for (const wheel of WHEELS) {
    for (const angle of [45, 89, 90, 120, 150, 180, 210, 270, 315]) {
      assert.equal(mouthInterval(wheel.id, angle, 0), null, `wheel ${wheel.id}, ${angle}°`);
    }
    assert.equal(mouthInterval(wheel.id, NaN, 0), null);
    assert.equal(mouthInterval(wheel.id, 0, Infinity), null);
  }
});

test('passable mouths require twenty clear units, including at fixed entry and exit ports', () => {
  for (const wheel of WHEELS) {
    const limit = Math.asin(14 / wheel.radius) * 180 / Math.PI
      + Math.asin(-6 / wheel.radius) * 180 / Math.PI;
    for (const side of [-1, 1]) {
      const boundary = passableMouthInterval(wheel.id, side * limit, 0);
      assert.ok(boundary);
      near(boundary[1] - boundary[0], 20);
      assert.ok(passableMouthInterval(wheel.id, side * (limit - .001), 0));
      assert.equal(passableMouthInterval(wheel.id, side * (limit + .001), 0), null);
      assert.ok(mouthInterval(wheel.id, side * (limit + .001), 0));
    }
    nearInterval(passableMouthInterval(wheel.id, 0, 0, true), [-14, 14]);
    assert.equal(passableMouthInterval(wheel.id, 180, 0), null);
  }
});

test('the common width predicate accepts only twenty units within numerical precision', () => {
  assert.equal(isPassableOpening([-10, 10]), true);
  assert.equal(isPassableOpening([-10, 10 - OVERLAP_TOLERANCE / 2]), true);
  assert.equal(isPassableOpening([-10, 10 - OVERLAP_TOLERANCE * 2]), false);
  assert.equal(isPassableOpening([-14, 14]), true);
  for (const closed of [null, [0, 0], [-14, 0], [10, -10], [NaN, 10]]) {
    assert.equal(isPassableOpening(closed), false);
  }
});

test('analytic bounds describe exactly when twenty units become clear', () => {
  for (const wheel of WHEELS) {
    const fixedLimit = Math.asin(14 / wheel.radius) * 180 / Math.PI
      + Math.asin(-6 / wheel.radius) * 180 / Math.PI;
    nearInterval(openingAngleBounds(wheel.id), [-fixedLimit, fixedLimit]);
    for (const companion of [[-14, 6], [-8, 13], [-10, 10], [-14, 14]]) {
      const [lower, upper] = openingAngleBounds(wheel.id, companion);
      for (const edge of [lower, upper]) {
        const shared = overlapIntervals(mouthInterval(wheel.id, edge, 0), companion);
        assert.ok(shared);
        near(shared[1] - shared[0], 20);
      }
      for (const outside of [lower - .001, upper + .001]) {
        const shared = overlapIntervals(mouthInterval(wheel.id, outside, 0), companion);
        assert.ok(shared && shared[1] - shared[0] < 20);
      }
      const shared = overlapIntervals(mouthInterval(wheel.id, (lower + upper) / 2, 0), companion);
      assert.ok(shared && shared[1] - shared[0] >= 20 - OVERLAP_TOLERANCE);
    }
    for (const insufficient of [[-14, -7], [-8, 9], [0, 0], [7, 14], [15, 20]]) {
      assert.equal(openingAngleBounds(wheel.id, insufficient), null);
    }
  }
});

test('the paired opening accepts its exact twenty-unit boundary without accepting a thin contact', () => {
  for (const gate of gates(0)) {
    const wheel = WHEELS[gate.from - 1];
    const limit = Math.asin(14 / wheel.radius) * 180 / Math.PI
      + Math.asin(-6 / wheel.radius) * 180 / Math.PI;
    for (const side of [-1, 1]) {
      const shared = openingOverlap(gate.from, gate.sourceAngle + side * limit, gate.sourceAngle,
        gate.to, gate.targetAngle, gate.targetAngle);
      assert.ok(shared);
      near(shared[1] - shared[0], 20);
      assert.equal(openingOverlap(gate.from, gate.sourceAngle + side * (limit + .001), gate.sourceAngle,
        gate.to, gate.targetAngle, gate.targetAngle), null);
    }
  }
});

test('wider openings cannot duplicate a notch across outgoing routes or shared receiving ports', () => {
  for (const face of [0, 1]) {
    const passages = gates(face);
    for (const wheel of WHEELS) {
      const fullWindowWidth = 4 * mouthHalfAngle(wheel.id);
      assert.ok(fullWindowWidth < 360 / wheel.notches);
      for (const [property, angle] of [['from', 'sourceAngle'], ['to', 'targetAngle']]) {
        const ports = passages.filter(gate => gate[property] === wheel.id);
        for (let a = 0; a < ports.length; a++) {
          for (let b = a + 1; b < ports.length; b++) {
            assert.ok(angularDistance(ports[a][angle], ports[b][angle]) > fullWindowWidth,
              `face ${face}, wheel ${wheel.id}, ${property}`);
          }
        }
      }
    }
  }
});

test('invalid intervals are rejected and unknown wheels fail explicitly', () => {
  for (const invalid of [null, [2, 1], [0], [NaN, 3], [-Infinity, 1]]) {
    assert.equal(overlapIntervals(invalid, [-14, 14]), null);
    assert.equal(overlapIntervals([-14, 14], invalid), null);
  }
  assert.throws(() => mouthHalfAngle(0), RangeError);
  assert.throws(() => mouthInterval(6, 0, 0), RangeError);
  assert.throws(() => openingAngleBounds(1.5), RangeError);
});
