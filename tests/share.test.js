import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_PUBLIC_URL, APP_QR_ASSET, createAppSharePayload, copyAppLink, shareAppLink } from '../src/share.js';

const expectedPayload = {
  title: 'Cascado',
  text: 'Un duel de roues et de jetons sur un téléphone.',
  url: 'https://hesge.github.io/Cascado/',
};

test('sharing always describes the public application with a fresh payload', () => {
  assert.equal(APP_PUBLIC_URL, expectedPayload.url);
  assert.equal(APP_QR_ASSET, './assets/share/cascado-qr.png');
  const first = createAppSharePayload();
  assert.deepEqual(first, expectedPayload);
  first.url = 'https://example.test/private?token=secret';
  first.title = 'Partie de Camille';
  first.game = { player: 'Camille' };
  const second = createAppSharePayload();
  assert.notEqual(first, second);
  assert.deepEqual(second, expectedPayload);
});

test('native sharing is invoked immediately and receives no private state', async () => {
  let called = false;
  let resolveShare;
  const pending = new Promise(resolve => { resolveShare = resolve; });
  const navigatorLike = {
    share(payload) {
      assert.equal(this, navigatorLike);
      assert.deepEqual(payload, expectedPayload);
      called = true;
      return pending;
    },
    get clipboard() { assert.fail('Successful native sharing must not copy'); },
    get location() { assert.fail('The current URL must not be read'); },
    get game() { assert.fail('The game state must not be read'); },
    get session() { assert.fail('The session must not be read'); },
  };
  const result = shareAppLink(navigatorLike);
  assert.equal(called, true, 'native sharing must run before the first await');
  resolveShare();
  assert.equal(await result, 'shared');
});

test('a native share cancellation does not copy or display a fallback', async () => {
  const result = await shareAppLink({
    share: async () => { throw Object.assign(new Error('Dismissed'), { name: 'AbortError' }); },
    get clipboard() { assert.fail('Cancellation must not access the clipboard'); },
  });
  assert.equal(result, 'cancelled');
});

test('a synchronous native cancellation does not copy', async () => {
  assert.equal(await shareAppLink({
    share() { throw Object.assign(new Error('Dismissed'), { name: 'AbortError' }); },
    get clipboard() { assert.fail('Cancellation must not access the clipboard'); },
  }), 'cancelled');
});

test('a native share failure falls back to copying the canonical link', async () => {
  const written = [];
  const clipboard = {
    async writeText(value) { assert.equal(this, clipboard); written.push(value); },
  };
  assert.equal(await shareAppLink({
    async share(payload) {
      payload.url = 'https://example.test/private?token=secret';
      throw new Error('Unavailable');
    },
    clipboard,
  }), 'copied');
  assert.deepEqual(written, [APP_PUBLIC_URL]);
});

test('missing native share support copies the application link', async () => {
  const written = [];
  assert.equal(await shareAppLink({ clipboard: { writeText: async value => { written.push(value); } } }), 'copied');
  assert.deepEqual(written, [APP_PUBLIC_URL]);
});

test('synchronous native failures also fall back to copying', async () => {
  let copied;
  assert.equal(await shareAppLink({
    share() { throw new TypeError('Unsupported'); },
    clipboard: { writeText(value) { copied = value; } },
  }), 'copied');
  assert.equal(copied, APP_PUBLIC_URL);
});

test('copying uses only the canonical link and preserves the clipboard receiver', async () => {
  let copied;
  const clipboard = { async writeText(value) { assert.equal(this, clipboard); copied = value; } };
  assert.equal(await copyAppLink({ clipboard }), 'copied');
  assert.equal(copied, APP_PUBLIC_URL);
});

test('a refused clipboard falls back to manual copying without a rejection', async () => {
  const navigatorLike = { clipboard: { async writeText() { throw new Error('Permission denied'); } } };
  assert.equal(await copyAppLink(navigatorLike), 'manual');
  assert.equal(await shareAppLink(navigatorLike), 'manual');
});

test('a synchronous clipboard failure falls back to manual copying', async () => {
  assert.equal(await copyAppLink({ clipboard: { writeText() { throw new Error('Denied'); } } }), 'manual');
});

test('missing APIs return manual copying instead of throwing', async () => {
  for (const navigatorLike of [null, {}, { share: false }, { clipboard: {} }, { clipboard: { writeText: false } }]) {
    assert.equal(await copyAppLink(navigatorLike), 'manual');
    assert.equal(await shareAppLink(navigatorLike), 'manual');
  }
});

test('restricted API getters fall back safely', async () => {
  const unavailable = {
    get share() { throw new Error('Restricted'); },
    get clipboard() { throw new Error('Restricted'); },
  };
  assert.equal(await shareAppLink(unavailable), 'manual');
  assert.equal(await copyAppLink(unavailable), 'manual');
});
