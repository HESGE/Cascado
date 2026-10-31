import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, rotate } from '../src/engine.js';
import { renderBoard } from '../src/board.js';
import { getOpponentProgress } from '../src/opponent-progress.js';
import { tokenPositions, planTokenMotion } from '../src/motion.js';
import { chooseAIMove } from '../src/ai.js';
import { configurePlayers, displayedFaceIndex } from '../src/players.js';
import { newSession, revealTarget, transmit, acceptReveal, visibleTransfers } from '../src/flow.js';
import { SUPPORTED_GEOMETRY_VERSIONS } from '../src/geometry.js';
import { tokenTotal } from '../src/tokens.js';

const values = (svg, attribute) => [...svg.matchAll(new RegExp(`\\b${attribute}="(\\d+)"`, 'g'))]
  .map(match => Number(match[1]));
const sorted = values => [...values].sort((a, b) => a - b);
const ids = total => Array.from({ length: total }, (_, index) => index + 1);
function collected(game, face, exited) {
  game.faces[face].exited = [...exited];
  game.faces[face].queue = game.faces[face].queue.filter(token => !exited.includes(token));
}
function fixture(version, viewer = 0) {
  const game = createGame(['Camille', 'Adversaire confidentiel'], viewer, version);
  const total = tokenTotal(version);
  collected(game, 1 - viewer, total === 10 ? [1, 6, 2] : [1, 2]);
  return game;
}

test('board rendering stays private by default, even when the opponent has collected tokens', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const viewer of [0, 1]) {
    const game = fixture(version, viewer);
    const privateView = getView(game, viewer);
    const svg = renderBoard(privateView);
    const changed = structuredClone(game);
    collected(changed, 1 - viewer, ids(tokenTotal(version)));
    assert.equal(renderBoard(getView(changed, viewer)), svg);
    assert.deepEqual(sorted(values(svg, 'data-token')), ids(tokenTotal(version)));
    assert.doesNotMatch(svg, /data-opponent-progress|data-opponent-token/);
    assert.equal(Object.hasOwn(privateView, 'opponentProgress'), false);
  }
});

test('authorised summaries add their own static identities without changing animated tokens or wheels', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const viewer of [0, 1]) {
    const game = fixture(version, viewer);
    const snapshot = structuredClone(game);
    const view = getView(game, viewer);
    const plain = renderBoard(view);
    const summary = getOpponentProgress(game, viewer);
    const decorated = renderBoard(view, { opponentProgress: summary });
    assert.deepEqual(values(decorated, 'data-token'), values(plain, 'data-token'));
    assert.deepEqual(values(decorated, 'data-wheel'), values(plain, 'data-wheel'));
    assert.deepEqual(values(decorated, 'data-wheel-rotor'), values(plain, 'data-wheel-rotor'));
    assert.equal(values(decorated, 'data-wheel').length, 5);
    assert.equal(values(decorated, 'data-wheel-rotor').length, 5);
    assert.deepEqual(sorted(values(decorated, 'data-opponent-token')), sorted(game.faces[1 - viewer].exited));
    assert.match(decorated, /data-opponent-progress/);
    assert.deepEqual(game, snapshot, 'drawing a second collection cannot mutate the authoritative game');
  }
});

test('the opponent collection never changes token positions or own-face motion plans', () => {
  const game = createGame();
  collected(game, 1, [1, 6]);
  game.faces[0].queue = game.faces[0].queue.filter(token => token !== 1);
  game.faces[0].slots[0][0] = 1;
  const before = getView(game, 0);
  const afterGame = structuredClone(game);
  afterGame.faces[0].slots[0][0] = null;
  afterGame.faces[0].slots[1][0] = 1;
  collected(afterGame, 1, [1, 6, 2]);
  const after = getView(afterGame, 0);
  const events = [{ token: 1, from: { wheel: 1, notch: 0 }, to: { wheel: 2, notch: 0 } }];
  const positions = tokenPositions(after);
  const plans = planTokenMotion(before, after, events);
  const augmentedBefore = { ...before, opponentProgress: getOpponentProgress(game, 0) };
  const augmentedAfter = { ...after, opponentProgress: getOpponentProgress(afterGame, 0) };
  renderBoard(after, { opponentProgress: augmentedAfter.opponentProgress });
  assert.deepEqual(tokenPositions(augmentedAfter), positions);
  assert.deepEqual(planTokenMotion(augmentedBefore, augmentedAfter, events), plans);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].token, 1);
  assert.equal(positions.length, 10, 'the two opponent tokens with matching IDs are not part of motion');
});

test('changing only opponent collections changes the ghost, never getView or the Normal AI decision', () => {
  for (const viewer of [0, 1]) {
    const original = createGame(['A', 'B'], viewer);
    const progressed = structuredClone(original);
    collected(progressed, 1 - viewer, [1, 6, 2]);
    const before = getView(original, viewer);
    const after = getView(progressed, viewer);
    assert.deepEqual(after, before);
    assert.deepEqual(chooseAIMove(after, 'normal'), chooseAIMove(before, 'normal'));
    const originalSVG = renderBoard(before, { opponentProgress: getOpponentProgress(original, viewer) });
    const progressedSVG = renderBoard(after, { opponentProgress: getOpponentProgress(progressed, viewer) });
    assert.equal(values(originalSVG, 'data-opponent-token').length, 0);
    assert.equal(values(progressedSVG, 'data-opponent-token').length, 3);
    assert.deepEqual(values(progressedSVG, 'data-token'), values(originalSVG, 'data-token'));
  }
});

test('mixed games keep the AI collection opposite the displayed human face during both turns', () => {
  for (const human of [0, 1]) {
    const opponent = 1 - human;
    const game = configurePlayers(createGame(['A', 'B']), [0, 1].map(seat => ({
      controller: seat === human ? 'human' : 'ai', level: 'normal',
    })));
    collected(game, human, [1, 6]);
    collected(game, opponent, [1, 6, 2]);
    let previousSVG;
    for (const active of [human, opponent]) {
      game.active = active;
      const viewer = displayedFaceIndex(game);
      assert.equal(viewer, human);
      const summary = getOpponentProgress(game, viewer);
      assert.equal(summary.name, game.players[opponent].name);
      assert.deepEqual(summary.exited, game.faces[opponent].exited);
      const svg = renderBoard(getView(game, viewer), { opponentProgress: summary });
      assert.deepEqual(sorted(values(svg, 'data-opponent-token')), [1, 2, 6]);
      if (previousSVG) assert.equal(svg, previousSVG);
      previousSVG = svg;
    }
  }
});

test('a collected-token summary does not reveal or branch on a hidden verdict', () => {
  const ordinary = fixture(SUPPORTED_GEOMETRY_VERSIONS[0]);
  const decisive = structuredClone(ordinary);
  decisive.verdict = { winner: 1, reason: 'order', snapshot: { confidential: true } };
  const before = getOpponentProgress(ordinary, 0);
  const after = getOpponentProgress(decisive, 0);
  assert.deepEqual(after, before);
  assert.equal(renderBoard(getView(decisive, 0), { opponentProgress: after }),
    renderBoard(getView(ordinary, 0), { opponentProgress: before }));
  const session = newSession(decisive);
  const saved = structuredClone(session);
  renderBoard(getView(session.game, 0), { opponentProgress: getOpponentProgress(session.game, 0) });
  assert.deepEqual(session, saved);
  assert.equal(revealTarget(session), 'play');
});

test('static opponent results do not widen transfer filtering, sounds or movement events', () => {
  const game = fixture(SUPPORTED_GEOMETRY_VERSIONS[0]);
  const own = { face: 0, token: 1, from: { wheel: 1, notch: 0 }, to: { wheel: 2, notch: 0 } };
  const hidden = { face: 1, token: 1, from: { wheel: 5, notch: 0 }, to: { exited: true } };
  const events = [{ id: 1, wheel: 5, angle: 90, transfers: [own, hidden] }];
  const baseline = visibleTransfers(events, 0);
  const original = structuredClone(events);
  renderBoard(getView(game, 0), { opponentProgress: getOpponentProgress(game, 0) });
  assert.deepEqual(visibleTransfers(events, 0), baseline);
  assert.equal(baseline.length, 1);
  assert.deepEqual(baseline[0].to, { wheel: 2, notch: 0 });
  assert.deepEqual(events, original);
});

test('rendering summaries leaves end-turn persistence and the result reveal boundary unchanged', () => {
  const game = fixture(SUPPORTED_GEOMETRY_VERSIONS[0]);
  game.verdict = { winner: 1, reason: 'order' };
  const plain = newSession(game);
  const decorated = structuredClone(plain);
  const show = () => renderBoard(getView(decorated.game, decorated.game.active), {
    opponentProgress: getOpponentProgress(decorated.game, decorated.game.active),
  });
  show();
  assert.equal(revealTarget(decorated), 'play');
  assert.equal(rotate(decorated.game, 1, 1), rotate(plain.game, 1, 1));
  show();
  assert.deepEqual(decorated, plain);
  assert.equal(transmit(decorated), transmit(plain));
  show();
  assert.deepEqual(decorated, plain);
  assert.equal(revealTarget(decorated), 'result');
  assert.equal(acceptReveal(decorated), acceptReveal(plain));
  assert.deepEqual(decorated, plain);
});
