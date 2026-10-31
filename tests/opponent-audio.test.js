import test from 'node:test';
import assert from 'node:assert/strict';
import { hasOpponentFall, visibleTransfers } from '../src/flow.js';

const batch = transfers => ({ id: 1, wheel: 3, angle: 42, transfers });
const fall = (face, from, to, token = 1) => ({ face, token, from, to });

for (const viewer of [0, 1]) {
  for (const [kind, from, to] of [
    ['queue', { queue: true, lane: 0 }, { wheel: 1, notch: 0 }],
    ['internal', { wheel: 2, notch: 0 }, { wheel: 3, notch: 1 }],
    ['collection', { wheel: 5, notch: 0 }, { exited: true }],
  ]) {
    test(`viewer ${viewer}: an opponent ${kind} fall authorises only a boolean cue`, () => {
      const opposing = [batch([fall(1 - viewer, from, to)])];
      assert.equal(hasOpponentFall(opposing, viewer), true);
      assert.equal(typeof hasOpponentFall(opposing, viewer), 'boolean');
      assert.deepEqual(visibleTransfers(opposing, viewer), [], 'the detailed animation projection remains private');
      assert.equal(hasOpponentFall([batch([fall(viewer, from, to)])], viewer), false,
        'an own fall already has its visible animation and sound');
    });
  }
}

test('empty batches, wheel rotations and non-fall events stay silent', () => {
  assert.equal(hasOpponentFall([], 0), false);
  assert.equal(hasOpponentFall([batch([])], 0), false);
  const events = [batch([
    fall(0, { wheel: 1, notch: 0 }, { wheel: 2, notch: 0 }),
    fall(1, { queue: true }, { exited: true }),
    fall(1, {}, { wheel: 1 }),
    fall(1, { wheel: 2 }, {}),
    fall(1, { wheel: 0 }, { wheel: 1 }),
    fall(1, { wheel: 6 }, { exited: true }),
    fall(1, { queue: true }, { wheel: '1' }),
    fall(2, { wheel: 1 }, { wheel: 2 }),
  ])];
  assert.equal(hasOpponentFall(events, 0), false);
});

test('several hidden falls expose neither a count nor their identity or geometry', () => {
  const hidden = face => {
    const transfer = { face, from: { wheel: 2 }, to: { wheel: 3 } };
    for (const key of ['token', 'angle', 'notch', 'position']) {
      Object.defineProperty(transfer, key, { get() { throw new Error(`private ${key}`); } });
    }
    return transfer;
  };
  const event = { transfers: [hidden(0), hidden(1), hidden(1)] };
  for (const key of ['id', 'wheel', 'angle']) {
    Object.defineProperty(event, key, { get() { throw new Error(`private batch ${key}`); } });
  }
  assert.equal(hasOpponentFall([event], 0), true);
  assert.equal(hasOpponentFall([event], 1), true);
});

test('the cue uses only supplied new events and does not modify frozen inputs', () => {
  const transfer = fall(1, { wheel: 5, notch: 0 }, { exited: true }, 7);
  const events = [batch([transfer]), batch([])];
  const before = structuredClone(events);
  Object.freeze(transfer.from); Object.freeze(transfer.to); Object.freeze(transfer);
  events.forEach(event => { Object.freeze(event.transfers); Object.freeze(event); });
  Object.freeze(events);
  assert.equal(hasOpponentFall(events, 0), true);
  assert.equal(hasOpponentFall(events.slice(1), 0), false, 'past falls are not replayed by the next empty rotation');
  assert.deepEqual(events, before);
});

test('invalid viewers cannot authorise an arbitrary opponent cue', () => {
  const events = [batch([fall(1, { wheel: 1 }, { wheel: 2 })])];
  for (const viewer of [-1, 2, '0', null, undefined, NaN]) {
    assert.throws(() => hasOpponentFall(events, viewer), RangeError);
  }
});
