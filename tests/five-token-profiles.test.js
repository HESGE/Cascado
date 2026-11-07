import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame, rotate } from '../src/engine.js';
import { GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, REFERENCE_FIVE_GEOMETRY_VERSION,
  MIRROR_FIVE_GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION,
  baseGeometryVersion, wheelsFor, inputGates, boardHeightFor, queuePosition, trayPosition,
  notchAngle, normalizeAngle, angularDistance } from '../src/geometry.js';
import { getGameSet, GAME_SETS, isValidGameSet, gameSetIdForGeometry } from '../src/game-sets.js';
import { tokenTotal, seriesCount } from '../src/tokens.js';
import { passableMouthInterval } from '../src/openings.js';
import { MIROIR50_POSITIONS, MIROIR50_POOL_ID } from '../src/miroir50-positions.js';
import { ORIGINAL_START_MODE, ORIGINAL_START_ANGLES, MIROIR50_START_MODE,
  MIROIR50_FIVE_POOL_ID, MIROIR50_FIVE_POSITIONS, configureGameSet, configureStartingPosition,
  isValidStartingPosition, miroir50ScheduleEntry, miroir50RematchSeed, startingAnglesFor } from '../src/starting-position.js';

const versions = [REFERENCE_FIVE_GEOMETRY_VERSION, MIRROR_FIVE_GEOMETRY_VERSION];
const fresh = (version, seed = 15, round = 1, starter = 0) => configureGameSet(
  createGame(['A', 'B'], starter, version), gameSetIdForGeometry(version),
  { mode: baseGeometryVersion(version) === MIRROR_GEOMETRY_VERSION ? MIROIR50_START_MODE : ORIGINAL_START_MODE, seed }, round);

test('five-token profiles share the exact existing wheels while using one central loading lane', () => {
  for (const [version, base] of [[REFERENCE_FIVE_GEOMETRY_VERSION, GEOMETRY_VERSION],
    [MIRROR_FIVE_GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION]]) {
    assert.equal(baseGeometryVersion(version), base);
    assert.equal(wheelsFor(version), wheelsFor(base));
    assert.deepEqual(inputGates(version), [270]);
    assert.equal(tokenTotal(version), 5);
    assert.equal(seriesCount(version), 1);
    assert.equal(boardHeightFor(version), 510);
    for (let index = 0; index < 5; index++) {
      assert.deepEqual(queuePosition(index, 0, version), queuePosition(index, 0, LEGACY_GEOMETRY_VERSION));
      for (const face of [0, 1]) assert.deepEqual(trayPosition(face, index, version), trayPosition(face, index, LEGACY_GEOMETRY_VERSION));
    }
    const game = createGame(['A', 'B'], 0, version);
    assert.deepEqual(game.faces.map(face => face.queue), [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
  }
  for (const version of [GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION]) {
    assert.equal(baseGeometryVersion(version), version);
  }
  assert.throws(() => baseGeometryVersion('future'), RangeError);
});

test('set and token-count selections stay independent without changing the default definitions', () => {
  for (const definition of GAME_SETS) {
    assert.equal(getGameSet(definition.id), definition);
    assert.equal(getGameSet(definition.id, 10), definition);
    const five = getGameSet(definition.id, 5);
    assert.equal(five, getGameSet(definition.id, 5));
    assert.ok(Object.isFrozen(five));
    assert.equal(five.id, definition.id);
    assert.equal(five.label, definition.label);
    assert.equal(tokenTotal(five.geometryVersion), 5);
    assert.equal(gameSetIdForGeometry(five.geometryVersion), definition.id);
    assert.equal(isValidGameSet(createGame(['A', 'B'], 0, five.geometryVersion)), true);
    for (const count of [null, '5', 0, 4, 6, 15, NaN]) assert.throws(() => getGameSet(definition.id, count), TypeError);
  }
  assert.throws(() => getGameSet('unknown', 5), TypeError);
});

test('Reference five tokens accepts the original pose and never reconfigures a resumed position', () => {
  const game = fresh(REFERENCE_FIVE_GEOMETRY_VERSION);
  assert.deepEqual(game.angles, ORIGINAL_START_ANGLES);
  assert.equal(isValidStartingPosition(game), true);
  const untouched = structuredClone(game.faces);
  rotate(game, 2, .001);
  assert.deepEqual(game.faces, untouched, 'the central inlet starts closed on both faces');
  rotate(game, 3, 17);
  const saved = JSON.parse(JSON.stringify(game));
  const before = structuredClone(saved);
  assert.equal(isValidStartingPosition(saved), true);
  assert.throws(() => configureStartingPosition(saved, { mode: ORIGINAL_START_MODE }), TypeError);
  assert.deepEqual(saved, before);
});

test('five-token Miroir uses its own immutable pool and changes only the unsafe central-inlet family', () => {
  assert.equal(MIROIR50_FIVE_POOL_ID, `${MIROIR50_POOL_ID}-five-v1`);
  assert.ok(Object.isFrozen(MIROIR50_FIVE_POSITIONS));
  assert.equal(MIROIR50_FIVE_POSITIONS.length, 50);
  assert.equal(createHash('sha256').update(JSON.stringify(MIROIR50_POSITIONS)).digest('hex'),
    'cdd7577ecf5db263c6350dc880dff3bf83ca7b0c8e6d67e801e2ef24afc420e2');
  let shifted = 0;
  for (let index = 0; index < 50; index++) {
    const pose = MIROIR50_FIVE_POSITIONS[index], original = MIROIR50_POSITIONS[index];
    assert.ok(Object.isFrozen(pose) && Object.isFrozen(pose.angles));
    assert.equal(pose.poseId, original.poseId);
    assert.equal(pose.familyId, original.familyId);
    assert.deepEqual(pose.angles.slice(1), original.angles.slice(1));
    if (pose.angles[0] !== original.angles[0]) {
      shifted++;
      assert.equal(pose.familyId, 'sym-13/validation/family-15');
      assert.equal(pose.angles[0], normalizeAngle(original.angles[0] + 6));
    }
    for (const face of [0, 1]) assert.equal(passableMouthInterval(1,
      notchAngle(face, 1, 0, pose.angles[0], MIRROR_FIVE_GEOMETRY_VERSION), 270), null);
  }
  assert.equal(shifted, 2);
  for (let family = 0; family < 25; family++) {
    const [base, complement] = MIROIR50_FIVE_POSITIONS.slice(family * 2, family * 2 + 2);
    base.angles.forEach((angle, wheel) => assert.ok(angularDistance(angle
      + wheelsFor(MIRROR_FIVE_GEOMETRY_VERSION)[wheel].delta, complement.angles[wheel]) < 1e-9));
  }
});

test('the five-token Miroir census covers every pose and starter and preserves paired complements', () => {
  for (const seed of [0, 15, 49, 20261105, 0xffffffff]) {
    const cells = new Set();
    for (let round = 1; round <= 100; round++) {
      const entry = miroir50ScheduleEntry(seed, round, MIRROR_FIVE_GEOMETRY_VERSION);
      const original = miroir50ScheduleEntry(seed, round);
      assert.equal(entry.poolId, MIROIR50_FIVE_POOL_ID);
      assert.equal(entry.poseId, original.poseId);
      assert.equal(entry.starterOffset, (round - 1) % 2);
      cells.add(`${entry.poseId}/${entry.starterOffset}`);
      assert.deepEqual(startingAnglesFor(seed, round, MIRROR_FIVE_GEOMETRY_VERSION), entry.angles);
      const game = fresh(MIRROR_FIVE_GEOMETRY_VERSION, seed, round);
      assert.deepEqual(game.angles, entry.angles);
      assert.equal(isValidStartingPosition(game, round), true);
      if (round % 2 === 1) {
        const next = miroir50ScheduleEntry(seed, round + 1, MIRROR_FIVE_GEOMETRY_VERSION);
        assert.equal(entry.familyId, next.familyId);
        assert.notEqual(entry.role, next.role);
      }
    }
    assert.equal(cells.size, 100);
  }
  assert.throws(() => miroir50ScheduleEntry(1, 1, REFERENCE_FIVE_GEOMETRY_VERSION), TypeError);
});

test('five-token saved provenance rejects a wrong pool or altered pose but allows live rotations and rematches', () => {
  for (const seed of [0, 15, 25, 40, 49]) {
    const game = fresh(MIRROR_FIVE_GEOMETRY_VERSION, seed);
    const pose = structuredClone(game.startingPose);
    rotate(game, 3, 17);
    const saved = JSON.parse(JSON.stringify(game));
    assert.equal(isValidStartingPosition(saved), true);
    const next = fresh(MIRROR_FIVE_GEOMETRY_VERSION, miroir50RematchSeed(saved));
    assert.equal(next.startingPose.poolId, MIROIR50_FIVE_POOL_ID);
    assert.equal(next.startingPose.familyId, pose.familyId);
    assert.notEqual(next.startingPose.role, pose.role);
    for (const mutate of [copy => { copy.startingPose.poolId = MIROIR50_POOL_ID; },
      copy => { copy.startingAngles[0] += .1; },
      copy => { copy.geometryVersion = MIRROR_GEOMETRY_VERSION; },
      copy => { copy.gameSetId = 'reference'; }]) {
      const corrupt = structuredClone(saved);
      mutate(corrupt);
      assert.equal(isValidStartingPosition(corrupt), false);
    }
  }
  for (const version of versions) {
    const game = createGame(['A', 'B'], 0, version);
    game.faces[0].queue.pop();
    const before = structuredClone(game);
    assert.throws(() => configureGameSet(game, gameSetIdForGeometry(version),
      { mode: version === MIRROR_FIVE_GEOMETRY_VERSION ? MIROIR50_START_MODE : ORIGINAL_START_MODE, seed: 1 }), TypeError);
    assert.deepEqual(game, before);
  }
});
