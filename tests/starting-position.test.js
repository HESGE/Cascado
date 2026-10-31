import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, rotate } from '../src/engine.js';
import { GEOMETRY_VERSION, PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION,
  SUPPORTED_GEOMETRY_VERSIONS, WHEELS, wheelsFor, inputGates, normalizeAngle, notchAngle } from '../src/geometry.js';
import { passableMouthInterval } from '../src/openings.js';
import { tokenTotal } from '../src/tokens.js';
import { configureStartingPosition, startingAnglesFor, normalizeStartConfig,
  validateStartConfig, parseStartingSeed, isValidStartingPosition,
  ORIGINAL_START_MODE, ORIGINAL_START_ANGLES } from '../src/starting-position.js';

test('starting phases have a stable version-1 sequence, including the uint32 endpoints', () => {
  assert.deepEqual(startingAnglesFor(0, 1, LEGACY_GEOMETRY_VERSION), [93.9, 327.8, 89.4, 135.9, 300.3]);
  assert.deepEqual(startingAnglesFor(1, 1, LEGACY_GEOMETRY_VERSION), [93.8, 295.2, 202.9, 122.6, 60.4]);
  assert.deepEqual(startingAnglesFor(1, 3, LEGACY_GEOMETRY_VERSION), [103, 228, 130.3, 44.7, 342.4]);
  assert.deepEqual(startingAnglesFor(0xffffffff, 1000, LEGACY_GEOMETRY_VERSION), [277.2, 37.1, 247.4, 270.1, 205.3]);
  assert.deepEqual(startingAnglesFor(42, 1, PREVIOUS_GEOMETRY_VERSION), [88.6, 167, 82.6, 349.5, 183.1]);
  assert.deepEqual(startingAnglesFor(42, 2, PREVIOUS_GEOMETRY_VERSION),
    [268.6, 227, 172.60000000000002, 34.5, 219.10000000000002]);
});

test('only v1.4 paired rounds exchange faces; current and legacy pairs replay the same angles', () => {
  const previousWheels = wheelsFor(PREVIOUS_GEOMETRY_VERSION);
  for (const seed of [0, 1, 42, 20261030, 0xffffffff]) {
    let previous = null;
    for (let round = 1; round <= 1000; round += 2) {
      const angles = startingAnglesFor(seed, round);
      assert.deepEqual(startingAnglesFor(seed, round + 1), angles);
      const previousAngles = startingAnglesFor(seed, round, PREVIOUS_GEOMETRY_VERSION);
      assert.deepEqual(startingAnglesFor(seed, round + 1, PREVIOUS_GEOMETRY_VERSION),
        previousAngles.map((angle,index)=>normalizeAngle(angle+previousWheels[index].delta)));
      assert.deepEqual(startingAnglesFor(seed, round, LEGACY_GEOMETRY_VERSION),startingAnglesFor(seed, round + 1, LEGACY_GEOMETRY_VERSION));
      if (previous) assert.notDeepEqual(angles, previous);
      previous = angles;
    }
  }
});

test('generated phases keep every loading port closed on both faces for all three profiles', () => {
  assert.deepEqual(inputGates(GEOMETRY_VERSION), [210, 330]);
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    for (const seed of [0, 1, 42, 100, 20261030, 0x80000000, 0xffffffff]) {
      for (let round = 1; round <= 1000; round += 1) {
        const angles = startingAnglesFor(seed, round, version);
        assert.equal(angles.length, WHEELS.length);
        for (const angle of angles) {
          assert.ok(Number.isFinite(angle) && angle >= 0 && angle < 360);
          assert.ok(Math.abs(angle * 10 - Math.round(angle * 10)) < 1e-8);
        }
        for (const face of [0, 1]) for (const gate of inputGates(version)) {
          assert.equal(passableMouthInterval(1, notchAngle(face, 1, 0, angles[0], version), gate), null,
            `${version}, seed ${seed}, round ${round}, face ${face}, port ${gate}`);
        }
      }
    }
    // The bounded rejection fallback is the known neutral pose, with every port closed.
    for (const face of [0, 1]) for (const gate of inputGates(version)) {
      assert.equal(passableMouthInterval(1, notchAngle(face, 1, 0, 0, version), gate), null);
    }
  }
});

test('generation is pure, independent of Math.random, and returns distinct arrays', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('AI randomness must not affect starting phases'); };
  try {
    const first = startingAnglesFor(123, 5);
    const expected = [...first];
    first.fill(999);
    assert.deepEqual(startingAnglesFor(123, 5), expected);
    assert.notDeepEqual(startingAnglesFor(124, 5), expected);
  } finally { Math.random = original; }
});

test('mechanical seed and round APIs reject coercion, fractional values and out-of-range values', () => {
  for (const seed of [-1, 0x100000000, 0.5, NaN, Infinity, '1', null, undefined]) {
    assert.throws(() => startingAnglesFor(seed, 1), TypeError);
  }
  for (const round of [0, 1001, 1.5, NaN, Infinity, '1', null]) {
    assert.throws(() => startingAnglesFor(1, round), TypeError);
  }
});

test('seed parsing and configuration normalization preserve valid uint32 values only', () => {
  assert.equal(parseStartingSeed('0'), 0);
  assert.equal(parseStartingSeed('4294967295'), 0xffffffff);
  assert.equal(parseStartingSeed(123), 123);
  for (const value of ['', ' 1', '1.5', '-1', '4294967296', null, [], NaN]) {
    assert.equal(parseStartingSeed(value), null);
  }
  assert.deepEqual(normalizeStartConfig(), { mode: 'classic', seed: 1 });
  assert.deepEqual(normalizeStartConfig({}), { mode: 'classic', seed: 1 });
  assert.deepEqual(normalizeStartConfig({ mode: 'varied', seed: 0 }), { mode: 'varied', seed: 0 });
  assert.deepEqual(normalizeStartConfig({ mode: ORIGINAL_START_MODE }), { mode: 'original-v1', seed: 1 });
  assert.equal(validateStartConfig({ mode: 'varied', seed: 0xffffffff }), true);
  for (const config of [null, [], 'varied', { mode: 'unknown' }, { seed: '1' },
    { mode: 'varied', seed: -1 }, { mode: 'varied', seed: 0x100000000 }, { winner: 0 }]) {
    assert.equal(normalizeStartConfig(config), null);
    assert.equal(validateStartConfig(config), false);
  }
});

test('classic configuration keeps the ordinary neutral game and metadata unchanged', () => {
  const game = createGame(['A', 'B'], 1);
  const before = structuredClone(game);
  assert.equal(configureStartingPosition(game), game);
  assert.deepEqual(game, before);
  assert.equal(isValidStartingPosition(game), true);
});

test('the original-v1 reconstruction sets only the five fixed phases and keeps all four queues closed', () => {
  assert.equal(ORIGINAL_START_MODE, 'original-v1');
  assert.equal(Object.isFrozen(ORIGINAL_START_ANGLES), true);
  assert.deepEqual(ORIGINAL_START_ANGLES, [348, 22, 116, 8, 31]);
  const game = createGame(['A', 'B'], 1);
  const before = structuredClone(game);
  assert.equal(configureStartingPosition(game, { mode: ORIGINAL_START_MODE }), game);
  assert.deepEqual(game, { ...before, angles: [348, 22, 116, 8, 31],
    startConfig: { mode: 'original-v1', seed: 1 }, startingAngles: [348, 22, 116, 8, 31] });
  assert.notEqual(game.angles, game.startingAngles);
  assert.notEqual(game.angles, ORIGINAL_START_ANGLES);
  assert.notEqual(game.startingAngles, ORIGINAL_START_ANGLES);
  for (const face of [0, 1]) for (const gate of inputGates(game.geometryVersion)) {
    assert.equal(passableMouthInterval(1, notchAngle(face, 1, 0, game.angles[0], game.geometryVersion), gate), null);
  }
  // A real movement elsewhere can stabilize gravity without prematurely loading a queue.
  rotate(game, 2, .001);
  assert.deepEqual(game.faces, before.faces);
  assert.deepEqual(game.events, []);
  assert.equal(isValidStartingPosition(game), true);
  assert.deepEqual(game.startingAngles, [348, 22, 116, 8, 31]);
});

test('original-v1 calibration is independent of seed and round, but rejects historical mechanisms before mutation', () => {
  for (const [seed, round] of [[0, 1], [42, 2], [0xffffffff, 1000]]) {
    const game = configureStartingPosition(createGame(), { mode: ORIGINAL_START_MODE, seed }, round);
    assert.deepEqual(game.angles, [348, 22, 116, 8, 31]);
    assert.equal(isValidStartingPosition(game, round), true);
  }
  for (const version of [PREVIOUS_GEOMETRY_VERSION, LEGACY_GEOMETRY_VERSION]) {
    const game = createGame(['A', 'B'], 0, version);
    const before = structuredClone(game);
    assert.throws(() => configureStartingPosition(game, { mode: ORIGINAL_START_MODE }), /ddc-v1\.5/);
    assert.deepEqual(game, before);
    game.startConfig = { mode: ORIGINAL_START_MODE, seed: 1 };
    game.startingAngles = [...ORIGINAL_START_ANGLES];
    assert.equal(isValidStartingPosition(game), false);
  }
});

test('original-v1 saves retain their exact live angles and immutable provenance without being reconfigured', () => {
  const original = configureStartingPosition(createGame(), { mode: ORIGINAL_START_MODE });
  rotate(original, 3, 17);
  const saved = JSON.parse(JSON.stringify(original));
  const before = structuredClone(saved);
  assert.equal(isValidStartingPosition(saved), true);
  assert.deepEqual(saved, before);
  assert.throws(() => configureStartingPosition(saved, { mode: ORIGINAL_START_MODE }), TypeError);
  assert.deepEqual(saved, before);
  for (const change of [
    value => { value.startingAngles[0] += 1; },
    value => { delete value.startingAngles; },
    value => { value.startingAngles = Array(5); },
    value => { delete value.startConfig; },
    value => { value.startConfig.mode = 'original-v2'; },
  ]) {
    const corrupt = structuredClone(saved);
    change(corrupt);
    assert.equal(isValidStartingPosition(corrupt), false);
  }
});

test('varied configuration changes only initial phases and their immutable provenance', () => {
  const game = createGame(['A', 'B'], 1);
  const before = structuredClone(game);
  const config = { mode: 'varied', seed: 42 };
  assert.equal(configureStartingPosition(game, config, 3), game);
  assert.deepEqual(game, { ...before, angles: startingAnglesFor(42, 3),
    startingAngles: startingAnglesFor(42, 3), startConfig: config });
  assert.notEqual(game.angles, game.startingAngles);
  assert.notEqual(game.startConfig, config);
  assert.equal(isValidStartingPosition(game, 3), true);
  assert.equal(isValidStartingPosition(game, 4), true, 'paired v1.5 rounds share the same phases');
  assert.equal(isValidStartingPosition(game, 1), false);
  // Even a stabilization on another wheel must not silently load a queue.
  rotate(game, 2, 0.001);
  assert.deepEqual(game.faces, before.faces);
  assert.deepEqual(game.startingAngles, startingAnglesFor(42, 3));
  assert.equal(isValidStartingPosition(game, 3), true);
});

test('fresh configuration accepts all profiles and requires their complete flat token queues', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const game = createGame(['A', 'B'], 0, version);
    const tokens = Array.from({ length: tokenTotal(version) }, (_, index) => index + 1);
    assert.deepEqual(game.faces.map(face => face.queue), [tokens, tokens]);
    assert.equal(configureStartingPosition(game, { mode: 'varied', seed: 42 }), game);
    assert.equal(isValidStartingPosition(game), true);
    for (const mutate of [
      copy => { copy.faces[0].queue.pop(); },
      copy => { copy.faces[1].queue[0] = 0; },
      copy => { copy.faces[0].queue.reverse(); },
      copy => { copy.faces[1].queue = Array(tokenTotal(version)); },
    ]) {
      const invalid = createGame(['A', 'B'], 0, version);
      mutate(invalid);
      assert.throws(() => configureStartingPosition(invalid, { mode: 'varied', seed: 42 }), TypeError);
    }
  }
  const unknown = createGame();
  unknown.geometryVersion = 'future';
  assert.equal(isValidStartingPosition(unknown), false);
  assert.throws(() => configureStartingPosition(unknown, { mode: 'varied', seed: 42 }), TypeError);
});

test('configuration refuses an existing position without altering any field', () => {
  const mutations = [
    game => { game.turn = 2; },
    game => { game.angles[0] = 1; },
    game => { game.engaged = 1; },
    game => { game.lastWheel = 1; },
    game => { game.events.push({ id: 1 }); },
    game => { game.verdict = { winner: 1 }; },
    game => { game.faces[0].queue.shift(); game.faces[0].slots[0][0] = 1; },
    game => { game.faces[1].exited = [1]; game.faces[1].queue.shift(); },
    game => { game.startConfig = { mode: 'varied', seed: 1 }; },
    game => { game.startingAngles = [0, 0, 0, 0, 0]; },
    game => { game.faces[0].slots[0] = Array(1); },
  ];
  for (const mutate of mutations) for (const mode of ['varied', ORIGINAL_START_MODE]) {
    const game = createGame();
    mutate(game);
    const before = structuredClone(game);
    assert.throws(() => configureStartingPosition(game, { mode, seed: 1 }), TypeError);
    assert.deepEqual(game, before);
  }
});

test('configuration validates settings before mutation and refuses a second varied setup', () => {
  for (const [config, round] of [[{ mode: 'varied', seed: -1 }, 1],
    [{ mode: 'varied', seed: 1 }, 0], [{ mode: 'varied', seed: 1 }, 1001]]) {
    const game = createGame();
    const before = structuredClone(game);
    assert.throws(() => configureStartingPosition(game, config, round), TypeError);
    assert.deepEqual(game, before);
  }
  const game = configureStartingPosition(createGame(), { mode: 'varied', seed: 1 });
  const before = structuredClone(game);
  assert.throws(() => configureStartingPosition(game, { mode: 'varied', seed: 2 }), TypeError);
  assert.deepEqual(game, before);
});

test('provenance validation detects tampering and defaults to the saved series round', () => {
  const game = configureStartingPosition(createGame(), { mode: 'varied', seed: 9 }, 7);
  game.series = { round: 7 };
  assert.equal(isValidStartingPosition(game), true);
  game.angles = [0, 1, 2, 3, 4];
  assert.equal(isValidStartingPosition(game), true, 'live rotations are not initial metadata');
  for (const mutate of [
    copy => { copy.startConfig.seed++; },
    copy => { copy.startingAngles[0] += 0.1; },
    copy => { copy.startingAngles = Array(5); },
    copy => { delete copy.startingAngles; },
    copy => { copy.startConfig.mode = 'classic'; },
    copy => { copy.series.round = 9; },
  ]) {
    const copy = structuredClone(game);
    mutate(copy);
    assert.equal(isValidStartingPosition(copy), false);
  }
  const classic = createGame();
  classic.startingAngles = [0, 0, 0, 0, 0];
  assert.equal(isValidStartingPosition(classic), false);
  assert.equal(isValidStartingPosition(null), false);
  assert.equal(isValidStartingPosition(createGame(), 0), false);
});
