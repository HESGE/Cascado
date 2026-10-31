import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, allowedWheels, rotate, endTurn, adjudicateExitBatch } from '../src/engine.js';
import { GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION,
  SUPPORTED_GEOMETRY_VERSIONS, wheelsFor, BOARD, inputGates,
  normalizeAngle, angularDistance, slotPosition, notchAngle, physicalAngleFor, gates } from '../src/geometry.js';

// This is a regression of v1.4's exact mechanical equivalence. The newer
// photographic offsets intentionally do not claim that face-exchange symmetry.
const WHEELS = wheelsFor(PREVIOUS_GEOMETRY_VERSION);

const swappedWinner = winner => winner === null ? null : 1 - winner;
const mappedNotch = (oldFace, wheelId, notch) => oldFace === 1 ? notch
  : (notch + WHEELS[wheelId - 1].notches - 1) % WHEELS[wheelId - 1].notches;

function swappedPosition(position) {
  return {
    ...structuredClone(position),
    angles: position.angles.map((angle, index) => normalizeAngle(angle + WHEELS[index].delta)),
    active: 1 - position.active,
    faces: [1, 0].map(oldFace => {
      const face = structuredClone(position.faces[oldFace]);
      face.slots = face.slots.map((slots, wheel) => {
        const mapped = Array(slots.length).fill(null);
        slots.forEach((token, notch) => { mapped[mappedNotch(oldFace, wheel + 1, notch)] = token; });
        return mapped;
      });
      return face;
    }),
  };
}

function transferKey(transfer, swap = false) {
  const location = at => at.wheel ? { wheel: at.wheel,
    notch: swap ? mappedNotch(transfer.face, at.wheel, at.notch) : at.notch } : at;
  return JSON.stringify({ face: swap ? 1 - transfer.face : transfer.face, token: transfer.token,
    from: location(transfer.from), to: location(transfer.to) });
}

function assertPosition(actual, expected, context) {
  assert.deepEqual(actual.faces, expected.faces, `${context}: numbered token positions`);
  for (let wheel = 0; wheel < WHEELS.length; wheel++) {
    assert.ok(angularDistance(actual.angles[wheel], expected.angles[wheel]) < 1e-6,
      `${context}: physical angle ${wheel + 1}`);
  }
  for (const field of ['active', 'turn', 'engaged', 'lastWheel']) {
    assert.equal(actual[field], expected[field], `${context}: ${field}`);
  }
}

function assertConserved(game) {
  for (const face of game.faces) {
    const tokens = [...face.queue, ...face.exited, ...face.slots.flat().filter(token => token !== null)];
    assert.deepEqual(tokens.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  }
}

test('v1.4 uses half-notch offsets while all dimensions and gates preserve the existing board', () => {
  assert.equal(PREVIOUS_GEOMETRY_VERSION, 'ddc-v1.4');
  for (const wheel of WHEELS) {
    assert.equal(2 * wheel.delta, 360 / wheel.notches);
    const legacy = wheelsFor(LEGACY_GEOMETRY_VERSION)[wheel.id - 1];
    for (const field of ['id', 'x', 'y', 'radius', 'notches', 'alpha', 'seatRadius']) {
      assert.equal(wheel[field], legacy[field]);
    }
    assert.equal(Object.isFrozen(wheel), true);
  }
  assert.equal(Object.isFrozen(WHEELS), true);
  for (const gate of gates(0)) {
    const opposite = gates(1).find(item => item.from === gate.from && item.to === gate.to);
    assert.ok(angularDistance(opposite.sourceAngle, 180 - gate.sourceAngle) < 1e-10);
    assert.ok(angularDistance(opposite.targetAngle, 180 - gate.targetAngle) < 1e-10);
  }
});

test('v1.5 uses the photographic phase choices with two loading ports per face', () => {
  assert.equal(GEOMETRY_VERSION, 'ddc-v1.5');
  const current = wheelsFor(GEOMETRY_VERSION);
  assert.deepEqual(current.map(wheel => wheel.delta), [75, 90, 90, 20, 15]);
  assert.deepEqual(current.map(wheel => {
    const pitch = 360 / wheel.notches;
    return Math.abs(((wheel.delta + pitch / 2) % pitch) - pitch / 2);
  }), [75, 30, 90, 20, 15]);
  assert.deepEqual(inputGates(GEOMETRY_VERSION), [210, 330]);
  assert.deepEqual(inputGates(PREVIOUS_GEOMETRY_VERSION), [270]);
  assert.deepEqual(inputGates(LEGACY_GEOMETRY_VERSION), [270]);
});

test('swapping faces, adding the half-notch phase, and relabelling seats reflects every seat exactly', () => {
  for (const angle of [0, 0.1, 17.37, 90, 179.99999999999994, 180, 270, 359.9]) {
    for (const wheel of WHEELS) {
      for (const oldFace of [0, 1]) {
        for (let notch = 0; notch < wheel.notches; notch++) {
          const transformed = normalizeAngle(angle + wheel.delta);
          const otherNotch = mappedNotch(oldFace, wheel.id, notch);
          const point = slotPosition(oldFace, wheel.id, notch, angle, PREVIOUS_GEOMETRY_VERSION);
          const opposite = slotPosition(1 - oldFace, wheel.id, otherNotch, transformed, PREVIOUS_GEOMETRY_VERSION);
          assert.ok(Math.abs(point.x + opposite.x - BOARD.width) < 1e-8);
          assert.ok(Math.abs(point.y - opposite.y) < 1e-8);
          assert.ok(angularDistance(notchAngle(1 - oldFace, wheel.id, otherNotch, transformed, PREVIOUS_GEOMETRY_VERSION),
            180 - notchAngle(oldFace, wheel.id, notch, angle, PREVIOUS_GEOMETRY_VERSION)) < 1e-8);
        }
      }
    }
  }
});

test('all three versioned profiles keep exact angle inversion for every face and numbered seat', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    for (const face of [0, 1]) {
      for (const wheel of wheelsFor(version)) {
        for (let notch = 0; notch < wheel.notches; notch++) {
          for (const angle of [0, 31.72, 90, 180, 270, 359.9]) {
            const physical = physicalAngleFor(face, wheel.id, notch, angle, version);
            assert.ok(angularDistance(notchAngle(face, wheel.id, notch, physical, version), angle) < 1e-8);
          }
        }
      }
    }
  }
});

test('1 000 coupled legal moves preserve face-swap symmetry, numbered tokens, transfers and terminal snapshots', () => {
  let seed = 1701;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let fixture = 0; fixture < 10; fixture++) {
    const original = createGame(['A', 'B'], fixture % 2, PREVIOUS_GEOMETRY_VERSION);
    original.angles = WHEELS.map(() => random() * 360);
    const opposite = swappedPosition(original);
    for (let move = 0; move < 100; move++) {
      const context = `fixture ${fixture}, movement ${move}`;
      const legal = allowedWheels(original);
      assert.deepEqual(allowedWheels(opposite), legal, context);
      const wheel = legal[Math.floor(random() * legal.length)];
      const delta = (random() - 0.5) * 1440;
      const originalEvents = original.events.length;
      const oppositeEvents = opposite.events.length;
      assert.equal(rotate(original, wheel, delta), true);
      assert.equal(rotate(opposite, wheel, delta), true);
      assertPosition(opposite, swappedPosition(original), context);
      assertConserved(original);
      assertConserved(opposite);
      const expectedTransfers = original.events.slice(originalEvents).flatMap(event => event.transfers)
        .map(transfer => transferKey(transfer, true)).sort();
      const actualTransfers = opposite.events.slice(oppositeEvents).flatMap(event => event.transfers)
        .map(transfer => transferKey(transfer)).sort();
      assert.deepEqual(actualTransfers, expectedTransfers, `${context}: all atomic transfers`);
      if (original.verdict) {
        assert.equal(opposite.verdict.winner, swappedWinner(original.verdict.winner));
        assert.equal(opposite.verdict.reason, original.verdict.reason);
        assertPosition(opposite.verdict.snapshot, swappedPosition(original.verdict.snapshot), `${context}: verdict`);
      } else assert.equal(opposite.verdict, null);
      assert.equal(endTurn(original), true);
      assert.equal(endTurn(opposite), true);
      assertPosition(opposite, swappedPosition(original), `${context}: next turn`);
    }
  }
});

test('simultaneous terminal batches exchange winners and preserve draws under a face swap', () => {
  const cases = [
    { before: [[1, 2, 3, 4], [1, 2, 3]], batches: [[5], [4]] },
    { before: [[1, 2, 3, 4], [1, 2, 3, 4]], batches: [[5], [5]] },
    { before: [[], []], batches: [[2], [2]] },
    { before: [[1, 2, 3, 4], []], batches: [[5], [2]] },
    { before: [[1], [1]], batches: [[2], [2]] },
  ];
  for (const { before, batches } of cases) {
    const verdict = adjudicateExitBatch(before, batches, 5);
    const opposite = adjudicateExitBatch([...before].reverse(), [...batches].reverse(), 5);
    if (!verdict) assert.equal(opposite, null);
    else {
      assert.equal(opposite.winner, swappedWinner(verdict.winner));
      assert.equal(opposite.reason, verdict.reason);
    }
  }
});
