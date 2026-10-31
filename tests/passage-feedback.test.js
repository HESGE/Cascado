import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_GEOMETRY_VERSIONS, wheelsFor, gates, inputGates, OUTPUT_GATE, normalizeAngle } from '../src/geometry.js';
import { mouthInterval, openingAngleBounds, openingOverlap } from '../src/openings.js';
import { createPassageFeedbackTracker, advancePassageFeedbackTracker, PASSAGE_FEEDBACK_HYSTERESIS } from '../src/passage-feedback.js';

function fixture(faceIndex, geometryVersion, wheelId, chosen = 0) {
  const wheels = wheelsFor(geometryVersion);
  const links = gates(faceIndex).filter(gate => gate.from === wheelId || gate.to === wheelId);
  const view = { faceIndex, geometryVersion, angles: Array(5).fill(0) };
  for (const gate of links) {
    const companionId = gate.from === wheelId ? gate.to : gate.from;
    const companionGate = gate.from === wheelId ? gate.targetAngle : gate.sourceAngle;
    // Put each stationary neighbour midway between its own holes.
    view.angles[companionId - 1] = companionGate + 180 / wheels[companionId - 1].notches;
  }
  const gate = links[chosen];
  const sourceMoves = gate.from === wheelId;
  const companionId = sourceMoves ? gate.to : gate.from;
  const ownGate = sourceMoves ? gate.sourceAngle : gate.targetAngle;
  const companionGate = sourceMoves ? gate.targetAngle : gate.sourceAngle;
  view.angles[companionId - 1] = companionGate;
  view.angles[wheelId - 1] = ownGate;
  const bounds = openingAngleBounds(wheelId, mouthInterval(companionId, companionGate, companionGate, true));
  return { view, wheels, gate, links, companionId, ownGate, companionGate, bounds };
}

function openAt(view, gate, movingId, localAngle) {
  const wheels = wheelsFor(view.geometryVersion);
  const direction = view.faceIndex === 0 ? 1 : -1;
  const base = id => id === movingId ? localAngle : view.angles[id - 1];
  for (let source = 0; source < wheels[gate.from - 1].notches; source += 1) {
    for (let target = 0; target < wheels[gate.to - 1].notches; target += 1) {
      if (openingOverlap(gate.from, base(gate.from) + direction * source * 360 / wheels[gate.from - 1].notches,
        gate.sourceAngle, gate.to, base(gate.to) + direction * target * 360 / wheels[gate.to - 1].notches,
        gate.targetAngle)) return true;
    }
  }
  return false;
}

for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
  test(`${version}, face ${face}: every moving source and receiver cues only a practicable two-wheel overlap`, () => {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
      const links = gates(face).filter(gate => gate.from === wheelId || gate.to === wheelId);
      for (let chosen = 0; chosen < links.length; chosen += 1) for (const direction of [-1, 1]) {
        const { view, gate, ownGate, bounds } = fixture(face, version, wheelId, chosen);
        const boundary = ownGate + (direction > 0 ? bounds[0] : bounds[1]);
        view.angles[wheelId - 1] = boundary - direction * .5;
        assert.equal(openAt(view, gate, wheelId, view.angles[wheelId - 1]), false);
        const tracker = createPassageFeedbackTracker(view, wheelId);
        assert.equal(advancePassageFeedbackTracker(tracker, direction * .4), 0,
          'a sliver below the shared width threshold remains quiet');
        assert.equal(advancePassageFeedbackTracker(tracker, direction * .2), 1);
        assert.equal(openAt(view, gate, wheelId, tracker.angle), true);
      }
    }
  });
}

test('closed stationary receivers or sources produce no opening cue in any profile or face', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
      const { view, wheels, companionId, companionGate } = fixture(face, version, wheelId);
      view.angles[companionId - 1] = companionGate + 180 / wheels[companionId - 1].notches;
      const tracker = createPassageFeedbackTracker(view, wheelId);
      assert.equal(advancePassageFeedbackTracker(tracker, 1080), 0);
      assert.equal(advancePassageFeedbackTracker(tracker, -2160), 0);
    }
  }
});

test('asymmetric companion mouths use the correct tangent orientation for a moving source or receiver', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
      const links = gates(face).filter(gate => gate.from === wheelId || gate.to === wheelId);
      for (let chosen = 0; chosen < links.length; chosen += 1) for (const offset of [-3, 3]) {
        const { view, gate, companionId, companionGate, ownGate } = fixture(face, version, wheelId, chosen);
        view.angles[companionId - 1] += offset;
        const bounds = openingAngleBounds(wheelId,
          mouthInterval(companionId, view.angles[companionId - 1], companionGate, true));
        assert.ok(bounds);
        for (const direction of [-1, 1]) {
          const boundary = ownGate + bounds[direction > 0 ? 0 : 1];
          view.angles[wheelId - 1] = boundary - direction * .05;
          const tracker = createPassageFeedbackTracker(view, wheelId);
          assert.equal(openAt(view, gate, wheelId, tracker.angle), false);
          assert.equal(advancePassageFeedbackTracker(tracker, direction * .1), 1);
          assert.equal(openAt(view, gate, wheelId, tracker.angle), true);
        }
      }
    }
  }
});

test('a stationary mouth narrower than the passage threshold cannot trigger any cue', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
      const { view, companionId, companionGate } = fixture(face, version, wheelId);
      const companionBounds = openingAngleBounds(companionId);
      view.angles[companionId - 1] = companionGate + companionBounds[1] + .1;
      const mouth = mouthInterval(companionId, view.angles[companionId - 1], companionGate, true);
      assert.ok(mouth && mouth[1] - mouth[0] < 20);
      assert.equal(advancePassageFeedbackTracker(createPassageFeedbackTracker(view, wheelId), 720), 0);
    }
  }
});

test('initially open passages stay silent while held and boundary jitter needs a full hysteresis release', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
      const { view, ownGate, bounds } = fixture(face, version, wheelId);
      const boundary = ownGate + bounds[0];
      view.angles[wheelId - 1] = boundary + .01;
      const tracker = createPassageFeedbackTracker(view, wheelId);
      for (let repetition = 0; repetition < 10; repetition += 1) {
        assert.equal(advancePassageFeedbackTracker(tracker, 0), 0);
        assert.equal(advancePassageFeedbackTracker(tracker, -.02), 0);
        assert.equal(advancePassageFeedbackTracker(tracker, .02), 0);
      }
      assert.equal(advancePassageFeedbackTracker(tracker, boundary - PASSAGE_FEEDBACK_HYSTERESIS - .02 - tracker.angle), 0);
      assert.equal(advancePassageFeedbackTracker(tracker, boundary + .01 - tracker.angle), 1);
      for (const offset of [-.01, .01, -.01, .01]) {
        assert.equal(advancePassageFeedbackTracker(tracker, boundary + offset - tracker.angle), 0);
      }
    }
  }
});

test('coalesced turns, complete revolutions and reversals count the same openings as fine motion', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) for (const direction of [-1, 1]) {
      const { view, wheels, ownGate } = fixture(face, version, wheelId);
      const notches = wheels[wheelId - 1].notches;
      view.angles[wheelId - 1] = ownGate + 180 / notches;
      const coarse = createPassageFeedbackTracker(view, wheelId);
      const fine = createPassageFeedbackTracker(view, wheelId);
      assert.equal(advancePassageFeedbackTracker(coarse, direction * 1080), notches * 3);
      let count = 0;
      for (let sample = 0; sample < 2160; sample += 1) count += advancePassageFeedbackTracker(fine, direction * .5);
      assert.equal(count, notches * 3);
      assert.equal(fine.angle, coarse.angle);
      assert.equal(advancePassageFeedbackTracker(coarse, -direction * 720), notches * 2);
    }
  }
});

test('periodic windows join across zero without counting twice at the wrap', () => {
  let wraps = 0;
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) {
    for (let wheelId = 1; wheelId <= 5; wheelId += 1) {
      const links = gates(face).filter(gate => gate.from === wheelId || gate.to === wheelId);
      for (let chosen = 0; chosen < links.length; chosen += 1) {
        const { view } = fixture(face, version, wheelId, chosen);
        const tracker = createPassageFeedbackTracker(view, wheelId);
        const wrap = tracker.passages.flatMap(passage => passage.windows).find(window => window[1] > 360);
        if (!wrap) continue;
        wraps++;
        view.angles[wheelId - 1] = wrap[0] - 1;
        const across = createPassageFeedbackTracker(view, wheelId);
        assert.equal(advancePassageFeedbackTracker(across, 1.1), 1);
        assert.equal(advancePassageFeedbackTracker(across, 360 - across.angle + .01), 0);
        assert.ok(normalizeAngle(across.angle) < .02);
      }
    }
  }
  assert.ok(wraps > 0, 'the real geometry exercises windows crossing zero');
});

test('fixed queue entrances and the final outlet never create a two-wheel opening cue', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const face of [0, 1]) for (const wheelId of [1, 5]) {
    const { view, wheels, companionId, companionGate } = fixture(face, version, wheelId);
    view.angles[companionId - 1] = companionGate + 180 / wheels[companionId - 1].notches;
    const ports = wheelId === 1 ? inputGates(version) : [OUTPUT_GATE];
    view.angles[wheelId - 1] = ports[0] - 20;
    assert.equal(advancePassageFeedbackTracker(createPassageFeedbackTracker(view, wheelId), 1080), 0);
  }
});

test('only public local geometry is read, independently of empty or occupied wheels', () => {
  const { view, ownGate, bounds } = fixture(1, SUPPORTED_GEOMETRY_VERSIONS[0], 3);
  view.angles[2] = ownGate + bounds[0] - 1;
  const clean = structuredClone(view);
  for (const key of ['slots', 'queue', 'queues', 'exited', 'faces', 'verdict', 'events', 'opponent', 'physicalAngles', 'engaged']) {
    Object.defineProperty(view, key, { get() { assert.fail(`Private data read: ${key}`); } });
  }
  Object.freeze(view.angles); Object.freeze(view);
  const privateTracker = createPassageFeedbackTracker(view, 3);
  const emptyTracker = createPassageFeedbackTracker({ ...clean, slots: Array(5).fill([]) }, 3);
  const occupiedTracker = createPassageFeedbackTracker({ ...clean, slots: Array(5).fill([1, 2, 3, 4, 5]) }, 3);
  for (const delta of [1.1, .01, -.02, 360, -720, 30]) {
    const expected = advancePassageFeedbackTracker(privateTracker, delta);
    assert.equal(advancePassageFeedbackTracker(emptyTracker, delta), expected);
    assert.equal(advancePassageFeedbackTracker(occupiedTracker, delta), expected);
  }
  assert.deepEqual(view.angles, clean.angles);
});

test('invalid creation arguments fail clearly and invalid movement samples cannot corrupt a tracker', () => {
  const { view } = fixture(0, SUPPORTED_GEOMETRY_VERSIONS[0], 2);
  for (const faceIndex of [-1, 2, '0', undefined, null]) assert.throws(() => createPassageFeedbackTracker({ ...view, faceIndex }, 2), RangeError);
  for (const wheelId of [0, 6, '1', 1.5, undefined, null]) assert.throws(() => createPassageFeedbackTracker(view, wheelId), RangeError);
  assert.throws(() => createPassageFeedbackTracker({ ...view, geometryVersion: 'unknown' }, 2), RangeError);
  for (const angles of [null, [], [0, 0, 0, 0], [0, 0, NaN, 0, 0], ['0', 0, 0, 0, 0]]) {
    assert.throws(() => createPassageFeedbackTracker({ ...view, angles }, 2), TypeError);
  }
  const tracker = createPassageFeedbackTracker(view, 2);
  const before = structuredClone(tracker);
  for (const delta of [0, NaN, Infinity, -Infinity, '1', null, undefined]) {
    assert.equal(advancePassageFeedbackTracker(tracker, delta), 0);
    assert.deepEqual(tracker, before);
  }
  for (const invalid of [null, undefined, {}, { angle: NaN, passages: [] }]) assert.equal(advancePassageFeedbackTracker(invalid, 1), 0);
});
