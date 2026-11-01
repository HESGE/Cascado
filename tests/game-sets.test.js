import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame, rotate, allowedWheels, endTurn } from '../src/engine.js';
import { GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION,
  PREVIOUS_GEOMETRY_VERSION, WHEELS, wheelsFor, inputGates, boardHeightFor,
  queuePosition, trayPosition, trayEntry, normalizeAngle, angularDistance, notchAngle } from '../src/geometry.js';
import { tokenTotal, seriesCount } from '../src/tokens.js';
import { passableMouthInterval } from '../src/openings.js';
import { GAME_SETS, getGameSet, normalizeGameSetId, gameSetIdForGeometry, isValidGameSet } from '../src/game-sets.js';
import { MIROIR50_POOL_ID, MIROIR50_POSITIONS } from '../src/miroir50-positions.js';
import { MIROIR50_START_MODE, configureStartingPosition, configureGameSet, isValidStartingPosition,
  miroir50ScheduleEntry, startingAnglesForMiroir50, randomMiroir50Seed, miroir50RematchSeed } from '../src/starting-position.js';

const freshMirror = (starter = 0) => createGame(['A', 'B'], starter, MIRROR_GEOMETRY_VERSION);
const mirrorGame = (seed = 1, round = 1, starter = 0) =>
  configureStartingPosition(freshMirror(starter), { mode: MIROIR50_START_MODE, seed }, round);

test('published set identities are strict, modern geometry differs only in the five fixed phases', () => {
  assert.deepEqual(GAME_SETS.map(set => [set.id, set.label, set.geometryVersion]), [
    ['reference', 'Référence', GEOMETRY_VERSION], ['miroir-50', 'Miroir 50', MIRROR_GEOMETRY_VERSION],
  ]);
  assert.deepEqual(wheelsFor(GEOMETRY_VERSION).map(wheel => wheel.delta), [75, 90, 90, 20, 15]);
  assert.deepEqual(wheelsFor(MIRROR_GEOMETRY_VERSION).map(wheel => wheel.delta), [180, 0, 90, 45, 36]);
  for (const [index, wheel] of wheelsFor(MIRROR_GEOMETRY_VERSION).entries()) {
    const { delta: _delta, ...shape } = wheel;
    const { delta: _original, ...originalShape } = WHEELS[index];
    assert.deepEqual(shape, originalShape);
  }
  assert.equal(normalizeGameSetId(), 'reference');
  assert.equal(normalizeGameSetId('miroir-50'), 'miroir-50');
  for (const id of [null, 'Miroir 50', '', 0, {}]) {
    assert.equal(normalizeGameSetId(id), null);
    assert.throws(() => getGameSet(id), TypeError);
  }
  assert.equal(Object.isFrozen(GAME_SETS), true);
  assert.equal(Object.isFrozen(getGameSet('miroir-50')), true);
});

test('both sets use the same two entrances, ten tokens, queues, tray and modern board height', () => {
  assert.deepEqual(inputGates(MIRROR_GEOMETRY_VERSION), [210, 330]);
  assert.equal(tokenTotal(MIRROR_GEOMETRY_VERSION), 10);
  assert.equal(seriesCount(MIRROR_GEOMETRY_VERSION), 2);
  assert.equal(boardHeightFor(MIRROR_GEOMETRY_VERSION), 540);
  for (const face of [0, 1]) for (let index = 0; index < 10; index++) {
    assert.deepEqual(trayPosition(face, index, MIRROR_GEOMETRY_VERSION), trayPosition(face, index, GEOMETRY_VERSION));
  }
  for (const lane of [0, 1]) {
    for (let index = 0; index < 5; index++) assert.deepEqual(
      queuePosition(index, lane, MIRROR_GEOMETRY_VERSION), queuePosition(index, lane, GEOMETRY_VERSION));
    for (const face of [0, 1]) assert.deepEqual(
      trayEntry(face, MIRROR_GEOMETRY_VERSION, lane), trayEntry(face, GEOMETRY_VERSION, lane));
  }
  assert.deepEqual(freshMirror().faces[0].queue, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('all 50 frozen poses retain the exact independently archived pool hash and closed entrances', () => {
  // Hash of startingRule.positions in the completed 200-game research artifact,
  // calculated before this production module existed. Includes every raw float.
  assert.equal(createHash('sha256').update(JSON.stringify(MIROIR50_POSITIONS)).digest('hex'),
    'cdd7577ecf5db263c6350dc880dff3bf83ca7b0c8e6d67e801e2ef24afc420e2');
  assert.equal(MIROIR50_POSITIONS.length, 50);
  assert.equal(new Set(MIROIR50_POSITIONS.map(pose => pose.familyId)).size, 25);
  assert.equal(new Set(MIROIR50_POSITIONS.map(pose => pose.poseId)).size, 50);
  for (const pose of MIROIR50_POSITIONS) {
    assert.equal(Object.isFrozen(pose), true);
    assert.equal(Object.isFrozen(pose.angles), true);
    for (const face of [0, 1]) for (const gate of inputGates(MIRROR_GEOMETRY_VERSION)) assert.equal(
      passableMouthInterval(1, notchAngle(face, 1, 0, pose.angles[0], MIRROR_GEOMETRY_VERSION), gate), null);
  }
  for (let family = 0; family < 25; family++) {
    const [base, complement] = MIROIR50_POSITIONS.slice(family * 2, family * 2 + 2);
    assert.equal(base.familyId, complement.familyId);
    assert.equal(base.role, 'base');
    assert.equal(complement.role, 'complement');
    base.angles.forEach((angle, index) => assert.ok(angularDistance(
      angle + wheelsFor(MIRROR_GEOMETRY_VERSION)[index].delta, complement.angles[index]) < 1e-9));
  }
});

test('ordinary random selection reaches each fixed family and role once in 50 equally spaced draws', () => {
  const selected = [];
  for (let index = 0; index < 50; index++) {
    const seed = randomMiroir50Seed(() => (index + .5) / 50);
    assert.equal(seed, index);
    const pose = miroir50ScheduleEntry(seed);
    assert.equal(pose.familyId, MIROIR50_POSITIONS[(index % 25) * 2].familyId);
    assert.equal(pose.role, index < 25 ? 'base' : 'complement');
    selected.push(pose.poseId);
  }
  assert.equal(new Set(selected).size, 50);
  for (const value of [-.1, 1, 1.1, NaN, Infinity, '0', null]) assert.throws(
    () => randomMiroir50Seed(() => value), TypeError);
});

test('each 100-round block covers the frozen 50 poses with both starters, with complementary rematch pairs', () => {
  for (const seed of [0, 1, 24, 25, 49, 123, 20261101, 0xffffffff]) {
    for (let cycle = 0; cycle < 10; cycle++) {
      const cells = new Map();
      for (let index = 0; index < 100; index++) {
        const round = cycle * 100 + index + 1;
        const entry = miroir50ScheduleEntry(seed, round);
        const key = `${entry.poseId}/${entry.starterOffset}`;
        cells.set(key, (cells.get(key) ?? 0) + 1);
        assert.equal(entry.starterOffset, index % 2);
        assert.deepEqual(startingAnglesForMiroir50(seed, round), entry.angles);
        if (index % 2 === 0) {
          const rematch = miroir50ScheduleEntry(seed, round + 1);
          assert.equal(rematch.familyId, entry.familyId);
          assert.notEqual(rematch.role, entry.role);
          assert.equal(rematch.starterOffset, 1 - entry.starterOffset);
        }
      }
      assert.equal(cells.size, 100);
      assert.ok([...cells.values()].every(count => count === 1));
    }
  }
  for (const seed of [-1, 0x100000000, .5, '1', null, NaN]) assert.throws(() => miroir50ScheduleEntry(seed), TypeError);
  for (const round of [0, 1001, .5, '1', null, NaN]) assert.throws(() => miroir50ScheduleEntry(1, round), TypeError);
});

test('initial pose provenance stays fixed through play and repeated human rematches always exchange poses', () => {
  for (const seed of [0, 17, 25, 49, 20261101]) {
    let game = mirrorGame(seed, 1, 0);
    for (let rematch = 0; rematch < 6; rematch++) {
      const before = structuredClone(game.startingAngles);
      const beforePose = structuredClone(game.startingPose);
      assert.equal(isValidStartingPosition(game), true);
      rotate(game, 3, 17);
      assert.equal(isValidStartingPosition(game), true);
      assert.deepEqual(game.startingAngles, before);
      assert.deepEqual(game.startingPose, beforePose);
      const next = mirrorGame(miroir50RematchSeed(game), 1, 1 - game.active);
      assert.equal(next.startingPose.familyId, beforePose.familyId);
      assert.notEqual(next.startingPose.role, beforePose.role);
      game = next;
    }
  }
});

test('strict Miroir provenance rejects arbitrary starts, corruption, geometry/set mismatch and reconfiguration', () => {
  const neutral = freshMirror();
  assert.equal(isValidStartingPosition(neutral), false);
  for (const mode of ['classic', 'varied', 'original-v1']) {
    const game = freshMirror();
    const before = structuredClone(game);
    assert.throws(() => configureStartingPosition(game, { mode, seed: 1 }), TypeError);
    assert.deepEqual(game, before);
  }
  assert.throws(() => configureStartingPosition(createGame(), { mode: MIROIR50_START_MODE, seed: 1 }), TypeError);
  const game = mirrorGame(42, 12);
  assert.equal(isValidStartingPosition(game), true);
  assert.equal(isValidStartingPosition(game, 11), false);
  for (const mutate of [
    copy => { copy.startingAngles[0] += .01; },
    copy => { copy.startingAngles = Array(5); },
    copy => { copy.startConfig.seed++; },
    copy => { copy.startConfig.mode = 'varied'; },
    copy => { copy.startingPose.poolId = 'miroir-500-v1'; },
    copy => { copy.startingPose.familyId = 'other'; },
    copy => { copy.startingPose.poseId = 'other'; },
    copy => { copy.startingPose.role = 'base'; },
    copy => { copy.startingPose.round = 1; },
    copy => { copy.startingPose.extra = true; },
    copy => { delete copy.startingPose; },
    copy => { delete copy.gameSetId; },
    copy => { copy.gameSetId = 'reference'; },
    copy => { copy.geometryVersion = GEOMETRY_VERSION; },
  ]) {
    const corrupt = structuredClone(game);
    mutate(corrupt);
    assert.equal(isValidStartingPosition(corrupt), false);
  }
  assert.throws(() => configureGameSet(game, 'miroir-50', game.startConfig, 13), TypeError);
  assert.throws(() => configureGameSet(freshMirror(), 'reference'), TypeError);
  assert.throws(() => configureGameSet(createGame(), 'miroir-50'), TypeError);
});

test('older saved Reference mechanisms and missing legacy set identities keep their original profile and pose', () => {
  for (const version of [GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION]) {
    const game = createGame(['A', 'B'], 0, version);
    assert.equal(gameSetIdForGeometry(version), 'reference');
    delete game.gameSetId;
    assert.equal(isValidGameSet(game), true);
    configureGameSet(game, 'reference', { mode: 'varied', seed: 42 }, 2);
    const saved = JSON.parse(JSON.stringify(game));
    assert.equal(saved.geometryVersion, version);
    assert.equal(isValidStartingPosition(saved, 2), true);
    assert.deepEqual(saved, game);
    saved.gameSetId = 'miroir-50';
    assert.equal(isValidGameSet(saved), false);
  }
});

test('Miroir mechanics exchange faces, entrances, numbered series and terminal snapshots under coupled play', () => {
  const wheels = wheelsFor(MIRROR_GEOMETRY_VERSION);
  const tokenSwap = token => token === null ? null : token <= 5 ? token + 5 : token - 5;
  const transform = frame => ({
    ...structuredClone(frame),
    angles: frame.angles.map((angle, index) => normalizeAngle(angle + wheels[index].delta)),
    active: 1 - frame.active,
    faces: [0, 1].map(newFace => {
      const face = frame.faces[1 - newFace];
      return { queue: face.queue.map(tokenSwap), exited: face.exited.map(tokenSwap),
        slots: face.slots.map((slots, index) => slots.map((_, notch) => tokenSwap(
          slots[(notch + (newFace === 0 ? 0 : Math.round(2 * wheels[index].delta / (360 / slots.length)))) % slots.length]))),
      };
    }),
  });
  const semanticFace = face => ({ ...face,
    queue: [0, 1].map(lane => face.queue.filter(id => Math.floor((id - 1) / 5) === lane)),
    exited: [0, 1].map(lane => face.exited.filter(id => Math.floor((id - 1) / 5) === lane)),
  });
  const compare = (actual, expected) => {
    assert.deepEqual(actual.faces.map(semanticFace), expected.faces.map(semanticFace));
    actual.angles.forEach((angle, index) => assert.ok(angularDistance(angle, expected.angles[index]) < 1e-6));
    for (const key of ['active', 'turn', 'engaged', 'lastWheel']) assert.equal(actual[key], expected[key]);
  };
  let state = 1701;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  for (const seed of [0, 7, 25, 42]) {
    const game = mirrorGame(seed);
    const companion = transform(game);
    for (let turn = 0; turn < 150; turn++) {
      const allowed = allowedWheels(game);
      const wheel = allowed[Math.floor(random() * allowed.length)];
      const delta = (random() - .5) * 1440;
      assert.equal(rotate(game, wheel, delta), true);
      assert.equal(rotate(companion, wheel, delta), true);
      compare(companion, transform(game));
      if (game.verdict) {
        assert.equal(companion.verdict.winner, game.verdict.winner === null ? null : 1 - game.verdict.winner);
        assert.equal(companion.verdict.reason, game.verdict.reason);
        compare(companion.verdict.snapshot, transform(game.verdict.snapshot));
      } else assert.equal(companion.verdict, null);
      assert.equal(endTurn(game), true);
      assert.equal(endTurn(companion), true);
      game.events = [];
      companion.events = [];
    }
  }
});
