import test from 'node:test';
import assert from 'node:assert/strict';
import { mechanicalDetents } from '../src/detents.js';
import { LEGACY_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS } from '../src/geometry.js';
import { magnetizeAngle, createMagneticDrag, advanceMagneticDrag } from '../src/magnet.js';

const close = (actual, expected, epsilon = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= epsilon,
  `Expected ${expected}°, received ${actual}°`,
);

function fieldAt(wheelId, index, geometryVersion) {
  const stops = mechanicalDetents(wheelId, geometryVersion);
  const angle = stops[index];
  const previous = index ? stops[index - 1] : stops.at(-1) - 360;
  const next = index + 1 < stops.length ? stops[index + 1] : stops[0] + 360;
  const radius = Math.min(5, (angle - previous) / 2, (next - angle) / 2);
  return { angle, radius, plateau: Math.min(1, radius / 4) };
}

test('every static alignment has a small exact plateau on every revolution', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    for (let index = 0; index < mechanicalDetents(wheelId).length; index += 1) {
      const { angle, plateau } = fieldAt(wheelId, index);
      for (const revolution of [-3, 0, 2]) for (const offset of [-.9, 0, .9]) {
        const stop = angle + revolution * 360;
        close(magnetizeAngle(wheelId, stop + offset * plateau), stop);
      }
    }
  }
});

test('attraction is continuous with matching slopes at its plateau and outer edges', () => {
  const h = 1e-5;
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    for (let index = 0; index < mechanicalDetents(wheelId).length; index += 1) {
      const { angle, radius, plateau } = fieldAt(wheelId, index);
      for (const sign of [-1, 1]) for (const [distance, slope] of [[plateau, 0], [radius, 1]]) {
        const edge = angle + sign * distance;
        const here = magnetizeAngle(wheelId, edge);
        const left = (here - magnetizeAngle(wheelId, edge - h)) / h;
        const right = (magnetizeAngle(wheelId, edge + h) - here) / h;
        close(left, slope, .0003);
        close(right, slope, .0003);
        close(left, right, .0003);
      }
    }
  }
});

test('all versioned sweeps remain monotone, including the neighbouring stops only 0.639° apart', () => {
  const closeStops = mechanicalDetents(2, LEGACY_GEOMETRY_VERSION);
  assert.ok(closeStops.some((angle, index) => index && angle - closeStops[index - 1] < .64));
  for(const geometryVersion of SUPPORTED_GEOMETRY_VERSIONS) for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    let previous = magnetizeAngle(wheelId, -5, geometryVersion);
    for (let step = 1; step <= 74000; step += 1) {
      const raw = -5 + step * .005;
      const next = magnetizeAngle(wheelId, raw, geometryVersion);
      assert.ok(next >= previous - 1e-10, `R${wheelId}: reversal at ${raw}°`);
      assert.ok(Math.abs(next - raw) < 1.5, `R${wheelId}: excessive correction at ${raw}°`);
      previous = next;
    }
  }
});

test('outside a field the angle is unchanged and the correction stays below 1.5 degrees', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    for (let index = 0; index < mechanicalDetents(wheelId).length; index += 1) {
      const { angle, radius } = fieldAt(wheelId, index);
      for (const sign of [-1, 1]) close(magnetizeAngle(wheelId, angle + sign * radius), angle + sign * radius);
      for (let step = -100; step <= 100; step += 1) {
        const raw = angle + radius * step / 100;
        assert.ok(Math.abs(magnetizeAngle(wheelId, raw) - raw) < 1.5);
      }
    }
  }
});

test('an isolated alignment attracts earlier, seats firmly, and releases with continuing finger travel', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const direction of [-1, 1]) {
    const stop = mechanicalDetents(1, version)[0];
    // At four degrees the old 3-degree field was already entirely inactive.
    const near = stop + direction * 4;
    const correction = direction * (near - magnetizeAngle(1, near, version));
    assert.ok(correction > .3 && correction < .4, 'a visible pull starts before the old field');
    close(magnetizeAngle(1, stop + direction * .75, version), stop);

    const state = createMagneticDrag(1, stop, version);
    assert.equal(advanceMagneticDrag(state, 0), 0);
    assert.equal(advanceMagneticDrag(state, direction * .75), 0);
    assert.ok(advanceMagneticDrag(state, direction * .5) * direction > 0,
      'the wheel starts leaving by 1.25 degrees of accumulated finger movement');
    advanceMagneticDrag(state, direction * 1.25);
    assert.ok((state.appliedAngle - stop) * direction > 1,
      'the wheel has visibly left its seat by 2.5 degrees');
    advanceMagneticDrag(state, direction * 2.5);
    close(state.rawAngle, stop + direction * 5);
    close(state.appliedAngle, state.rawAngle, 1e-8);
    close(advanceMagneticDrag(state, direction * .25), direction * .25);
  }
});

test('the midpoint between very close stops stays free and neither attraction crosses it', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const stops = mechanicalDetents(2, version);
    let index = 0;
    for (let candidate = 1; candidate < stops.length; candidate += 1) {
      if (stops[candidate] - stops[candidate - 1] < stops[index + 1] - stops[index]) index = candidate - 1;
    }
    const left = stops[index];
    const right = stops[index + 1];
    const middle = (left + right) / 2;
    const epsilon = (right - left) / 1000;
    close(magnetizeAngle(2, middle, version), middle);
    assert.ok(magnetizeAngle(2, middle - epsilon, version) < middle);
    assert.ok(magnetizeAngle(2, middle + epsilon, version) > middle);
    close(magnetizeAngle(2, left, version), left);
    close(magnetizeAngle(2, right, version), right);
  }
});

test('an off-grid saved angle stays exact until a genuine movement occurs', () => {
  const initial = mechanicalDetents(1)[0] + .25;
  const state = createMagneticDrag(1, initial);
  assert.deepEqual(state, { wheelId: 1, rawAngle: initial, appliedAngle: initial,
    arrivalCount: 0, activeStop: mechanicalDetents(1)[0] });
  for (let count = 0; count < 100; count += 1) assert.equal(advanceMagneticDrag(state, 0), 0);
  assert.equal(state.rawAngle, initial);
  assert.equal(state.appliedAngle, initial);
  const delta = advanceMagneticDrag(state, 2);
  close(state.rawAngle, initial + 2);
  close(state.appliedAngle, magnetizeAngle(1, initial + 2));
  close(delta, state.appliedAngle - initial);
  assert.ok(delta > 0);
});

test('small deltas accumulate through a plateau and eventually leave in either direction', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) for (const direction of [-1, 1]) {
    const initial = mechanicalDetents(wheelId)[0];
    const state = createMagneticDrag(wheelId, initial);
    let travel = 0;
    let moved = false;
    for (let step = 0; step < 1000; step += 1) {
      const delta = advanceMagneticDrag(state, direction * .005);
      assert.ok(delta * direction >= -1e-10);
      if (Math.abs(delta) > 0) moved = true;
      travel += delta;
    }
    assert.equal(moved, true);
    close(state.rawAngle, initial + direction * 5);
    close(travel, magnetizeAngle(wheelId, state.rawAngle) - initial);
    assert.ok(travel * direction > 3.5);
  }
});

test('full revolutions and reversals preserve raw travel without accumulated drift', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    const initial = mechanicalDetents(wheelId)[0];
    const state = createMagneticDrag(wheelId, initial);
    let total = 0;
    for (const direction of [1, -1, -1, 1]) {
      for (let step = 0; step < 720; step += 1) total += advanceMagneticDrag(state, direction * 1.5);
    }
    close(state.rawAngle, initial);
    close(state.appliedAngle, initial);
    close(total, 0);
  }
});

test('a 359°→1° wrap retains a small positive unwrapped movement and can reverse', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    const state = createMagneticDrag(wheelId, 359);
    const delta = advanceMagneticDrag(state, 2);
    assert.ok(delta > 0 && delta < 3.5);
    close(state.rawAngle, 361);
    close(state.appliedAngle, magnetizeAngle(wheelId, 361));
    assert.ok(advanceMagneticDrag(state, -2) < 0);
    close(state.rawAngle, 359);
    close(state.appliedAngle, magnetizeAngle(wheelId, 359));
    for (const revolution of [-4, 1, 5]) {
      close(magnetizeAngle(wheelId, 1 + revolution * 360), magnetizeAngle(wheelId, 1) + revolution * 360);
    }
  }
});

test('coarse and fine gestures cover the same unwrapped final angle without freezing', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) for (const direction of [-1, 1]) {
    const initial = 12.345;
    const coarse = createMagneticDrag(wheelId, initial);
    const fine = createMagneticDrag(wheelId, initial);
    const coarseDelta = advanceMagneticDrag(coarse, direction * 755);
    let fineDelta = 0;
    for (let step = 0; step < 1510; step += 1) fineDelta += advanceMagneticDrag(fine, direction * .5);
    close(coarse.rawAngle, fine.rawAngle);
    close(coarse.appliedAngle, fine.appliedAngle);
    close(coarseDelta, fineDelta);
    assert.ok(coarseDelta * direction > 753.5);
  }
});

test('invalid samples are no-ops and cannot poison the accumulated angle', () => {
  const state = createMagneticDrag(1, 12.345);
  const before = { ...state };
  for (const invalid of [0, -0, NaN, Infinity, -Infinity, '2', null, undefined, {}]) {
    assert.equal(advanceMagneticDrag(state, invalid), 0);
    assert.deepEqual(state, before);
  }
  for (const invalid of [null, undefined, {}, { wheelId: 1, rawAngle: NaN, appliedAngle: 0 }, { wheelId: 1, rawAngle: 0, appliedAngle: Infinity }]) {
    assert.equal(advanceMagneticDrag(invalid, 2), 0);
  }
  for (const wheelId of [0, 6, 1.5, '1', null, NaN]) {
    assert.equal(magnetizeAngle(wheelId, 12.345), 12.345);
    const invalid = createMagneticDrag(wheelId, 12.345);
    assert.equal(advanceMagneticDrag(invalid, 2), 0);
    assert.equal(invalid.rawAngle, 12.345);
    assert.equal(invalid.appliedAngle, 12.345);
  }
});

test('the magnetic drag reads only the wheel and physical angles, never private game data', () => {
  const state = createMagneticDrag(2, mechanicalDetents(2)[1] - 2);
  const reference = createMagneticDrag(2, state.rawAngle);
  for (const property of ['faces', 'active', 'view', 'queue', 'slots', 'exited', 'verdict', 'winner', 'events']) {
    Object.defineProperty(state, property, { get() { assert.fail(`Private property read: ${property}`); } });
  }
  for (const delta of [2, .1, .1, .1, 5, -10, 360, -720]) {
    close(advanceMagneticDrag(state, delta), advanceMagneticDrag(reference, delta));
    close(state.rawAngle, reference.rawAngle);
    close(state.appliedAngle, reference.appliedAngle);
    assert.equal(state.arrivalCount, reference.arrivalCount);
    assert.equal(state.activeStop, reference.activeStop);
  }
});

test('a contact already inside a plateau is quiet, including held and invalid samples', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    const { angle, plateau } = fieldAt(wheelId, 0);
    const state = createMagneticDrag(wheelId, angle - plateau / 2);
    assert.equal(state.arrivalCount, 0);
    close(state.activeStop, angle);
    const snapshot = { ...state };
    for (const delta of [0, 0, NaN, Infinity, null]) {
      assert.equal(advanceMagneticDrag(state, delta), 0);
      assert.deepEqual(state, snapshot);
    }
    for (const delta of [plateau / 4, -plateau / 2, plateau, -plateau / 2]) {
      advanceMagneticDrag(state, delta);
      assert.equal(state.arrivalCount, 0);
    }
  }
});

test('entering the attraction field is quiet until a true plateau arrival in either direction', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    for (let index = 0; index < mechanicalDetents(wheelId).length; index += 1) {
      const { angle, radius, plateau } = fieldAt(wheelId, index);
      for (const direction of [-1, 1]) {
        const start = angle - direction * radius * .9;
        const state = createMagneticDrag(wheelId, start);
        assert.equal(state.activeStop, null);
        advanceMagneticDrag(state, direction * radius * .2);
        assert.equal(state.arrivalCount, 0);
        assert.equal(state.activeStop, null);
        advanceMagneticDrag(state, angle - direction * plateau / 2 - state.rawAngle);
        assert.equal(state.arrivalCount, 1);
        close(state.activeStop, angle);
      }
    }
  }
});

test('jitter around the plateau cannot repeat a signal before leaving its entire field', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    const { angle, radius, plateau } = fieldAt(wheelId, 0);
    const state = createMagneticDrag(wheelId, angle - radius * .9);
    advanceMagneticDrag(state, angle - state.rawAngle);
    assert.equal(state.arrivalCount, 1);
    for (let repetition = 0; repetition < 50; repetition += 1) {
      for (const offset of [plateau * 1.1, plateau * .9, -plateau * .9, -plateau * 1.1, radius * .95, 0]) {
        advanceMagneticDrag(state, angle + offset - state.rawAngle);
        assert.equal(state.arrivalCount, 1);
      }
    }
    advanceMagneticDrag(state, angle + radius + .001 - state.rawAngle);
    assert.equal(state.activeStop, null);
    advanceMagneticDrag(state, angle - state.rawAngle);
    assert.equal(state.arrivalCount, 2);
    close(state.activeStop, angle);
  }
});

test('starting in a plateau requires a complete field exit before a return can notify', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
    const { angle, radius, plateau } = fieldAt(wheelId, 0);
    const state = createMagneticDrag(wheelId, angle);
    advanceMagneticDrag(state, radius * .95);
    advanceMagneticDrag(state, -radius * .95);
    assert.equal(state.arrivalCount, 0);
    close(state.activeStop, angle);
    advanceMagneticDrag(state, radius + .001);
    assert.equal(state.activeStop, null);
    advanceMagneticDrag(state, -(radius + .001) + plateau / 2);
    assert.equal(state.arrivalCount, 1);
    close(state.activeStop, angle);
  }
});

test('a coarse segment crossing several plateaus counts the same arrivals as fine tracking', () => {
  for (let wheelId = 1; wheelId <= 5; wheelId += 1) for (const direction of [-1, 1]) {
    const stops = mechanicalDetents(wheelId);
    const gap = stops.map((angle,index) => ({angle,next:stops[index+1] ?? stops[0]+360}))
      .find(({angle,next})=>next-angle>10);
    const start = (gap.angle+gap.next)/2;
    const coarse = createMagneticDrag(wheelId, start);
    const fine = createMagneticDrag(wheelId, start);
    advanceMagneticDrag(coarse, direction * 1080);
    for (let sample = 0; sample < 2160; sample += 1) advanceMagneticDrag(fine, direction * .5);
    assert.equal(coarse.arrivalCount, mechanicalDetents(wheelId).length * 3);
    assert.equal(coarse.arrivalCount, fine.arrivalCount);
    assert.equal(coarse.activeStop, null);
    assert.equal(fine.activeStop, null);
    close(coarse.appliedAngle, fine.appliedAngle);
  }
});

test('the two very close R2 plateaus each notify without one masking the other', () => {
  const stops = mechanicalDetents(2, LEGACY_GEOMETRY_VERSION);
  const index = stops.findIndex((angle, index) => index && angle - stops[index - 1] < .64);
  const left = fieldAt(2, index - 1, LEGACY_GEOMETRY_VERSION);
  const right = fieldAt(2, index, LEGACY_GEOMETRY_VERSION);
  const start = left.angle - left.radius * .9;
  const state = createMagneticDrag(2, start, LEGACY_GEOMETRY_VERSION);
  advanceMagneticDrag(state, right.angle - start);
  assert.equal(state.arrivalCount, 2);
  close(state.activeStop, right.angle);
  advanceMagneticDrag(state, right.plateau * 1.1);
  advanceMagneticDrag(state, -right.plateau * 1.1);
  assert.equal(state.arrivalCount, 2);
  advanceMagneticDrag(state, left.angle - state.rawAngle);
  assert.equal(state.arrivalCount, 3);
  close(state.activeStop, left.angle);
});

test('unwrapped arrivals work across multiple revolutions and reverse without wrap duplicates', () => {
  const { angle, radius } = fieldAt(1, 0);
  for (const revolution of [-4, 0, 5]) {
    const stop = angle + revolution * 360;
    const state = createMagneticDrag(1, stop - radius * .9);
    advanceMagneticDrag(state, radius * .9);
    assert.equal(state.arrivalCount, 1);
    close(state.activeStop, stop);
    advanceMagneticDrag(state, 720);
    assert.equal(state.arrivalCount, 1 + mechanicalDetents(1).length * 2);
    close(state.activeStop, stop + 720);
    advanceMagneticDrag(state, -720);
    assert.equal(state.arrivalCount, 1 + mechanicalDetents(1).length * 4);
    close(state.activeStop, stop);
  }
});

test('an out-and-back batch may have zero net rotation while its arrivals remain observable', () => {
  const { angle, radius } = fieldAt(1, 0);
  const initial = angle - radius - 1;
  const state = createMagneticDrag(1, initial);
  const forward = advanceMagneticDrag(state, 2 * (radius + 1));
  const reverse = advanceMagneticDrag(state, -2 * (radius + 1));
  close(forward + reverse, 0);
  close(state.rawAngle, initial);
  assert.equal(state.arrivalCount, 2);
  assert.equal(state.activeStop, null);
});

test('a plateau entry can increment the signal even when its rendered delta rounds to zero', () => {
  const { angle, plateau } = fieldAt(1, 0);
  const state = createMagneticDrag(1, angle - plateau - 1e-8);
  advanceMagneticDrag(state, 1e-9);
  assert.equal(state.arrivalCount, 0);
  close(state.appliedAngle, angle);
  const delta = advanceMagneticDrag(state, 2e-8);
  assert.equal(delta, 0);
  assert.equal(state.arrivalCount, 1);
  close(state.activeStop, angle);
});
