import test from 'node:test';
import assert from 'node:assert/strict';
import { ROTATION_STEP, mechanicalDetents, rotationDetentDelta } from '../src/detents.js';
import { createGame, rotate, endTurn } from '../src/engine.js';
import {
  GEOMETRY_VERSION, SUPPORTED_GEOMETRY_VERSIONS, WHEELS, inputGates, OUTPUT_GATE,
  wheelsFor, angularDistance, gates, normalizeAngle, physicalAngleFor,
} from '../src/geometry.js';
import { tokenTotal } from '../src/tokens.js';

const EPSILON = 1e-7;
const emptyGame = (version = GEOMETRY_VERSION) => {
  const game = createGame(['A', 'B'], 0, version);
  for (const face of game.faces) {
    face.queue = [];
    face.slots = WHEELS.map(wheel => Array(wheel.notches).fill(null));
  }
  return game;
};

function moveTo(game, wheelId, target, direction) {
  for (let count = 0; count < 200; count += 1) {
    if (angularDistance(game.angles[wheelId - 1], target) <= EPSILON) return;
    const delta = rotationDetentDelta(wheelId, game.angles[wheelId - 1], direction, game.geometryVersion);
    assert.ok(delta * direction > 0 && Math.abs(delta) <= ROTATION_STEP);
    assert.equal(rotate(game, wheelId, delta), true);
  }
  assert.fail(`Roue ${wheelId} : arrêt ${target} inaccessible dans le sens ${direction}`);
}

test('mechanical stops contain every entrance, exit and link on both faces', () => {
  assert.equal(ROTATION_STEP, 6);
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const wheel of wheelsFor(version)) {
    const stops = mechanicalDetents(wheel.id, version);
    assert.ok(Object.isFrozen(stops));
    assert.ok(stops.length > 0);
    assert.ok(stops.every((stop, index) => stop >= 0 && stop < 360 && (index === 0 || stop > stops[index - 1] + EPSILON)));
    for (const face of [0, 1]) {
      const localGates = gates(face).flatMap(gate => [
        ...(gate.from === wheel.id ? [gate.sourceAngle] : []),
        ...(gate.to === wheel.id ? [gate.targetAngle] : []),
      ]);
      if (wheel.id === 1) localGates.push(...inputGates(version));
      if (wheel.id === 5) localGates.push(OUTPUT_GATE);
      for (const gate of localGates) for (let notch = 0; notch < wheel.notches; notch += 1) {
        const target = physicalAngleFor(face, wheel.id, notch, gate, version);
        assert.ok(stops.some(stop => angularDistance(stop, target) <= EPSILON));
      }
    }
  }
});

test('a revolution from neutral reaches every exact stop in both directions without stalling', () => {
  for (const wheel of WHEELS) for (const direction of [-1, 1]) {
    let angle = 0;
    let travelled = 0;
    const reached = [];
    for (let count = 0; travelled < 360 && count < 200; count += 1) {
      const delta = rotationDetentDelta(wheel.id, angle, direction);
      assert.ok(delta * direction > EPSILON && Math.abs(delta) <= ROTATION_STEP);
      travelled += Math.abs(delta);
      angle = normalizeAngle(angle + delta);
      reached.push(angle);
    }
    assert.ok(travelled >= 360 && travelled < 366);
    for (const stop of mechanicalDetents(wheel.id)) {
      assert.ok(reached.some(angle => angularDistance(angle, stop) <= EPSILON), `Roue ${wheel.id}, sens ${direction}, arrêt ${stop}`);
    }
  }
});

test('each step stops at the first gate encountered and an aligned wheel can leave it', () => {
  for (const wheel of WHEELS) for (const stop of mechanicalDetents(wheel.id)) for (const direction of [-1, 1]) {
    const start = normalizeAngle(stop - direction * .25);
    const delta = rotationDetentDelta(wheel.id, start, direction);
    assert.ok(Math.abs(delta - direction * .25) < EPSILON);
    const leaving = rotationDetentDelta(wheel.id, stop, direction);
    assert.ok(leaving * direction > EPSILON && Math.abs(leaving) <= ROTATION_STEP);
  }
});

test('wraparound and direction reversal choose the nearest forward stop', () => {
  for (const wheel of WHEELS) for (const angle of [-720.37, -.1, 0, 359.9, 720.37]) for (const direction of [-1, 1]) {
    const distances = mechanicalDetents(wheel.id)
      .map(stop => normalizeAngle(direction * (stop - normalizeAngle(angle))))
      .filter(distance => distance > EPSILON);
    const expected = direction * Math.min(ROTATION_STEP, ...distances);
    assert.ok(Math.abs(rotationDetentDelta(wheel.id, angle, direction) - expected) < EPSILON);
  }
});

test('an off-grid saved angle advances directly without rounding or teleporting', () => {
  for (const wheel of WHEELS) for (const angle of [12.345678, 57.125, 359.987654]) for (const direction of [-1, 1]) {
    const delta = rotationDetentDelta(wheel.id, angle, direction);
    assert.ok(delta * direction > EPSILON && Math.abs(delta) <= ROTATION_STEP);
    const finish = normalizeAngle(angle + delta);
    if (Math.abs(delta) < ROTATION_STEP) assert.ok(mechanicalDetents(wheel.id).some(stop => angularDistance(stop, finish) <= EPSILON));
    else assert.equal(delta, direction * ROTATION_STEP);
  }
});

test('invalid wheel ids, angles and directions are safe no-ops', () => {
  for (const id of [0, -1, 6, 1.5, '1', null, NaN]) {
    assert.deepEqual(mechanicalDetents(id), []);
    assert.equal(rotationDetentDelta(id, 0, 1), 0);
  }
  for (const angle of [NaN, Infinity, -Infinity, '0']) assert.equal(rotationDetentDelta(1, angle, 1), 0);
  for (const direction of [0, NaN, Infinity, '1']) assert.equal(rotationDetentDelta(1, 0, direction), 0);
});

for (const face of [0, 1]) {
  test(`face ${face}: every source and receiver notch transfers after preparation using detents only`, () => {
    for (const gate of gates(face)) for (const direction of [-1, 1]) {
      for (let source = 0; source < WHEELS[gate.from - 1].notches; source += 1) {
        for (let receiver = 0; receiver < WHEELS[gate.to - 1].notches; receiver += 1) {
          const game = emptyGame();
          const sourceAngle = physicalAngleFor(face, gate.from, source, gate.sourceAngle);
          const receiverAngle = physicalAngleFor(face, gate.to, receiver, gate.targetAngle);
          moveTo(game, gate.from, sourceAngle, direction);
          assert.equal(endTurn(game), true);
          moveTo(game, gate.to, receiverAngle, direction);
          // Approach this particular empty notch from outside the tolerance;
          // a whole revolution with a waiting token could legitimately load
          // a different receiver notch before this one reaches its gate.
          let backedAway = 0;
          while (backedAway < 12) {
            const delta = rotationDetentDelta(gate.to, game.angles[gate.to - 1], -direction);
            assert.equal(rotate(game, gate.to, delta), true);
            backedAway += Math.abs(delta);
          }
          game.faces[face].slots[gate.from - 1][source] = 1;
          moveTo(game, gate.to, receiverAngle, direction);
          assert.ok(game.events.some(event => event.transfers.some(transfer => transfer.face === face && transfer.token === 1
            && transfer.from.wheel === gate.from && transfer.from.notch === source
            && transfer.to.wheel === gate.to && transfer.to.notch === receiver)), `${gate.from}→${gate.to}, encoches ${source}/${receiver}, sens ${direction}`);
        }
      }
    }
  });

  test(`face ${face}: every loading port and exit notch work using versioned detents only`, () => {
    for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const direction of [-1, 1]) {
      for (const [lane, gate] of inputGates(version).entries()) {
        const entrance = emptyGame(version);
        const token = lane * tokenTotal(version) / inputGates(version).length + 1;
        entrance.faces[face].queue = [token];
        moveTo(entrance, 1, physicalAngleFor(face, 1, 0, gate, version), direction);
        assert.equal(entrance.faces[face].queue.length, 0);
        assert.equal(entrance.faces[face].slots[0][0], token);
      }
      for (let notch = 0; notch < WHEELS[4].notches; notch += 1) {
        const exit = emptyGame(version);
        exit.faces[face].slots[4][notch] = 1;
        moveTo(exit, 5, physicalAngleFor(face, 5, notch, OUTPUT_GATE, version), direction);
        assert.deepEqual(exit.faces[face].exited, [1]);
      }
    }
  });
}
