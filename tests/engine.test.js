import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame as createVersionedGame, allowedWheels, rotate, endTurn, getView, adjudicateExitBatch, upgradeGameGeometry } from '../src/engine.js';
import {
  BOARD, WHEELS, LINKS, INPUT_GATE, OUTPUT_GATE, angularDistance,
  GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS, wheelsFor,
  centerFor, gates, notchAngle as versionedNotchAngle,
  physicalAngleFor as versionedPhysicalAngleFor, slotPosition as versionedSlotPosition,
} from '../src/geometry.js';

// Preserve the established passage/migration fixtures on their original profile.
const createGame = (players, starter) => createVersionedGame(players, starter, LEGACY_GEOMETRY_VERSION);
const notchAngle = (...args) => versionedNotchAngle(...args, LEGACY_GEOMETRY_VERSION);
const physicalAngleFor = (...args) => versionedPhysicalAngleFor(...args, LEGACY_GEOMETRY_VERSION);
const slotPosition = (...args) => versionedSlotPosition(...args, LEGACY_GEOMETRY_VERSION);

test('new games use video-derived v1.5 while both prior profiles remain available', () => {
  assert.equal(GEOMETRY_VERSION, 'ddc-v1.5');
  assert.equal(createVersionedGame().geometryVersion, GEOMETRY_VERSION);
  assert.equal(createGame().geometryVersion, LEGACY_GEOMETRY_VERSION);
  assert.deepEqual(wheelsFor().map(wheel => wheel.delta), [75, 90, 90, 20, 15]);
  assert.deepEqual(wheelsFor(PREVIOUS_GEOMETRY_VERSION).map(wheel => wheel.delta), [180, 60, 90, 45, 36]);
  assert.deepEqual(wheelsFor(LEGACY_GEOMETRY_VERSION).map(wheel => wheel.delta), [90, 36, 45, 45, 36]);
  for (const version of ['ddc-v1', 'unknown', null]) {
    assert.throws(() => wheelsFor(version), RangeError);
    assert.throws(() => createVersionedGame(['A', 'B'], 0, version), RangeError);
  }
});

test('all three saved profiles never change their mechanical profile on load', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const game = createVersionedGame(['A', 'B'], 1, version);
    rotate(game, 1, 220);
    const before = structuredClone(game);
    assert.equal(upgradeGameGeometry(game), false);
    assert.deepEqual(game, before);
    assert.equal(getView(game, 1).geometryVersion, version);
    assert.deepEqual(getView(game, 1).angles, game.angles.map((angle, index) =>
      versionedNotchAngle(1, index + 1, 0, angle, version)));
  }
});

function emptyGame() {
  const state = createGame();
  for (const face of state.faces) {
    face.queue = [];
    face.exited = [];
    face.slots = WHEELS.map(({ notches }) => Array(notches).fill(null));
  }
  return state;
}

function placeAtGate(state, faceIndex, wheelId, notch, localAngle, token) {
  state.angles[wheelId - 1] = physicalAngleFor(faceIndex, wheelId, notch, localAngle);
  state.faces[faceIndex].slots[wheelId - 1][notch] = token;
}

// Independent circle-cut oracle: a centred U28 retains twenty clear units
// until its opposite rim reaches tangent coordinate -6.
function clearWidthLimit(wheelId) {
  const radius = WHEELS[wheelId - 1].radius;
  return (Math.asin(14 / radius) + Math.asin(-6 / radius)) * 180 / Math.PI;
}

function assertConserved(state) {
  for (const face of state.faces) {
    const tokens = [...face.queue, ...face.slots.flat().filter((token) => token !== null), ...face.exited];
    assert.deepEqual(tokens.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  }
}

test('ddc-v1.3 keeps mirrored centres, U28 profiles, seats and six descending links', () => {
  assert.deepEqual(WHEELS.map(({ notches }) => notches), [1, 3, 2, 4, 5]);
  assert.deepEqual(WHEELS.map(({ seatRadius }) => seatRadius), [33, 43, 32, 50, 58]);
  assert.equal(LINKS.length, 6);
  for (const wheel of WHEELS) {
    assert.equal(centerFor(0, wheel.id).x + centerFor(1, wheel.id).x, BOARD.width);
    assert.equal(centerFor(0, wheel.id).y, centerFor(1, wheel.id).y);
    assert.equal('epsilon' in wheel, false);
    for (const face of [0, 1]) {
      const point = slotPosition(face, wheel.id, 0, 0);
      const center = centerFor(face, wheel.id);
      assert.ok(Math.abs(Math.hypot(point.x - center.x, point.y - center.y) - wheel.seatRadius) < 1e-10);
    }
  }
  for (const link of gates(0)) {
    assert.ok(centerFor(0, link.to).y > centerFor(0, link.from).y);
    const mirror = gates(1).find(({ from, to }) => from === link.from && to === link.to);
    assert.ok(angularDistance(mirror.sourceAngle, 180 - link.sourceAngle) < 1e-10);
  }
});

test('legacy v1.3 neutral game keeps both queues intact and both entries closed', () => {
  const state = createGame(['A', 'B'], 1);
  assert.equal(state.active, 1);
  assert.equal(state.geometryVersion, 'ddc-v1.3');
  assert.deepEqual(state.angles, [0, 0, 0, 0, 0]);
  assert.deepEqual(state.faces.map(({ queue }) => queue), [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
  for (const face of [0, 1]) {
    const visibleOpeningLimit = clearWidthLimit(1);
    assert.ok(angularDistance(notchAngle(face, 1, 0, 0), INPUT_GATE) > visibleOpeningLimit);
  }
  assert.equal(endTurn(state), false);
  assertConserved(state);
});

for (const version of ['ddc-v1', 'ddc-v1.1', 'ddc-v1.2']) {
  test(`${version} save adopts the clear-width passage rule without moving tokens or rewriting a verdict`, () => {
    const state = createGame();
    rotate(state, 1, 220);
    state.geometryVersion = version;
    state.verdict = { winner: 1, reason: 'order', snapshot: { angles: [1, 2, 3, 4, 5] } };
    const before = structuredClone(state);
    assert.equal(upgradeGameGeometry(state), true);
    assert.deepEqual(state, { ...before, geometryVersion: 'ddc-v1.3' });
    assert.equal(upgradeGameGeometry(state), false);
    state.geometryVersion = 'future-unknown';
    assert.throws(() => upgradeGameGeometry(state), /incompatible/);
  });
}

for(const face of [0,1]){
  test(`face ${face}: entrance and exit require twenty clear units from the U28 mouth`,()=>{
    for (const wheelId of [1, 5]) {
      const limit = clearWidthLimit(wheelId);
      for (const side of [-1, 1]) {
        for (const margin of [-0.1, 0.1]) {
          const inside = margin < 0;
          const offset = side * (limit + margin);
          const state = emptyGame();
          if (wheelId === 1) {
            state.faces[face].queue = [1];
            state.angles[0] = physicalAngleFor(face, 1, 0, INPUT_GATE + offset);
          } else placeAtGate(state, face, 5, 0, OUTPUT_GATE + offset, 1);
          rotate(state, wheelId, 0.001);
          if (wheelId === 1) {
            assert.equal(state.faces[face].slots[0][0], inside ? 1 : null, `entry ${offset}°`);
            assert.deepEqual(state.faces[face].queue, inside ? [] : [1]);
          } else assert.deepEqual(state.faces[face].exited, inside ? [1] : [], `exit ${offset}°`);
        }
      }
    }
  });
  test(`face ${face}: all six links use twenty clear units and reject narrower mouths`,()=>{
    for(const link of gates(face)){
      for(const offsetWheel of ['source','receiver']){
        const id = offsetWheel === 'source' ? link.from : link.to;
        const limit = clearWidthLimit(id);
        for(const offset of [-limit - 0.1, -limit + 0.1, limit - 0.1, limit + 0.1]){
          const state=emptyGame();
          placeAtGate(state,face,link.from,0,link.sourceAngle+(offsetWheel==='source'?offset:0),1);
          state.angles[link.to-1]=physicalAngleFor(face,link.to,0,link.targetAngle+(offsetWheel==='receiver'?offset:0));
          rotate(state,link.from,0.001);
          const inside=Math.abs(offset)<limit;
          assert.equal(state.faces[face].slots[link.from-1][0],inside?null:1,`${link.from}→${link.to} ${offsetWheel} ${offset}°`);
          const passage = state.events.flatMap(event => event.transfers).find(transfer =>
            transfer.face === face && transfer.from.wheel === link.from && transfer.from.notch === 0
              && transfer.to.wheel === link.to && transfer.to.notch === 0 && transfer.token === 1);
          assert.equal(Boolean(passage), inside, `${link.from}→${link.to} ${offsetWheel} ${offset}°`);
          // A newly received token may immediately descend through another open
          // passage; it must still have used the tested notch and remain unique.
          assert.equal(state.faces[face].slots.flat().filter(token => token === 1).length, 1);
        }
      }
    }
  });
}

for (const face of [0, 1]) {
  test(`face ${face}: entry occurs at the analytic twenty-unit boundary and loads only queue head`, () => {
    const state = emptyGame();
    state.faces[face].queue = [1, 2, 3, 4, 5];
    const center = physicalAngleFor(face, 1, 0, INPUT_GATE);
    const limit = clearWidthLimit(1);
    state.angles[0] = center - limit - 0.01;
    rotate(state, 1, 0.005);
    assert.deepEqual(state.faces[face].queue, [1, 2, 3, 4, 5]);
    rotate(state, 1, 0.01);
    assert.equal(state.faces[face].slots[0][0], 1);
    assert.deepEqual(state.faces[face].queue, [2, 3, 4, 5]);
    assert.equal(state.events.length, 1);
    assert.ok(Math.abs(state.events[0].angle - (center - limit)) < 1e-6);
  });

  for (const link of gates(face)) {
    test(`face ${face}: ${link.from} → ${link.to} transfers into the aligned vacant notch`, () => {
      const state = emptyGame();
      placeAtGate(state, face, link.from, 0, link.sourceAngle, 3);
      state.angles[link.to - 1] = physicalAngleFor(face, link.to, 0, link.targetAngle);
      assert.equal(rotate(state, link.from, 0.001), true);
      assert.equal(state.faces[face].slots[link.from - 1][0], null);
      assert.equal(state.faces[face].slots[link.to - 1][0], 3);
      assert.equal(state.faces[1 - face].slots.flat().filter((token) => token !== null).length, 0);
    });

    test(`face ${face}: ${link.from} → ${link.to} stays closed when receiver is occupied`, () => {
      const state = emptyGame();
      placeAtGate(state, face, link.from, 0, link.sourceAngle, 1);
      placeAtGate(state, face, link.to, 0, link.targetAngle, 2);
      rotate(state, link.from, 0.001);
      assert.equal(state.faces[face].slots[link.from - 1][0], 1);
      assert.equal(state.faces[face].slots[link.to - 1][0], 2);
      assert.equal(state.events.length, 0);
    });
  }
}

test('receiver moved across its twenty-unit boundary triggers a transfer too', () => {
  for (const face of [0, 1]) {
    const state = emptyGame();
    const link = gates(face)[0];
    placeAtGate(state, face, 1, 0, link.sourceAngle, 1);
    const exact = physicalAngleFor(face, 2, 0, link.targetAngle);
    const limit = clearWidthLimit(2);
    state.angles[1] = exact - limit - 3;
    rotate(state, 2, 6);
    assert.equal(state.faces[face].slots[0][0], null);
    assert.equal(state.faces[face].slots[1][0], 1);
  }
});

test('a full revolution preserves its intermediate falls despite an identical final angle', () => {
  const state = createGame();
  rotate(state, 1, 360);
  assert.equal(state.angles[0], 0);
  assert.deepEqual(state.faces.map(({ queue }) => queue), [[2, 3, 4, 5], [2, 3, 4, 5]]);
  assert.deepEqual(state.faces.map(({ slots }) => slots[0]), [[1], [1]]);
  assertConserved(state);
  rotate(state, 1, -360);
  assert.equal(state.angles[0], 0);
  assert.deepEqual(state.faces.map(({ queue }) => queue), [[2, 3, 4, 5], [2, 3, 4, 5]]);
  assertConserved(state);
});

test('inverse movement never restores a token already transferred', () => {
  const state = emptyGame();
  const link = gates(0)[0];
  placeAtGate(state, 0, 1, 0, link.sourceAngle, 1);
  state.angles[1] = physicalAngleFor(0, 2, 0, link.targetAngle);
  rotate(state, 1, 0.5);
  rotate(state, 1, -0.5);
  assert.equal(state.faces[0].slots[0][0], null);
  assert.equal(state.faces[0].slots[1][0], 1);
});

test('identical trajectories at 30, 60 and 120 Hz produce identical batches and board states', () => {
  const results = [30, 60, 120].map((hz) => {
    const state = createGame();
    state.angles[1] = physicalAngleFor(0, 2, 0, gates(0)[0].targetAngle);
    const step = 60 / hz;
    for (let i = 0; i < 720 / step; i += 1) rotate(state, 1, step);
    return { angles: state.angles, faces: state.faces, events: state.events, verdict: state.verdict };
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.equal(results[0].faces[0].slots[1][0], 1);
  assert.equal(results[0].faces[0].slots[0][0], 2);
});

test('illegal wheel, non-finite and zero input change no state', () => {
  const state = createGame();
  state.lastWheel = 3;
  const before = structuredClone(state);
  for (const [wheel, delta] of [[3, 1], [0, 1], [6, 1], [1, 0], [1, NaN], [1, Infinity]]) {
    assert.equal(rotate(state, wheel, delta), false);
    assert.deepEqual(state, before);
  }
  assert.equal(rotate(state, 1, 0.5), true);
  assert.deepEqual(allowedWheels(state), [1]);
  const engaged = structuredClone(state);
  assert.equal(rotate(state, 2, 0.5), false);
  assert.deepEqual(state, engaged);
  assert.equal(endTurn(state), true);
  assert.equal(state.active, 1);
  assert.equal(state.turn, 2);
  assert.equal(state.lastWheel, 1);
  assert.equal(state.engaged, null);
  assert.deepEqual(allowedWheels(state), [2, 3, 4, 5]);
});

test('the last remaining token exception is local, exact, and restricted to wheel five', () => {
  const state = emptyGame();
  state.lastWheel = 5;
  state.faces[0].exited = [1, 2, 3, 4];
  state.faces[0].slots[4][0] = 5;
  assert.ok(allowedWheels(state).includes(5));
  state.faces[0].queue = [4];
  assert.ok(!allowedWheels(state).includes(5));
  state.faces[0].queue = [];
  state.faces[0].slots[4][0] = null;
  state.faces[0].slots[3][0] = 5;
  assert.ok(!allowedWheels(state).includes(5));
  state.active = 1;
  state.faces[1].queue = [1, 2, 3, 4, 5];
  assert.ok(!allowedWheels(state).includes(5));
});

test('both faces use coupled physical angles and opposite apparent directions', () => {
  const state = createGame();
  const beforeA = getView(state, 0).angles;
  const beforeB = getView(state, 1).angles;
  rotate(state, 3, 20);
  const afterA = getView(state, 0).angles;
  const afterB = getView(state, 1).angles;
  assert.equal(angularDistance(afterA[2], beforeA[2] + 20), 0);
  assert.equal(angularDistance(afterB[2], beforeB[2] - 20), 0);
});

test('simultaneous consecutive exits are validated as a batch regardless of iteration order', () => {
  assert.equal(adjudicateExitBatch([[1], []], [[3, 2], []]), null);
  const wrong = adjudicateExitBatch([[1], []], [[4, 2], []]);
  assert.equal(wrong.winner, 1);
  assert.equal(wrong.reason, 'order');
  const completed = adjudicateExitBatch([[1, 2, 3], []], [[5, 4], []]);
  assert.equal(completed.winner, 0);
  assert.equal(completed.reason, 'complete');
});

test('simultaneous terminal causes agree or draw without giving face zero priority', () => {
  const completeBoth = adjudicateExitBatch([[1, 2, 3, 4], [1, 2, 3, 4]], [[5], [5]]);
  assert.equal(completeBoth.winner, null);
  assert.equal(completeBoth.reason, 'draw');
  const wrongBoth = adjudicateExitBatch([[], []], [[2], [2]]);
  assert.equal(wrongBoth.reason, 'draw');
  const agreed = adjudicateExitBatch([[1, 2, 3, 4], []], [[5], [2]]);
  assert.equal(agreed.winner, 0);
  assert.equal(agreed.reason, 'order');
  const reversed = adjudicateExitBatch([[], [1, 2, 3, 4]], [[2], [5]]);
  assert.equal(reversed.winner, 1);
});

test('correct fifth exit takes a frozen decisive snapshot without stopping rotation or turn', () => {
  const state = emptyGame();
  state.faces[0].exited = [1, 2, 3, 4];
  placeAtGate(state, 0, 5, 0, OUTPUT_GATE, 5);
  rotate(state, 5, 4);
  assert.equal(state.verdict.winner, 0);
  assert.equal(state.verdict.reason, 'complete');
  assert.deepEqual(state.verdict.snapshot.faces[0].exited, [1, 2, 3, 4, 5]);
  assert.notEqual(state.angles[4], state.verdict.snapshot.angles[4]);
  const verdict = structuredClone(state.verdict);
  assert.equal(rotate(state, 5, 360), true);
  assert.deepEqual(state.verdict, verdict);
  assert.equal(endTurn(state), true);
});

test('hidden order failure does not change controls, and later opposing failure cannot rewrite verdict', () => {
  const state = emptyGame();
  state.faces[0].slots[4][0] = 2;
  placeAtGate(state, 1, 5, 0, OUTPUT_GATE, 2);
  rotate(state, 5, 1);
  assert.equal(state.verdict.winner, 0);
  assert.equal(state.verdict.reason, 'order');
  const verdict = structuredClone(state.verdict);
  assert.deepEqual(allowedWheels(state), [5]);
  assert.equal(rotate(state, 5, 40), true);
  assert.deepEqual(state.faces[0].exited, [2]);
  assert.deepEqual(state.verdict, verdict);
});

test('private projection contains no hidden tokens, verdict or events and cannot mutate reference state', () => {
  const state = createGame();
  const before = getView(state, 0);
  state.faces[1].queue = [];
  state.faces[1].exited = [5, 4, 3, 2, 1];
  state.verdict = { winner: 0, reason: 'order', snapshot: { secret: true } };
  state.events.push({ secret: true });
  assert.deepEqual(getView(state, 0), before);
  assert.ok(!('faces' in before));
  assert.ok(!('verdict' in before));
  assert.ok(!('events' in before));
  before.queue.shift();
  before.slots[0][0] = 99;
  before.angles[0] = 999;
  assert.equal(state.faces[0].queue.length, 5);
  assert.equal(state.faces[0].slots[0][0], null);
  assert.equal(state.angles[0], 0);
});

test('token conservation survives 300 turns with multiple revolutions and reversals after any verdict', () => {
  const state = createGame();
  let seed = 90210;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let turn = 0; turn < 300; turn += 1) {
    const allowed = allowedWheels(state);
    const wheel = allowed[Math.floor(random() * allowed.length)];
    assert.equal(rotate(state, wheel, (random() - 0.5) * 1440), true);
    assert.equal(rotate(state, wheel, (random() - 0.5) * 360), true);
    assertConserved(state);
    assert.equal(endTurn(state), true);
  }
});

for (const face of [0, 1]) {
  test(`face ${face}: a legal 40-turn trajectory delivers all five tokens in order from the initial queues`, () => {
    const state = createGame();
    const first = gates(face).find(({ from, to }) => from === 1 && to === 2);
    const middle = gates(face).find(({ from, to }) => from === 2 && to === 3);
    const last = gates(face).find(({ from, to }) => from === 3 && to === 5);
    const moveTo = (wheelId, localAngle, direction) => {
      const target = physicalAngleFor(face, wheelId, 0, localAngle);
      let delta = target - state.angles[wheelId - 1];
      if (direction > 0 && delta <= 0) delta += 360;
      if (direction < 0 && delta >= 0) delta -= 360;
      assert.ok(allowedWheels(state).includes(wheelId));
      assert.equal(rotate(state, wheelId, delta), true);
      assert.equal(endTurn(state), true);
      assertConserved(state);
    };
    for (let token = 1; token <= 5; token += 1) {
      moveTo(1, INPUT_GATE, 1);
      moveTo(2, first.targetAngle, 1);
      moveTo(1, first.sourceAngle, 1);
      moveTo(3, middle.targetAngle, 1);
      moveTo(2, middle.sourceAngle, -1);
      moveTo(5, last.targetAngle, 1);
      moveTo(3, last.sourceAngle, -1);
      moveTo(5, OUTPUT_GATE, 1);
      assert.deepEqual(state.faces[face].exited, Array.from({ length: token }, (_, index) => index + 1));
      if (token < 5) assert.equal(state.verdict, null);
    }
    assert.equal(state.turn, 41);
    assert.equal(state.verdict.winner, face);
    assert.equal(state.verdict.reason, 'complete');
    assert.deepEqual(state.verdict.snapshot.faces[face].exited, [1, 2, 3, 4, 5]);
  });
}
