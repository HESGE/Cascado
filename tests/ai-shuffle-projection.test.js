import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView } from '../src/engine.js';
import { configureStartingTokens } from '../src/starting-tokens.js';

test('the own-face projection exposes shuffled mode without its seed or hidden face', () => {
  for (const face of [0, 1]) {
    const game = createGame(['A', 'B'], face);
    configureStartingTokens(game, 'shuffled', 123);
    const visible = getView(game, face);
    assert.equal(visible.tokenOrder, 'shuffled');
    assert.equal(Object.hasOwn(visible, 'tokenStart'), false);
    assert.equal(Object.hasOwn(visible, 'seed'), false);
    assert.equal(Object.hasOwn(visible, 'faces'), false);
    assert.equal(Object.hasOwn(visible, 'verdict'), false);
    const hidden = structuredClone(game);
    hidden.tokenStart.seed = 456;
    hidden.faces[1 - face].queue = [];
    hidden.faces[1 - face].slots[4][0] = 5;
    hidden.verdict = { winner: 1 - face, reason: 'order', confidential: true };
    assert.deepEqual(getView(hidden, face), visible);
  }
});

test('shuffled mode remains visible when the remaining queues are sorted or empty', () => {
  for (const queue of [[2, 6], []]) {
    for (const face of [0, 1]) {
      const game = createGame(['A', 'B'], face);
      configureStartingTokens(game, 'shuffled', 1);
      const current = game.faces[face];
      const loaded = current.queue.filter(token => !queue.includes(token));
      current.queue = [...queue];
      for (const slots of current.slots) {
        for (let notch = 0; notch < slots.length && loaded.length; notch++) slots[notch] = loaded.shift();
      }
      assert.deepEqual(loaded, []);
      assert.equal(getView(game, face).tokenOrder, 'shuffled');
      assert.equal(getView(JSON.parse(JSON.stringify(game)), face).tokenOrder, 'shuffled');
    }
  }
});

test('classic projections keep their existing shape even if the current positions look shuffled', () => {
  const game = createGame(['A', 'B']);
  const classic = getView(game, 0);
  const originalKeys = Object.keys(classic);
  assert.equal(Object.hasOwn(classic, 'tokenOrder'), false);
  game.faces[0].queue.reverse();
  assert.deepEqual(Object.keys(getView(game, 0)), originalKeys);
  for (const tokenStart of [{ mode: 'ordered', seed: 1 }, { mode: 'future', seed: 1 }]) {
    game.tokenStart = tokenStart;
    assert.deepEqual(Object.keys(getView(game, 0)), originalKeys);
  }
});
