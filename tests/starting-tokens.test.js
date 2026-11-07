import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, rotate } from '../src/engine.js';
import { SUPPORTED_GEOMETRY_VERSIONS, GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION,
  inputGates, physicalAngleFor, OUTPUT_GATE } from '../src/geometry.js';
import { tokenTotal, queueLanes } from '../src/tokens.js';
import { configureGameSet, MIROIR50_START_MODE } from '../src/starting-position.js';
import { configurePlayers } from '../src/players.js';
import { gameSetIdForGeometry } from '../src/game-sets.js';
import { createSeries, seriesGameId, recordSeriesResult, createNextSeriesGame } from '../src/series.js';
import { TOKEN_ORDERS, configureStartingTokens, isValidStartingTokens, tokenOrderMode } from '../src/starting-tokens.js';

function fresh(version = GEOMETRY_VERSION, starter = 0) {
  const game = createGame(['A', 'B'], starter, version);
  configureGameSet(game, gameSetIdForGeometry(version), gameSetIdForGeometry(version) === 'miroir-50'
    ? { mode: MIROIR50_START_MODE, seed: 1 } : { mode: 'classic', seed: 1 });
  return game;
}

test('the classic default leaves old games and their shape unchanged', () => {
  assert.ok(Object.isFrozen(TOKEN_ORDERS) && TOKEN_ORDERS.every(Object.isFrozen));
  assert.deepEqual(TOKEN_ORDERS.map(order => order.id), ['ordered', 'shuffled']);
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const game = fresh(version);
    const before = structuredClone(game);
    assert.equal(configureStartingTokens(game), game);
    assert.deepEqual(game, before);
    assert.equal(Object.hasOwn(game, 'tokenStart'), false);
    assert.equal(tokenOrderMode(game), 'ordered');
    assert.equal(isValidStartingTokens(game), true);
  }
});

for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
  test(`${version}: shuffle keeps each lane's tokens and gives both faces independent matching queues`, () => {
    const game = fresh(version);
    const angles = [...game.angles];
    configureStartingTokens(game, 'shuffled', 1);
    const total = tokenTotal(version);
    const first = game.faces[0].queue;
    assert.deepEqual(first, game.faces[1].queue);
    assert.notEqual(first, game.faces[1].queue);
    assert.deepEqual([...first].sort((a, b) => a - b), Array.from({ length: total }, (_, index) => index + 1));
    const lanes = queueLanes(game.faces[0], version);
    for (let lane = 0; lane < lanes.length; lane++) {
      assert.deepEqual([...lanes[lane]].sort((a, b) => a - b), Array.from({ length: 5 }, (_, index) => lane * 5 + index + 1));
    }
    assert.deepEqual(game.angles, angles);
    assert.deepEqual(game.tokenStart, { mode: 'shuffled', seed: 1 });
    assert.equal(tokenOrderMode(game), 'shuffled');
    assert.equal(isValidStartingTokens(game), true);
    const back = [...game.faces[1].queue];
    game.faces[0].queue.shift();
    assert.deepEqual(game.faces[1].queue, back, 'loading a token on A cannot remove one from B');
  });
}

test('the seed protocol is reproducible and paired rounds retain the same draw', () => {
  for (const seed of [0, 1, 123, 0xffffffff]) {
    const queues = [1, 2, 3, 4].map(round => {
      const game = fresh();
      configureStartingTokens(game, 'shuffled', seed, round);
      return game.faces[0].queue;
    });
    assert.deepEqual(queues[0], queues[1]);
    assert.deepEqual(queues[2], queues[3]);
    assert.notDeepEqual(queues[0], queues[2]);
    const otherStarter = fresh(GEOMETRY_VERSION, 1);
    configureStartingTokens(otherStarter, 'shuffled', seed);
    assert.deepEqual(otherStarter.faces[0].queue, queues[0]);
  }
  const pinned = fresh();
  configureStartingTokens(pinned, 'shuffled', 1);
  assert.deepEqual(pinned.faces[0].queue, [3, 1, 5, 4, 2, 9, 8, 10, 7, 6]);
});

test('loading a saved shuffled game keeps its current queues and forbids a new shuffle', () => {
  const game = fresh();
  configureStartingTokens(game, 'shuffled', 1);
  const gate = inputGates(game.geometryVersion)[0];
  game.angles[0] = physicalAngleFor(0, 1, 0, gate, game.geometryVersion);
  assert.equal(rotate(game, 1, .001), true);
  assert.equal(game.faces[0].slots[0][0], 3, 'the lane head loads even when it is not number one');
  const saved = JSON.parse(JSON.stringify(game));
  assert.equal(isValidStartingTokens(saved), true);
  assert.equal(tokenOrderMode(saved), 'shuffled');
  const before = structuredClone(saved);
  assert.throws(() => configureStartingTokens(saved, 'shuffled', 2), TypeError);
  assert.deepEqual(saved, before);
});

test('shuffled loading leaves the numeric exit rule intact', () => {
  const game = fresh();
  configureStartingTokens(game, 'shuffled', 1);
  game.faces[0].queue = game.faces[0].queue.filter(token => token !== 3);
  game.faces[0].slots[4][0] = 3;
  game.angles[4] = physicalAngleFor(0, 5, 0, OUTPUT_GATE, game.geometryVersion);
  assert.equal(rotate(game, 5, .001), true);
  assert.equal(game.verdict.reason, 'order');
  assert.equal(game.verdict.winner, 1);
});

test('invalid settings and nonfresh positions are rejected before any mutation', () => {
  for (const args of [['unknown'], ['shuffled', -1], ['shuffled', 0x100000000],
    ['shuffled', 1.5], ['shuffled', NaN], ['shuffled', 1, 0], ['shuffled', 1, 1001]]) {
    const game = fresh();
    const before = structuredClone(game);
    assert.throws(() => configureStartingTokens(game, ...args), TypeError);
    assert.deepEqual(game, before);
  }
  for (const modify of [game => { game.turn = 2; }, game => { game.engaged = 1; },
    game => { game.faces[1].queue.reverse(); }, game => { delete game.faces[0].queue[0]; },
    game => { game.faces[0].slots[0][0] = 1; }, game => { game.events.push({}); },
    game => { game.tokenStart = { mode: 'shuffled', seed: 1 }; }]) {
    const game = fresh();
    modify(game);
    const before = structuredClone(game);
    assert.throws(() => configureStartingTokens(game, 'shuffled', 1), TypeError);
    assert.deepEqual(game, before);
  }
});

test('saved shuffle metadata rejects unknown or incomplete settings', () => {
  assert.equal(isValidStartingTokens(null), false);
  assert.equal(isValidStartingTokens({}), false);
  for (const tokenStart of [null, [], { mode: 'ordered', seed: 1 }, { mode: 'shuffled' },
    { seed: 1 }, { mode: 'shuffled', seed: -1 }, { mode: 'shuffled', seed: '1' },
    { mode: 'shuffled', seed: 1, round: 1 }]) {
    const game = fresh();
    game.tokenStart = tokenStart;
    assert.equal(isValidStartingTokens(game), false);
  }
});

function completeRound(game) {
  game.turn = 20;
  game.verdict = { reason: 'complete', winner: 0 };
  game.faces[0].queue = [];
  game.faces[0].slots.forEach(slots => slots.fill(null));
  game.faces[0].exited = Array.from({ length: tokenTotal(game.geometryVersion) }, (_, index) => index + 1);
  const session = { game, phase: 'revealed-result', recipient: game.active };
  assert.equal(recordSeriesResult(session), true);
  return game;
}

test('series continuations preserve shuffle settings and reproduce each round pair', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) {
    const game = configurePlayers(fresh(version), [{ controller: 'ai' }, { controller: 'ai' }]);
    game.series = createSeries(4, { id: `shuffle-${version.replaceAll('.', '_')}`, firstStarter: 0 });
    game.statsId = seriesGameId(game.series);
    configureStartingTokens(game, 'shuffled', 1, 1);
    const first = [...game.faces[0].queue];
    const second = createNextSeriesGame(completeRound(game));
    assert.ok(second);
    assert.deepEqual(second.tokenStart, game.tokenStart);
    assert.deepEqual(second.faces[0].queue, first);
    assert.deepEqual(second.faces[0].queue, second.faces[1].queue);
    const third = createNextSeriesGame(completeRound(second));
    assert.ok(third);
    const thirdQueue = [...third.faces[0].queue];
    assert.notDeepEqual(thirdQueue, first);
    const fourth = createNextSeriesGame(completeRound(third));
    assert.ok(fourth);
    assert.deepEqual(fourth.faces[0].queue, thirdQueue);
    assert.equal(createNextSeriesGame(completeRound(fourth)), null);
  }
});

test('old ordered series stay ordered and malformed shuffle provenance stops continuation', () => {
  const game = configurePlayers(fresh(), [{ controller: 'ai' }, { controller: 'ai' }]);
  game.series = createSeries(2, { id: 'ordered-series', firstStarter: 0 });
  game.statsId = seriesGameId(game.series);
  completeRound(game);
  const next = createNextSeriesGame(game);
  assert.ok(next);
  assert.equal(Object.hasOwn(next, 'tokenStart'), false);
  assert.deepEqual(next.faces[0].queue, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  game.tokenStart = { mode: 'shuffled', seed: -1 };
  const before = structuredClone(game);
  assert.equal(createNextSeriesGame(game), null);
  assert.deepEqual(game, before);
});
