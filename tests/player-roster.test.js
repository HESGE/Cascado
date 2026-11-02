import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHumanName, loadHumanRoster, mergeHumanNames, rememberHumanNames,
} from '../src/player-roster.js';

const KEY = 'ddc-human-roster';
const EMPTY = { names: [], lastNames: [null, null] };

function memoryStorage(raw = null) {
  const values = new Map(raw === null ? [] : [[KEY, raw]]);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test('names normalize whitespace and NFC, keep plain text and cap Unicode characters', () => {
  assert.equal(normalizeHumanName(' \t Le\u0301a\n Dupont  '), 'Léa Dupont');
  assert.equal(normalizeHumanName('<Léa & Co>'), '<Léa & Co>');
  assert.equal(normalizeHumanName(` ${'😀'.repeat(21)} `), '😀'.repeat(20));
  assert.equal(normalizeHumanName('1234567890123456789 X'), '1234567890123456789');
  for (const invalid of [null, undefined, 3, {}, ['Léa'], '\n \t']) {
    assert.equal(normalizeHumanName(invalid), '');
  }
});

test('loading absent or corrupted browser data returns a fresh safe roster', () => {
  for (const raw of [null, '{broken', 'null', '[]', '42', '"Léa"', '{"names":3,"lastNames":"Léa"}']) {
    assert.deepEqual(loadHumanRoster(memoryStorage(raw)), EMPTY);
  }
  const first = loadHumanRoster(memoryStorage());
  first.names.push('Léa');
  first.lastNames[0] = 'Léa';
  assert.deepEqual(loadHumanRoster(memoryStorage()), EMPTY);
});

test('loading repairs partial fields without accepting arbitrary object names', () => {
  const storage = memoryStorage(JSON.stringify({
    names: [' Léa ', 'LE\u0301A', null, { name: 'Robot' }, 'Lea', ' <Camille> '],
    lastNames: [' léa ', 'Zoé', 'Ignored seat'], extra: 'discarded',
  }));
  assert.deepEqual(loadHumanRoster(storage), {
    names: ['Léa', 'Lea', '<Camille>', 'Zoé'], lastNames: ['Léa', 'Zoé'],
  });
});

test('merging keeps recent input order, deduplicates case/NFC and distinguishes accents', () => {
  const previous = { names: ['Camille', 'Léa', 'Paul'], lastNames: ['Léa', 'Paul'] };
  assert.deepEqual(mergeHumanNames(previous, [' le\u0301a ', 'LÉA', 'Lea', 'Zoé']), {
    names: ['léa', 'Lea', 'Zoé', 'Camille', 'Paul'], lastNames: ['léa', 'Paul'],
  });
});

test('remembering a created game persists only normalized humans and restores both seats', () => {
  const storage = memoryStorage();
  const remembered = rememberHumanNames(EMPTY, [' \n Léa  Martin ', 'Camille'], storage);
  assert.deepEqual(remembered, {
    names: ['Léa Martin', 'Camille'], lastNames: ['Léa Martin', 'Camille'],
  });
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), remembered);
  assert.deepEqual(loadHumanRoster(storage), remembered);
});

test('AI/null or blank seats preserve each last known human without storing AI placeholders', () => {
  const storage = memoryStorage();
  const initial = rememberHumanNames(EMPTY, ['Léa', 'Camille'], storage);
  const mixed = rememberHumanNames(initial, [null, 'Zoé'], storage);
  assert.deepEqual(mixed, { names: ['Zoé', 'Léa', 'Camille'], lastNames: ['Léa', 'Zoé'] });
  const automatic = rememberHumanNames(mixed, [null, null], storage);
  assert.deepEqual(automatic, mixed);
  assert.deepEqual(rememberHumanNames(automatic, [' ', undefined], storage), mixed);
  assert.deepEqual(rememberHumanNames(EMPTY, [null, null], storage), EMPTY);
});

test('recent names are capped at 100 while both remembered humans stay selectable', () => {
  const previous = {
    names: Array.from({ length: 100 }, (_, index) => `Name ${index}`),
    lastNames: ['Name 98', 'Name 99'],
  };
  const merged = mergeHumanNames(previous, ['New person']);
  assert.equal(merged.names.length, 100);
  assert.equal(merged.names[0], 'New person');
  assert.ok(merged.names.includes('Name 98'));
  assert.ok(merged.names.includes('Name 99'));
  assert.deepEqual(merged.lastNames, previous.lastNames);
  const remembered = rememberHumanNames(merged, ['Another', 'New person'], memoryStorage());
  assert.equal(remembered.names.length, 100);
  assert.deepEqual(remembered.names.slice(0, 2), ['Another', 'New person']);
});

test('merge and remember never mutate their roster or input names', () => {
  const previous = Object.freeze({
    names: Object.freeze(['Léa', 'Camille']), lastNames: Object.freeze(['Léa', 'Camille']),
  });
  const selected = Object.freeze(['Zoé', null]);
  const merged = mergeHumanNames(previous, selected);
  const remembered = rememberHumanNames(previous, selected, memoryStorage());
  assert.deepEqual(previous, { names: ['Léa', 'Camille'], lastNames: ['Léa', 'Camille'] });
  assert.deepEqual(selected, ['Zoé', null]);
  merged.names.push('Extra');
  remembered.lastNames[0] = 'Other';
  assert.deepEqual(previous.names, ['Léa', 'Camille']);
  assert.deepEqual(previous.lastNames, ['Léa', 'Camille']);
});

test('read and write failures are nonfatal and a returned roster works in memory', () => {
  const blocked = {
    getItem() { throw new Error('Storage disabled'); },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.deepEqual(loadHumanRoster(blocked), EMPTY);
  const first = rememberHumanNames(EMPTY, ['Léa', null], blocked);
  const second = rememberHumanNames(first, [null, 'Zoé'], blocked);
  assert.deepEqual(second, { names: ['Zoé', 'Léa'], lastNames: ['Léa', 'Zoé'] });
  assert.deepEqual(rememberHumanNames(EMPTY, ['Camille', null], null), {
    names: ['Camille'], lastNames: ['Camille', null],
  });
});

test('even a throwing browser localStorage getter is safely optional', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, get() { throw new Error('Blocked origin'); },
    });
    assert.deepEqual(loadHumanRoster(), EMPTY);
    assert.deepEqual(rememberHumanNames(EMPTY, ['Léa', null]), {
      names: ['Léa'], lastNames: ['Léa', null],
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
