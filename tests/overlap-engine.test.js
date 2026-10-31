import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame as createVersionedGame, rotate, getView, allowedWheels, upgradeGameGeometry,
} from '../src/engine.js';
import { visibleTransfers } from '../src/flow.js';
import {
  LEGACY_GEOMETRY_VERSION, WHEELS, gates,
  physicalAngleFor as versionedPhysicalAngleFor, slotPosition as versionedSlotPosition, angularDistance,
} from '../src/geometry.js';

// These passage-oracle fixtures continue to exercise saved v1.3 mechanics.
const createGame = (players, starter) => createVersionedGame(players, starter, LEGACY_GEOMETRY_VERSION);
const physicalAngleFor = (...args) => versionedPhysicalAngleFor(...args, LEGACY_GEOMETRY_VERSION);
const slotPosition = (...args) => versionedSlotPosition(...args, LEGACY_GEOMETRY_VERSION);

function emptyGame() {
  const state = createGame();
  for (const face of state.faces) {
    face.queue = [];
    face.exited = [];
    face.slots = WHEELS.map(({ notches }) => Array(notches).fill(null));
  }
  return state;
}

function orient(state, face, wheel, notch, angle) {
  state.angles[wheel - 1] = physicalAngleFor(face, wheel, notch, angle);
}

function fixture(face, gate, source = 0, target = 0, sourceOffset = 5, targetOffset = -5) {
  const state = emptyGame();
  orient(state, face, gate.from, source, gate.sourceAngle + sourceOffset);
  orient(state, face, gate.to, target, gate.targetAngle + targetOffset);
  state.faces[face].slots[gate.from - 1][source] = 1;
  return state;
}

function ownTokens(state, face) {
  return [...state.faces[face].queue, ...state.faces[face].exited,
    ...state.faces[face].slots.flat().filter(token => token !== null)].sort((a, b) => a - b);
}

// Independent fixture oracle: the SVG's rectangle cuts the wheel at y = ±14.
// Its intersection with the outer circle has x = sqrt(R² − 14²).
function visibleInterval(wheelId, offset, reversed = false) {
  const radius = WHEELS[wheelId - 1].radius;
  const angle = offset * Math.PI / 180;
  const centre = (reversed ? -1 : 1) * Math.sqrt(radius * radius - 14 * 14) * Math.sin(angle);
  const halfWidth = 14 * Math.cos(angle);
  return [Math.max(-14, centre - halfWidth), Math.min(14, centre + halfWidth)];
}

function overlapWidth(source, target) {
  return Math.min(source[1], target[1]) - Math.max(source[0], target[0]);
}

for (const face of [0, 1]) {
  test(`face ${face}: every notch pair on every link transfers through the clear ±5° overlap`, () => {
    for (const gate of gates(face)) {
      for (let source = 0; source < WHEELS[gate.from - 1].notches; source++) {
        for (let target = 0; target < WHEELS[gate.to - 1].notches; target++) {
          const state = fixture(face, gate, source, target);
          const context = `${gate.from}:${source} → ${gate.to}:${target}`;
          const overlap = overlapWidth(visibleInterval(gate.from, 5), visibleInterval(gate.to, -5, true));
          assert.ok(overlap >= 20, context);
          assert.equal(rotate(state, gate.from, 0.001), true, context);
          assert.equal(state.faces[face].slots[gate.from - 1][source], null, context);
          assert.equal(state.faces[face].slots[gate.to - 1][target], 1, context);
          assert.deepEqual(ownTokens(state, face), [1], context);
          assert.deepEqual(ownTokens(state, 1 - face), [], context);
          assert.deepEqual(state.events[0].transfers.map(({ from, to, token }) => ({ from, to, token })),
            [{ from: { wheel: gate.from, notch: source }, to: { wheel: gate.to, notch: target }, token: 1 }], context);
        }
      }
    }
  });

  test(`face ${face}: occupied receivers block every overlapping notch pair without losing tokens`, () => {
    for (const gate of gates(face)) {
      for (let source = 0; source < WHEELS[gate.from - 1].notches; source++) {
        for (let target = 0; target < WHEELS[gate.to - 1].notches; target++) {
          const state = fixture(face, gate, source, target);
          state.faces[face].slots[gate.to - 1][target] = 2;
          rotate(state, gate.from, 0.001);
          assert.equal(state.faces[face].slots[gate.from - 1][source], 1);
          assert.equal(state.faces[face].slots[gate.to - 1][target], 2);
          assert.deepEqual(ownTokens(state, face), [1, 2]);
          assert.deepEqual(state.events, []);
        }
      }
    }
  });

  test(`face ${face}: two individually open mouths do not transfer across disjoint projections`, () => {
    const gate = gates(face)[0];
    const state = fixture(face, gate, 0, 0, 20, 20);
    const source = visibleInterval(1, 20);
    const receiver = visibleInterval(2, 20, true);
    assert.ok(source[0] < source[1]);
    assert.ok(receiver[0] < receiver[1]);
    assert.ok(overlapWidth(source, receiver) < -7);
    rotate(state, 1, 0.001);
    assert.equal(state.faces[face].slots[0][0], 1);
    assert.equal(state.faces[face].slots[1][0], null);
    assert.deepEqual(state.events, []);
  });

  test(`face ${face}: narrow visible ±10° and ±20° overlaps keep every notch pair blocked`, () => {
    for (const gate of gates(face)) {
      for (const offset of [-20, -10, 10, 20]) {
        for (let source = 0; source < WHEELS[gate.from - 1].notches; source++) {
          for (let target = 0; target < WHEELS[gate.to - 1].notches; target++) {
            const state = fixture(face, gate, source, target, offset, -offset);
            const width = overlapWidth(visibleInterval(gate.from, offset), visibleInterval(gate.to, -offset, true));
            assert.ok(width > 0 && width < 20);
            rotate(state, gate.from, .001);
            assert.equal(state.faces[face].slots[gate.from - 1][source], 1);
            assert.equal(state.faces[face].slots[gate.to - 1][target], null);
            assert.deepEqual(state.events, []);
            assert.deepEqual(ownTokens(state, face), [1]);
          }
        }
      }
    }
  });

  test(`face ${face}: the former narrow 4→5 shortcut stays blocked`, () => {
    const gate = gates(face).find(item => item.from === 4 && item.to === 5);
    const mirror = face === 0 ? 1 : -1;
    const sourceOffset = -10.5 * mirror;
    const targetOffset = -13.1 * mirror;
    const state = fixture(face, gate, 0, 0, sourceOffset, targetOffset);
    const source = slotPosition(face, 4, 0, state.angles[3]);
    const receiver = slotPosition(face, 5, 0, state.angles[4]);
    assert.ok(receiver.y < source.y - 3, 'seat coordinates must expose the former false blockage');
    const width = overlapWidth(visibleInterval(4, sourceOffset), visibleInterval(5, targetOffset, true));
    assert.ok(width > 0 && width < 20);
    rotate(state, 4, 0.001);
    assert.equal(state.faces[face].slots[3][0], 1);
    assert.equal(state.faces[face].slots[4][0], null);
    assert.deepEqual(state.events, []);
    assert.deepEqual(ownTokens(state, face), [1]);
  });

  test(`face ${face}: the former thin 2→3→4 cascade does not bypass the clear-width requirement`, () => {
    const state = emptyGame();
    const first = gates(face).find(item => item.from === 2 && item.to === 3);
    const second = gates(face).find(item => item.from === 3 && item.to === 4);
    const mirror = face === 0 ? 1 : -1;
    orient(state, face, 2, 0, first.sourceAngle - 26 * mirror);
    orient(state, face, 3, 0, first.targetAngle + 34.235 * mirror);
    orient(state, face, 4, 0, second.targetAngle + 23 * mirror);
    state.faces[face].slots[1][0] = 1;
    rotate(state, 2, 0.001);
    assert.deepEqual(state.events, []);
    assert.equal(state.faces[face].slots[1][0], 1);
    assert.equal(state.faces[face].slots[2][0], null);
    assert.equal(state.faces[face].slots[3][0], null);
    assert.deepEqual(ownTokens(state, face), [1]);
    assert.equal(state.verdict, null);
  });

  test(`face ${face}: two clear independent falls retain one atomic batch and every token`, () => {
    const state = emptyGame();
    const first = gates(face).find(item => item.from === 2 && item.to === 3);
    const second = gates(face).find(item => item.from === 4 && item.to === 5);
    orient(state, face, 2, 0, first.sourceAngle);
    orient(state, face, 3, 0, first.targetAngle);
    orient(state, face, 4, 0, second.sourceAngle);
    orient(state, face, 5, 0, second.targetAngle);
    state.faces[face].slots[1][0] = 1;
    state.faces[face].slots[3][0] = 2;
    rotate(state, 2, .001);
    assert.equal(state.events.length, 1);
    assert.deepEqual(state.events[0].transfers, [
      { face, token: 1, from: { wheel: 2, notch: 0 }, to: { wheel: 3, notch: 0 } },
      { face, token: 2, from: { wheel: 4, notch: 0 }, to: { wheel: 5, notch: 0 } },
    ]);
    assert.equal(state.faces[face].slots[1][0], null);
    assert.equal(state.faces[face].slots[2][0], 1);
    assert.equal(state.faces[face].slots[3][0], null);
    assert.equal(state.faces[face].slots[4][0], 2);
    assert.deepEqual(ownTokens(state, face), [1, 2]);
    assert.deepEqual(ownTokens(state, 1 - face), []);
    assert.equal(state.verdict, null);
  });

  test(`face ${face}: a visibly open twelve-degree offset stays put until the mouth is brought close`, () => {
    const gate = gates(face)[0];
    const state = fixture(face, gate, 0, 0, 12, 0);
    const width = overlapWidth(visibleInterval(1, 12), visibleInterval(2, 0, true));
    assert.ok(width > 18 && width < 19);
    rotate(state, 1, .001);
    assert.equal(state.faces[face].slots[0][0], 1);
    assert.deepEqual(state.events, []);
    const exact = physicalAngleFor(face, 1, 0, gate.sourceAngle);
    let delta = exact - state.angles[0];
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    rotate(state, 1, delta);
    assert.equal(state.faces[face].slots[0][0], null);
    assert.equal(state.faces[face].slots[1][0], 1);
    assert.deepEqual(ownTokens(state, face), [1]);
    assert.equal(state.events.length, 1);
  });

  for (const moving of ['source', 'receiver']) {
    for (const direction of [-1, 1]) {
      test(`face ${face}: ${moving} ${direction > 0 ? 'forward' : 'reverse'} sweep has identical falls at every frame cadence`, () => {
        const results = [1, 30, 60, 120].map(frames => {
          const state = emptyGame();
          const gate = gates(face)[0];
          const wheel = moving === 'source' ? 1 : 2;
          state.faces[face].slots[0][0] = 1;
          if (moving === 'source') orient(state, face, 2, 0, gate.targetAngle);
          else orient(state, face, 1, 0, gate.sourceAngle);
          for (let frame = 0; frame < frames; frame++) rotate(state, wheel, direction * 360 / frames);
          assert.equal(state.faces[face].slots[0][0], null);
          const firstTransfer = state.events[0].transfers[0];
          assert.equal(firstTransfer.face, face);
          assert.equal(firstTransfer.token, 1);
          assert.deepEqual(firstTransfer.from, { wheel: 1, notch: 0 });
          assert.equal(firstTransfer.to.wheel, 2);
          assert.ok(Number.isInteger(firstTransfer.to.notch) && firstTransfer.to.notch >= 0
            && firstTransfer.to.notch < WHEELS[1].notches);
          assert.equal(state.faces[face].slots.slice(1).flat().filter(token => token === 1).length, 1);
          assert.deepEqual(ownTokens(state, face), [1]);
          return state;
        });
        for (const state of results.slice(1)) {
          for (let wheel = 0; wheel < WHEELS.length; wheel++) {
            assert.ok(angularDistance(state.angles[wheel], results[0].angles[wheel]) < 1e-8);
          }
          assert.deepEqual(state.faces, results[0].faces);
          assert.deepEqual(state.events, results[0].events);
          assert.deepEqual(state.verdict, results[0].verdict);
        }
      });
    }
  }
}

for (const version of ['ddc-v1', 'ddc-v1.1', 'ddc-v1.2']) {
  test(`${version} migration leaves an already overlapping token stationary until the next accepted move`, () => {
    const state = fixture(0, gates(0)[0]);
    state.geometryVersion = version;
    state.verdict = { winner: 1, reason: 'order', snapshot: { immutable: true } };
    const original = structuredClone(state);
    assert.equal(upgradeGameGeometry(state), true);
    assert.deepEqual(state, { ...original, geometryVersion: 'ddc-v1.3' });
    rotate(state, 1, 0.001);
    assert.equal(state.faces[0].slots[0][0], null);
    assert.equal(state.faces[0].slots[1][0], 1);
    assert.deepEqual(state.verdict, original.verdict);
  });
}

test('an opponent exit through the clear opening changes neither the local projection nor its audio events', () => {
  const ordinary = emptyGame();
  orient(ordinary, 1, 5, 0, 94);
  const hidden = structuredClone(ordinary);
  hidden.faces[1].slots[4][0] = 2;
  rotate(ordinary, 5, 0.001);
  rotate(hidden, 5, 0.001);
  assert.equal(hidden.verdict?.reason, 'order');
  assert.deepEqual(getView(hidden, 0), getView(ordinary, 0));
  assert.deepEqual(allowedWheels(hidden), allowedWheels(ordinary));
  assert.deepEqual(visibleTransfers(hidden.events, 0), visibleTransfers(ordinary.events, 0));
  assert.deepEqual(visibleTransfers(hidden.events, 0), []);
});

test('two narrow exit mouths stay blocked and staggered completions retain the first verdict', () => {
  const state = emptyGame();
  // At 72° both coupled mouths are eighteen degrees before the bottom gate.
  // Their exact physical stops are 90° for A and 54° for B.
  state.angles[4] = 72;
  for (const face of state.faces) {
    face.exited = [1, 2, 3, 4];
    face.slots[4][0] = 5;
  }
  rotate(state, 5, 0.001);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.faces.map(face => face.exited), [[1, 2, 3, 4], [1, 2, 3, 4]]);
  assert.equal(state.verdict, null);
  rotate(state, 5, 90 - state.angles[4]);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].transfers.length, 1);
  assert.deepEqual(state.faces.map(face => face.exited), [[1, 2, 3, 4, 5], [1, 2, 3, 4]]);
  assert.equal(state.verdict.winner, 0);
  assert.equal(state.verdict.reason, 'complete');
  const firstVerdict = structuredClone(state.verdict);
  rotate(state, 5, 54 - state.angles[4]);
  assert.deepEqual(state.faces.map(face => face.exited), [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
  assert.deepEqual(state.verdict, firstVerdict);
  assert.deepEqual(ownTokens(state, 0), [1, 2, 3, 4, 5]);
  assert.deepEqual(ownTokens(state, 1), [1, 2, 3, 4, 5]);
});
