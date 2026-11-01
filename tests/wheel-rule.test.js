import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getView, rotate, endTurn } from '../src/engine.js';
import { SUPPORTED_GEOMETRY_VERSIONS } from '../src/geometry.js';
import { configurePlayers, displayedFaceIndex } from '../src/players.js';
import { wheelRestriction, wheelRestrictionMessage } from '../src/wheel-rule.js';
import { renderBoard } from '../src/board.js';
import { GAME_SETS } from '../src/game-sets.js';

const wheelTags = svg => [...svg.matchAll(/<g class="board-wheel[^"]*"[^>]*>/g)].map(match => match[0]);

test('a new turn distinguishes the previous restriction from a merely selected wheel', () => {
  const game = createGame();
  assert.deepEqual(wheelRestriction(getView(game, 0)), { blockedWheel: null, upcomingWheel: null });
  assert.deepEqual(wheelRestrictionMessage(getView(game, 0)), { kind: 'none', wheel: null, text: '' });
  assert.equal(rotate(game, 2, 0.5), true);
  assert.equal(endTurn(game), true);
  const view = { ...getView(game, game.active), selected: 3 };
  assert.deepEqual(wheelRestriction(view), { blockedWheel: 2, upcomingWheel: null });
  assert.deepEqual(wheelRestrictionMessage(view), {
    kind: 'blocked', wheel: 2, text: 'Roue 2 interdite ce tour',
  });
});

test('engaging a wheel replaces the inherited lock with one upcoming restriction', () => {
  const game = createGame();
  game.lastWheel = 3;
  assert.equal(rotate(game, 2, 0.5), true);
  const view = getView(game, game.active);
  assert.deepEqual(view.allowedWheels, [2]);
  assert.deepEqual(wheelRestriction(view), { blockedWheel: null, upcomingWheel: 2 });
  assert.deepEqual(wheelRestrictionMessage(view), {
    kind: 'upcoming', wheel: 2, text: 'Prochain tour : roue 2 interdite à l’adversaire',
  });
});

test('the actual own-face last-token exception removes a current wheel-5 lock', () => {
  for (const version of SUPPORTED_GEOMETRY_VERSIONS) for (const faceIndex of [0, 1]) {
    const game = createGame(['A', 'B'], faceIndex, version);
    game.lastWheel = 5;
    const viewBefore = getView(game, faceIndex);
    assert.equal(wheelRestriction(viewBefore).blockedWheel, 5, version);
    const face = game.faces[faceIndex];
    const lastToken = face.queue.at(-1);
    face.exited = face.queue.slice(0, -1);
    face.queue = [];
    face.slots[4][0] = lastToken;
    assert.equal(wheelRestriction(getView(game, faceIndex)).blockedWheel, null, version);
    face.slots[4][0] = null;
    face.slots[3][0] = lastToken;
    assert.equal(wheelRestriction(getView(game, faceIndex)).blockedWheel, 5, version);
  }
});

test('an upcoming wheel-5 restriction always explains the exception without predicting it', () => {
  for (const lastTokenOnFive of [false, true]) {
    const game = createGame();
    game.engaged = 5;
    if (lastTokenOnFive) {
      game.faces[1].queue = [];
      game.faces[1].exited = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      game.faces[1].slots[4][0] = 10;
    }
    assert.deepEqual(wheelRestrictionMessage(getView(game, 0)), {
      kind: 'upcoming', wheel: 5, text: 'Adversaire : roue 5 interdite, sauf dernier jeton',
    });
    assert.deepEqual(wheelRestrictionMessage(getView(game, 0), { watchingOpponent: true }), {
      kind: 'upcoming', wheel: 5, text: 'Ton prochain tour : roue 5 interdite, sauf dernier jeton',
    });
  }
});

test('on a human display during an AI turn, the current lock names the AI and the future lock names the human', () => {
  for (const humanIndex of [0, 1]) {
    const aiIndex = 1 - humanIndex;
    const game = configurePlayers(createGame(['A', 'B'], aiIndex), [0, 1].map(index => ({
      controller: index === humanIndex ? 'human' : 'ai',
    })));
    assert.equal(displayedFaceIndex(game), humanIndex);
    game.lastWheel = 3;
    const displayed = () => getView(game, displayedFaceIndex(game));
    assert.deepEqual(wheelRestrictionMessage(displayed(), { watchingOpponent: true }), {
      kind: 'blocked', wheel: 3, text: 'Roue 3 interdite à l’IA ce tour',
    });
    assert.equal(rotate(game, 2, 0.5), true);
    assert.deepEqual(wheelRestrictionMessage(displayed(), { watchingOpponent: true }), {
      kind: 'upcoming', wheel: 2, text: 'Ton prochain tour : roue 2 interdite',
    });
  }
});

test('restriction cues read no token positions, player identities, opponent state or verdict', () => {
  const view = { engaged: 5, lastWheel: 3, allowedWheels: [5] };
  for (const field of ['faces', 'queue', 'queues', 'slots', 'exited', 'opponent', 'opponentProgress', 'verdict', 'players', 'name']) {
    Object.defineProperty(view, field, { get() { throw new Error(`Private field read: ${field}`); } });
  }
  assert.deepEqual(wheelRestriction(view), { blockedWheel: null, upcomingWheel: 5 });
  assert.equal(wheelRestrictionMessage(view).kind, 'upcoming');
  view.engaged = null;
  assert.deepEqual(wheelRestrictionMessage(view), {
    kind: 'blocked', wheel: 3, text: 'Roue 3 interdite ce tour',
  });
});

test('unknown or incomplete wheel state cannot invent a lock', () => {
  for (const view of [undefined, null, {}, { lastWheel: 3 }, { lastWheel: 3, allowedWheels: [1, 2, 3, 4, 5] }]) {
    assert.deepEqual(wheelRestriction(view), { blockedWheel: null, upcomingWheel: null });
  }
  for (const wheel of [0, 6, -1, 1.5, '3', NaN]) {
    assert.deepEqual(wheelRestriction({ lastWheel: wheel, allowedWheels: [] }), { blockedWheel: null, upcomingWheel: null });
    assert.deepEqual(wheelRestriction({ engaged: wheel }), { blockedWheel: null, upcomingWheel: null });
  }
});

test('after passing a real turn, exactly the previous wheel carries the blocked marker, lock and accessible reason', () => {
  for (const { geometryVersion } of GAME_SETS) for (const starter of [0, 1]) {
    const game = createGame(['A', 'B'], starter, geometryVersion);
    assert.equal(rotate(game, 2, 0.5), true);
    assert.equal(endTurn(game), true);
    const svg = renderBoard(getView(game, game.active));
    const wheels = wheelTags(svg);
    assert.equal(wheels.length, 5);
    const blocked = wheels.filter(tag => /data-wheel-rule="blocked"/.test(tag));
    assert.equal(blocked.length, 1);
    assert.match(blocked[0], /data-wheel="2"/);
    assert.match(blocked[0], /aria-label="Roue 2, interdite pour ce tour,/);
    assert.match(blocked[0], /aria-disabled="true"/);
    assert.match(blocked[0], /tabindex="-1"/);
    assert.equal((svg.match(/class="wheel-rule-lock"/g) ?? []).length, 1);
    assert.equal((svg.match(/class="wheel-rule-ring"/g) ?? []).length, 1);
    assert.doesNotMatch(svg, /data-wheel-rule="upcoming"/);
  }
});

test('an engaged wheel alone previews the next restriction; the other four give the continue-on-wheel reason', () => {
  for (const { geometryVersion } of GAME_SETS) for (const faceIndex of [0, 1]) {
    const game = createGame(['A', 'B'], faceIndex, geometryVersion);
    game.lastWheel = 3;
    assert.equal(rotate(game, 2, 0.5), true);
    const svg = renderBoard(getView(game, game.active));
    const wheels = wheelTags(svg);
    const upcoming = wheels.filter(tag => /data-wheel-rule="upcoming"/.test(tag));
    assert.equal(upcoming.length, 1);
    assert.match(upcoming[0], /data-wheel="2"/);
    assert.match(upcoming[0], /aria-label="Roue 2, engagée pour ce tour, interdite au prochain tour,/);
    assert.match(upcoming[0], /aria-disabled="false"/);
    const otherWheels = wheels.filter(tag => !/data-wheel="2"/.test(tag));
    assert.equal(otherWheels.length, 4);
    for (const tag of otherWheels) {
      assert.match(tag, /aria-disabled="true"/);
      assert.match(tag, /indisponible : continue sur la roue 2/);
      assert.doesNotMatch(tag, /interdite pour ce tour|data-wheel-rule=/);
    }
    assert.doesNotMatch(svg, /data-wheel-rule="blocked"/);
    assert.equal((svg.match(/class="wheel-rule-lock"/g) ?? []).length, 1);
  }
});

test('selection alone never draws a future lock, and an allowed last-token wheel 5 has no blocked decoration', () => {
  for (const { geometryVersion } of GAME_SETS) for (const faceIndex of [0, 1]) {
    const game = createGame(['A', 'B'], faceIndex, geometryVersion);
    const selectedOnly = renderBoard({ ...getView(game, faceIndex), selected: 2 });
    assert.doesNotMatch(selectedOnly, /data-wheel-rule=|class="wheel-rule-lock"/);
    game.lastWheel = 5;
    const face = game.faces[faceIndex];
    const lastToken = face.queue.at(-1);
    face.exited = face.queue.slice(0, -1);
    face.queue = [];
    face.slots[4][0] = lastToken;
    const svg = renderBoard(getView(game, faceIndex));
    const fifth = wheelTags(svg).find(tag => /data-wheel="5"/.test(tag));
    assert.ok(fifth);
    assert.match(fifth, /aria-disabled="false"/);
    assert.doesNotMatch(fifth, /interdite|data-wheel-rule=/);
    assert.doesNotMatch(svg, /class="wheel-rule-lock"/);
  }
});
