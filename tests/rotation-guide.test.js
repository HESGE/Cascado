import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, rotate } from '../src/engine.js';
import {
  SUPPORTED_GEOMETRY_VERSIONS, GEOMETRY_VERSION, gates, wheelsFor,
  physicalAngleFor, notchAngle, angularDistance, normalizeAngle, inputGates, OUTPUT_GATE,
} from '../src/geometry.js';
import { openingOverlap } from '../src/openings.js';
import {
  rotationGuideStops, createRotationGuide, advanceRotationGuide, finishRotationGuide,
} from '../src/rotation-guide.js';

const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

function setup(faceIndex = 0, companionOffset = 0, version = GEOMETRY_VERSION) {
  const game = createGame(['A', 'B'], faceIndex, version);
  game.faces[1 - faceIndex].queue = [];
  game.faces[faceIndex].queue = game.faces[faceIndex].queue.filter(token => token !== 1);
  game.faces[faceIndex].slots[0][0] = 1;
  const gate = gates(faceIndex)[0];
  game.angles[1] = physicalAngleFor(faceIndex, 2, 0, gate.targetAngle + companionOffset, version);
  const view = getView(game, faceIndex);
  const stop = rotationGuideStops(view, 1).find(target => target.portIds.includes('1-2-source'));
  return { game, gate, stop };
}

function place(game, wheel, physical) {
  game.angles[wheel - 1] = normalizeAngle(physical);
  return createRotationGuide(getView(game, game.active), wheel);
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

test('guidance reads only own geometric inputs, not tokens, player identities or hidden data', () => {
  const view = getView(createGame(), 0);
  const ownGeometry = deepFreeze({ faceIndex: view.faceIndex, geometryVersion: view.geometryVersion, angles: [...view.angles] });
  const guarded = { ...ownGeometry };
  for (const key of ['slots', 'queue', 'queues', 'exited', 'verdict', 'opponent', 'events', 'name', 'allowedWheels']) {
    Object.defineProperty(guarded, key, { get() { throw new Error(`Private/non-geometric read: ${key}`); } });
  }
  assert.deepEqual(rotationGuideStops(guarded, 2), rotationGuideStops(ownGeometry, 2));
  const before = JSON.stringify(ownGeometry);
  const state = createRotationGuide(guarded, 2);
  advanceRotationGuide(state, 19);
  finishRotationGuide(state);
  assert.equal(JSON.stringify(ownGeometry), before);
});

test('invalid faces, wheels, versions and angle arrays fail before creating a guide', () => {
  const view = getView(createGame(), 0);
  for (const faceIndex of [undefined, -1, 2, '0']) assert.throws(() => rotationGuideStops({ ...view, faceIndex }, 1));
  for (const wheel of [0, 6, '1', 1.5]) assert.throws(() => createRotationGuide(view, wheel));
  assert.throws(() => createRotationGuide({ ...view, geometryVersion: 'future' }, 1));
  for (const angles of [null, [1], [0, 0, NaN, 0, 0]]) assert.throws(() => createRotationGuide({ ...view, angles }, 1));
});

for (const faceIndex of [0, 1]) {
  test(`face ${faceIndex}: a rough 23-degree movement completes an actually open 25-degree transfer`, () => {
    const { game, stop } = setup(faceIndex, 1);
    assert.equal(stop.kind, 'paired');
    assert.ok(stop.portIds.includes('1-2-source') && stop.portIds.includes('1-2-receiver'));
    const state = place(game, 1, stop.angle - 25);
    const otherAngles = game.angles.slice(1);
    const delta = advanceRotationGuide(state, 23);
    close(delta, 25);
    assert.equal(state.activeStop.kind, 'paired');
    assert.equal(rotate(game, 1, delta), true);
    assert.deepEqual(game.angles.slice(1), otherAngles, 'guidance never rotates the companion');
    assert.ok(game.events.some(event => event.transfers.some(transfer =>
      transfer.face === faceIndex && transfer.token === 1 && transfer.from.wheel === 1 && transfer.to.wheel === 2)));
  });

  test(`face ${faceIndex}: a closed receiver gets only a preparation stop and cannot transfer`, () => {
    const { game, gate, stop } = setup(faceIndex, 60);
    assert.equal(stop.kind, 'preparation');
    assert.deepEqual(stop.portIds, ['1-2-source']);
    const exactOwn = physicalAngleFor(faceIndex, 1, 0, gate.sourceAngle, game.geometryVersion);
    assert.ok(angularDistance(stop.angle, exactOwn) < 1e-7);
    const state = place(game, 1, stop.angle - 25);
    const delta = advanceRotationGuide(state, 23);
    assert.equal(rotate(game, 1, delta), true);
    assert.equal(game.faces[faceIndex].slots[0][0], 1);
    assert.equal(game.events.some(event => event.transfers.some(transfer => transfer.from.wheel === 1 && transfer.to.wheel === 2)), false);
  });

  test(`face ${faceIndex}: a real release centres a nearby passage, including a slight overshoot`, () => {
    const { game, stop } = setup(faceIndex, 0);
    let state = place(game, 1, stop.angle - 30);
    assert.equal(finishRotationGuide(state), 0);
    const delta = advanceRotationGuide(state, 18);
    assert.ok(delta > 18 && delta < 25, 'continuous attraction already helps before the plateau');
    const finishing = finishRotationGuide(state);
    assert.ok(finishing > 0 && finishing < 14);
    close(state.appliedAngle, state.activeStop.angle);
    close(delta + finishing, 30);
    assert.equal(finishRotationGuide(state), 0, 'release is idempotent');
    assert.equal(advanceRotationGuide(state, 1), 0, 'a released guide cannot accept more samples');

    state = place(game, 1, stop.angle - 30);
    const overshoot = advanceRotationGuide(state, 42);
    assert.ok(state.appliedAngle > stop.angle || state.appliedAngle > stop.angle + 359);
    const correction = finishRotationGuide(state);
    assert.ok(correction < 0 && correction > -14, 'a small return centres a slightly passed target');
    close(overshoot + correction, 30);
    close(state.appliedAngle, state.activeStop.angle);
    assert.equal(finishRotationGuide(state), 0, 'a centred release remains idempotent');

    state = place(game, 1, stop.angle - 30);
    advanceRotationGuide(state, 48);
    const beyond = state.appliedAngle;
    assert.equal(finishRotationGuide(state), 0, 'deliberately continuing beyond the field keeps the wheel free');
    close(state.appliedAngle, beyond);
  });
}

test('taking hold of an off-center saved angle does not seat it, and moving away never recoils', () => {
  const { game, stop } = setup();
  const state = place(game, 1, stop.angle + 3);
  const before = JSON.stringify(state);
  assert.equal(advanceRotationGuide(state, 0), 0);
  assert.equal(finishRotationGuide(state), 0);
  assert.equal(JSON.stringify(state), before);
  close(advanceRotationGuide(state, .25), .25);
  assert.equal(state.activeStop, null);
  close(advanceRotationGuide(state, .25), .25);
  const movedAway = state.appliedAngle;
  assert.equal(finishRotationGuide(state), 0, 'letting go while moving away does not drag the saved angle backwards');
  close(state.appliedAngle, movedAway);
  const reversed = place(game, 1, stop.angle + 3);
  advanceRotationGuide(reversed, .5);
  assert.ok(advanceRotationGuide(reversed, -1) <= 0, 'a genuine reversal can then attract toward the target');
});

test('wide plateaus hold against jitter but accumulated movement always escapes in either direction', () => {
  for (const direction of [-1, 1]) {
    const { game, stop } = setup();
    const state = place(game, 1, stop.angle);
    for (let index = 0; index < 40; index++) assert.equal(advanceRotationGuide(state, direction * .1), 0);
    const seated = state.appliedAngle;
    let moved = false;
    for (let index = 0; index < 150; index++) {
      const delta = advanceRotationGuide(state, direction * .1);
      assert.ok(delta * direction >= -1e-7);
      moved ||= Math.abs(delta) > 1e-7;
    }
    assert.equal(moved, true);
    assert.ok((state.appliedAngle - seated) * direction > 10, 'the guide never permanently locks a wheel');
  }
});

test('the seated visual clears on leaving its plateau while cue hysteresis survives small reversals', () => {
  const { game, stop } = setup();
  const state = place(game, 1, stop.angle - 20);
  advanceRotationGuide(state, 18);
  assert.ok(state.activeStop);
  assert.equal(state.arrivalCount, 1);
  advanceRotationGuide(state, 8);
  assert.equal(state.activeStop, null, 'the wheel is no longer exactly seated');
  assert.ok(state.arrivalLatch, 'leaving the plateau alone does not rearm the cue');
  advanceRotationGuide(state, -2);
  assert.ok(state.activeStop);
  assert.equal(state.arrivalCount, 1, 'a small reversal cannot announce another arrival');
  advanceRotationGuide(state, 12);
  assert.equal(state.arrivalLatch, null);
  advanceRotationGuide(state, -13);
  assert.ok(state.activeStop);
  assert.equal(state.arrivalCount, 2, 'leaving the entire field permits a genuine new arrival');
});

test('all profiles and both faces keep monotone physical sweeps and complete unwrapped revolutions', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const faceIndex of [0, 1]) {
    const game = createGame(['A', 'B'], faceIndex, version);
    game.angles = [19, 71, 123, 201, 299];
    for (const wheel of wheelsFor(version)) {
      const stops = rotationGuideStops(getView(game, faceIndex), wheel.id);
      assert.ok(stops.length > 0);
      assert.ok(stops.every(stop => stop.radius > 0 && stop.radius <= 14 && stop.plateau > 0 && stop.plateau <= 5));
      const initial = stops[0].angle;
      const state = place(game, wheel.id, initial);
      let applied = 0;
      for (let index = 0; index < 2160; index++) {
        const delta = advanceRotationGuide(state, .5);
        assert.ok(delta >= -1e-7, `${version}, face ${faceIndex}, wheel ${wheel.id}: recoil`);
        applied += delta;
      }
      close(state.rawAngle, initial + 1080);
      close(applied, 1080);
      for (let index = 0; index < 2160; index++) {
        const delta = advanceRotationGuide(state, -.5);
        assert.ok(delta <= 1e-7);
        applied += delta;
      }
      close(state.rawAngle, initial);
      close(applied, 0);
      assert.ok(state.activeStop);
    }
  }
});

test('paired stops are real common opening windows even with an off-center fixed companion', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const faceIndex of [0, 1]) {
    const { game, gate, stop } = setup(faceIndex, 1, version);
    assert.equal(stop.kind, 'paired');
    game.angles[0] = stop.angle;
    assert.ok(openingOverlap(1, notchAngle(faceIndex, 1, 0, game.angles[0], version), gate.sourceAngle,
      2, notchAngle(faceIndex, 2, 0, game.angles[1], version), gate.targetAngle));
    assert.ok(stop.radius >= 12 && stop.plateau >= 4, 'paired targets retain a useful capture field');
  }
});

test('every link can guide either its source or its receiver on both faces and every profile', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const faceIndex of [0, 1]) {
    const wheels = wheelsFor(version);
    for (const gate of gates(faceIndex)) for (const movingId of [gate.from, gate.to]) {
      const game = createGame(['A', 'B'], faceIndex, version);
      game.angles = [19, 71, 123, 201, 299];
      const sourceMoves = movingId === gate.from;
      const companionId = sourceMoves ? gate.to : gate.from;
      const companionGate = sourceMoves ? gate.targetAngle : gate.sourceAngle;
      game.angles[companionId - 1] = physicalAngleFor(faceIndex, companionId, 0, companionGate + 1, version);
      const portId = `${gate.from}-${gate.to}-${sourceMoves ? 'source' : 'receiver'}`;
      const stops = rotationGuideStops(getView(game, faceIndex), movingId).filter(stop => stop.portIds.includes(portId));
      const valid = stops.some(stop => {
        const angles = [...game.angles];
        angles[movingId - 1] = stop.angle;
        for (let source = 0; source < wheels[gate.from - 1].notches; source++) {
          for (let receiver = 0; receiver < wheels[gate.to - 1].notches; receiver++) {
            if (openingOverlap(gate.from, notchAngle(faceIndex, gate.from, source, angles[gate.from - 1], version), gate.sourceAngle,
              gate.to, notchAngle(faceIndex, gate.to, receiver, angles[gate.to - 1], version), gate.targetAngle)) return true;
          }
        }
        return false;
      });
      assert.ok(valid, `${version}, face ${faceIndex}: ${portId} must reach an actual common opening`);
    }
  }
});

test('every retained notch centre lies on its fixed passage axis, without an averaged compromise', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const faceIndex of [0, 1]) {
    const wheels = wheelsFor(version);
    for (const gate of gates(faceIndex)) for (const movingId of [gate.from, gate.to]) for (const offset of [-6, 6]) {
      const game = createGame(['A', 'B'], faceIndex, version);
      game.angles = [19, 71, 123, 201, 299];
      const sourceMoves = movingId === gate.from;
      const companionId = sourceMoves ? gate.to : gate.from;
      const companionGate = sourceMoves ? gate.targetAngle : gate.sourceAngle;
      game.angles[companionId - 1] = physicalAngleFor(faceIndex, companionId, 0, companionGate + offset, version);
      const axes = new Map();
      for (const link of gates(faceIndex)) {
        if (link.from === movingId) axes.set(`${link.from}-${link.to}-source`, link.sourceAngle);
        if (link.to === movingId) axes.set(`${link.from}-${link.to}-receiver`, link.targetAngle);
      }
      if (movingId === 1) {
        const inputs = inputGates(version);
        inputs.forEach((angle, lane) => axes.set(inputs.length > 1 ? `input-${lane}` : 'input', angle));
      }
      if (movingId === 5) axes.set('output', OUTPUT_GATE);
      for (const stop of rotationGuideStops(getView(game, faceIndex), movingId)) {
        const ownPorts = stop.portIds.filter(port => axes.has(port));
        assert.ok(ownPorts.length > 0, 'every stop identifies the moving wheel’s actual passage');
        for (const port of ownPorts) {
          const centred = Array.from({ length: wheels[movingId - 1].notches }, (_, notch) =>
            angularDistance(notchAngle(faceIndex, movingId, notch, stop.angle, version), axes.get(port)))
            .some(distance => distance < 1e-7);
          assert.ok(centred, `${version}, face ${faceIndex}, wheel ${movingId}, ${port}: opening must be exactly centred`);
        }
      }
    }
  }
});

test('release centres a slightly passed opening in both directions without moving its companion or duplicating tokens', () => {
  for (const faceIndex of [0, 1]) for (const direction of [-1, 1]) {
    const { game, stop, gate } = setup(faceIndex, 1);
    const state = place(game, 1, stop.angle - direction * 30);
    const companionAngles = [...game.angles.slice(1)];
    const moving = advanceRotationGuide(state, direction * 38);
    assert.equal(rotate(game, 1, moving), true);
    const seating = finishRotationGuide(state);
    assert.ok(seating * direction < 0, 'release corrects the small overshoot');
    assert.equal(rotate(game, 1, seating), true);
    close(angularDistance(notchAngle(faceIndex, 1, 0, game.angles[0], game.geometryVersion), gate.sourceAngle), 0);
    assert.deepEqual(game.angles.slice(1), companionAngles);
    const face = game.faces[faceIndex];
    const tokens = [...face.queue, ...face.slots.flat().filter(token => token !== null), ...face.exited];
    assert.deepEqual(tokens.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(game.events.flatMap(event => event.transfers).filter(transfer =>
      transfer.face === faceIndex && transfer.token === 1 && transfer.from.wheel === 1).length, 1);
  }
});

test('input and output stops expose their own port IDs without inspecting queues', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const view = getView(createGame(['A', 'B'], 0, version), 0);
    const inputs = rotationGuideStops(view, 1).filter(stop => stop.kind === 'input');
    assert.ok(inputs.length > 0);
    assert.ok(inputs.every(stop => stop.portIds.every(id => id.startsWith('input'))));
    for (const stop of inputs) {
      assert.ok(inputGates(version).some(angle =>
        angularDistance(notchAngle(0, 1, 0, stop.angle, version), angle) < 1e-7));
    }
    const outputs = rotationGuideStops(view, 5).filter(stop => stop.kind === 'output');
    assert.equal(outputs.length, 5);
    assert.ok(outputs.every(stop => stop.portIds.includes('output')));
    assert.ok(outputs.every(stop => Array.from({ length: wheelsFor(version)[4].notches }, (_, notch) =>
      angularDistance(notchAngle(0, 5, notch, stop.angle, version), OUTPUT_GATE)).some(distance => distance < 1e-7)));
  }
});
