import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = new URL('https://example.test/jeux/dix/');
const workerCode = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const workerContext = vm.createContext({ URL, Set,
  self: { location: { href: new URL('sw.js', root).href }, addEventListener() {} } });
vm.runInContext(workerCode, workerContext);
const assets = [...vm.runInContext('ASSETS', workerContext)];
const assetPaths = assets.map(url => new URL(url).pathname.slice(root.pathname.length)).filter(Boolean);

function registerStaticTests() {
test('PWA: precache covers every local module, stylesheet, manifest and icon under a subpath', async () => {
  const manifest = JSON.parse(await readFile(path.join(project, 'manifest.webmanifest'), 'utf8'));
  const required = new Set(['index.html', 'src/app.js', 'src/board.js', 'src/engine.js', 'src/geometry.js', 'src/players.js', 'src/ai.js', 'src/ai-client.js', 'src/ai-worker.js', 'src/ai-motion.js', 'src/ai-speed.js',
    'src/openings.js', 'src/detents.js', 'src/gesture.js', 'src/magnet.js', 'src/passage-feedback.js', 'src/feedback.js', 'src/alignment.js', 'src/flow.js', 'src/storage.js', 'src/statistics.js', 'src/series.js', 'src/starting-position.js', 'src/simulation.js', 'src/simulation-client.js', 'src/simulation-worker.js', 'src/motion.js', 'src/sound.js', 'src/styles.css', 'manifest.webmanifest',
    'assets/audio/wheel.wav','assets/audio/slide.wav','assets/audio/drop.wav',
    ...manifest.icons.map(icon => icon.src.replace(/^\.\//, ''))]);
  for (const asset of assets) assert.ok(asset.startsWith(root.href), `${asset} left the app scope`);
  for (const resource of required) assert.ok(assetPaths.includes(resource), `${resource} missing from cache`);
  let bytes = 0;
  for (const resource of assetPaths) bytes += (await stat(path.join(project, resource))).size;
  assert.ok(bytes < 2_000_000, `Essential shell is ${bytes} bytes`);
  for (const file of assetPaths.filter(resource => resource.endsWith('.js'))) {
    const source = await readFile(path.join(project, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      assert.ok(assetPaths.includes(dependency), `${file} imports uncached ${dependency}`);
    }
  }
});

test('PWA: manifest identity, relative installation paths and PNG sizes are valid', async () => {
  const manifest = JSON.parse(await readFile(path.join(project, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.lang, 'fr');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  for (const key of ['id', 'scope', 'start_url']) assert.equal(manifest[key], './');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons.filter(item => item.type === 'image/png')) {
    const bytes = await readFile(path.join(project, icon.src));
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), width);
    assert.equal(bytes.readUInt32BE(20), height);
  }
});

}

const runBrowser = Boolean(process.env.DDC_BROWSER_TEST_URL);
let browser;
let server;
let nestedURL;
let workerVersion = 'v1.0.0';
let failFlow = false;
async function initializeBrowser() {
  if (!runBrowser) return;
  const require = createRequire(import.meta.url);
  const playwright = require('playwright');
  const browserType = playwright[process.env.DDC_BROWSER || 'chromium'];
  browser = await browserType.launch({ headless: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname.replace(/^\/jeux\/dix\//, '') || 'index.html';
      const file = path.resolve(project, relative);
      if (!pathname.startsWith('/jeux/dix/') || !file.startsWith(project)) throw new Error('outside scope');
      if (failFlow && relative === 'src/flow.js') throw new Error('Essential module intentionally unavailable');
      let bytes = await readFile(file);
      if (relative === 'sw.js') bytes = Buffer.from(bytes.toString().replace("const VERSION = 'v1.0.0'", `const VERSION = '${workerVersion}'`));
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end('Introuvable'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  nestedURL = `http://127.0.0.1:${server.address().port}/jeux/dix/`;
}
await initializeBrowser();
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

// Register hooks before any test starts (also required by Node.js 20).
registerStaticTests();

test(`PWA: install, offline navigation and resume under a subpath (${process.env.DDC_PWA_ORIGIN_STOP ? 'origin stopped' : 'offline emulation'})`, { skip: !runBrowser, timeout: 20_000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await context.newPage();
  const errors = [];
  let stoppedPort;
  try {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(nestedURL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const initial = await page.evaluate(async () => {
    const { port1, port2 } = new MessageChannel();
    const result = new Promise(resolve => { port1.onmessage = event => resolve(event.data); });
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_STATUS' }, [port2]);
    return result;
  });
  assert.equal(initial.ready, true);
  assert.equal(initial.version, 'v1.0.0');
  assert.deepEqual(initial.missing, []);
  if (process.env.DDC_PWA_ORIGIN_STOP) {
    // A real unavailable origin is a separate diagnostic from browser offline
    // emulation. In particular Playwright WebKit issue #42775 rejects even a
    // literal SW Response when its offline flag is enabled.
    stoppedPort = server.address().port;
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    assert.equal(server.listening, false);
  } else await context.setOffline(true);
  await page.reload();
  assert.match(await page.title(), /Cascado/);
  await page.waitForSelector('button');
  const saved = await page.evaluate(async () => {
    const { createGame, rotate } = await import('./src/engine.js');
    const { newSession } = await import('./src/flow.js');
    const { saveGame, loadGame } = await import('./src/storage.js');
    const session = newSession(createGame(['Camille', 'Léa'], 0));
    rotate(session.game, 1, 5);
    await saveGame(session, { action: 'offline-test' });
    return loadGame();
  });
  assert.equal(saved.phase, 'open');
  assert.equal(saved.game.engaged, 1);
  await page.reload();
  await page.getByRole('button', { name: 'Je suis Camille — afficher mon plateau', exact: true }).waitFor();
  assert.equal(await page.locator('[data-board]').count(), 0);
  assert.equal(await page.locator('svg[aria-label*="plateau"]').count(), 0);
  assert.deepEqual(errors, []);
  } finally {
    await context.close();
    if (stoppedPort) await new Promise(resolve => server.listen(stoppedPort, '127.0.0.1', resolve));
  }
});

test('PWA: cache health refuses readiness when an essential module is missing', { skip: !runBrowser, timeout: 20_000 }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(nestedURL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const status = await page.evaluate(async () => {
    const cache = await caches.open('dix-de-chute-static-v1.0.0');
    await cache.delete(new URL('./src/flow.js', location.href).href);
    const { port1, port2 } = new MessageChannel();
    const result = new Promise(resolve => { port1.onmessage = event => resolve(event.data); });
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_STATUS' }, [port2]);
    return result;
  });
  assert.equal(status.ready, false);
  assert.equal(status.missing.length, 1);
  assert.ok(status.missing[0].endsWith('/src/flow.js'));
  await context.close();
});

test('PWA: a failed essential resource aborts installation without a partial offline cache', { skip: !runBrowser, timeout: 20_000 }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(new URL('icons/icon.svg', nestedURL).href);
    failFlow = true;
    const result = await page.evaluate(async (url) => {
      const registration = await navigator.serviceWorker.register(new URL('sw.js', url).href, { scope: url });
      const worker = registration.installing;
      if (worker && worker.state !== 'redundant') await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); });
      });
      return { caches: await caches.keys(), active: Boolean(registration.active), state: worker?.state };
    }, nestedURL);
    assert.equal(result.active, false);
    assert.equal(result.state, 'redundant');
    assert.deepEqual(result.caches, []);
  } finally { failFlow = false; await context.close(); }
});

test('PWA: updates wait, refuse other windows and never reload an existing document', { skip: !runBrowser, timeout: 20_000 }, async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(new URL('icons/icon.svg', nestedURL).href);
    await page.evaluate(async url => {
      await navigator.serviceWorker.register(new URL('sw.js', url).href, { scope: url });
    }, nestedURL);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const secondPage = await context.newPage();
    await secondPage.goto(new URL('icons/icon.svg', nestedURL).href);
    await page.evaluate(() => {
      window.controllerChanges = 0;
      window.updateDocumentMarker = 'still-the-same-document';
      navigator.serviceWorker.addEventListener('controllerchange', () => { window.controllerChanges++; });
    });
    workerVersion = 'v1.0.1';
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      if (registration.waiting) return;
      const worker = registration.installing;
      if (worker && worker.state !== 'installed') await new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (worker.state === 'installed') resolve(); });
      });
    });
    const blocked = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration.waiting) return { absent: true, active: registration.active?.state,
        installing: registration.installing?.state, controlled: Boolean(navigator.serviceWorker.controller),
        changes: window.controllerChanges };
      const result = new Promise(resolve => {
        navigator.serviceWorker.addEventListener('message', function listener(event) {
          if (event.data?.type === 'UPDATE_BLOCKED') {
            navigator.serviceWorker.removeEventListener('message', listener);
            resolve(event.data);
          }
        });
      });
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      return result;
    });
    assert.equal(blocked.reason, 'other-windows', JSON.stringify(blocked));
    await secondPage.close();
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker = registration.waiting;
      const activated = new Promise(resolve => {
        worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); });
      });
      worker.postMessage({ type: 'ACTIVATE_UPDATE' });
      await activated;
    });
    assert.equal(await page.evaluate(() => window.updateDocumentMarker), 'still-the-same-document');
    await page.reload();
    const status = await page.evaluate(async () => {
      const { port1, port2 } = new MessageChannel();
      const result = new Promise(resolve => { port1.onmessage = event => resolve(event.data); });
      navigator.serviceWorker.controller.postMessage({ type: 'CACHE_STATUS' }, [port2]);
      return result;
    });
    assert.equal(status.version, 'v1.0.1');
    assert.equal(status.ready, true);
  } finally { workerVersion = 'v1.0.0'; await context.close(); }
});
