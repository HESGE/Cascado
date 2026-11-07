import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedWheels, createGame, endTurn, getView, ONE_PIECE_MODE, rotate, setGustArmed } from '../src/engine.js';
import { GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION, REFERENCE_FIVE_GEOMETRY_VERSION } from '../src/geometry.js';

const createOnePiece = (geometryVersion = GEOMETRY_VERSION) =>
  createGame(['Luffy', 'Law'], 0, geometryVersion, { gameMode: ONE_PIECE_MODE });

for (const geometryVersion of [GEOMETRY_VERSION, MIRROR_GEOMETRY_VERSION]) {
  test(`one Coup de vent per face allows consecutive turns on the locked wheel (${geometryVersion})`, () => {
    const game = createOnePiece(geometryVersion);
    assert.equal(setGustArmed(game, true), false);
    assert.equal(rotate(game, 3, 10), true);
    assert.equal(endTurn(game), true);
    assert.equal(rotate(game, 3, 10), false);

    assert.equal(setGustArmed(game, true), true);
    assert.deepEqual(getView(game, 1).gust, { remaining: 1, armed: true, blockedWheel: 3 });
    assert.deepEqual(getView(game, 0).gust, { remaining: 1, armed: false, blockedWheel: null });
    assert.equal(rotate(game, 3, 0), false);
    assert.equal(setGustArmed(game, false), true);
    assert.equal(allowedWheels(game).includes(3), false);

    assert.equal(setGustArmed(game, true), true);
    assert.equal(rotate(game, 3, 10), true);
    assert.equal(rotate(game, 3, 10), true);
    assert.deepEqual(getView(game, 1).gust, { remaining: 0, armed: false, blockedWheel: null });
    assert.deepEqual(allowedWheels(game), [3]);
    assert.equal(endTurn(game), true);

    assert.deepEqual(getView(game, 0).gust, { remaining: 1, armed: false, blockedWheel: 3 });
    assert.equal(setGustArmed(game, true), true);
    assert.equal(rotate(game, 3, 10), true);
    assert.equal(endTurn(game), true);
    assert.equal(setGustArmed(game, true), false);
    assert.equal(rotate(game, 3, 10), false);
  });
}

test('arming without rotating the restricted wheel preserves the power', () => {
  const game = createOnePiece();
  rotate(game, 3, 10);
  endTurn(game);
  assert.equal(setGustArmed(game, true), true);
  assert.equal(endTurn(game), false);
  assert.equal(rotate(game, 2, 10), true);
  assert.deepEqual(getView(game, 1).gust, { remaining: 1, armed: false, blockedWheel: null });
  assert.equal(setGustArmed(game, true), false);
  assert.equal(rotate(game, 3, 10), false);
});

test('the last-token exception never consumes a Coup de vent, and classic keeps its normal restriction', () => {
  const game = createOnePiece();
  game.lastWheel = 5;
  game.faces[0].queue = [];
  game.faces[0].exited = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  game.faces[0].slots[4][0] = 10;
  assert.equal(getView(game, 0).gust.blockedWheel, null);
  assert.equal(setGustArmed(game, true), false);
  assert.equal(rotate(game, 5, 10), true);
  assert.equal(getView(game, 0).gust.remaining, 1);

  const classic = createGame();
  classic.lastWheel = 5;
  assert.equal(getView(classic, 0).gust, undefined);
  assert.equal(setGustArmed(classic, true), false);
  assert.equal(rotate(classic, 5, 10), false);
  assert.throws(() => createOnePiece(REFERENCE_FIVE_GEOMETRY_VERSION), RangeError);
});
