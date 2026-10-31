/* A new version waits for existing game windows to close. Never force a reload. */
const VERSION = 'v1.0.0';
const PREFIX = 'dix-de-chute-static-';
const CACHE = `${PREFIX}${VERSION}`;
const ROOT = new URL('./', self.location.href);
const INSTALL_INFO = new URL('./__cache_install_info__', ROOT).href;
const ASSETS = [
  './', './index.html', './src/app.js', './src/board.js', './src/engine.js', './src/players.js', './src/ai.js', './src/ai-client.js', './src/ai-worker.js', './src/ai-motion.js', './src/ai-speed.js',
  './src/opponent-progress.js', './src/viewport-lock.js', './src/geometry.js', './src/tokens.js', './src/openings.js', './src/detents.js', './src/gesture.js', './src/wheel-hit.js', './src/magnet.js', './src/passage-feedback.js', './src/feedback.js', './src/alignment.js', './src/flow.js', './src/storage.js', './src/statistics.js', './src/series.js', './src/starting-position.js', './src/simulation.js', './src/simulation-client.js', './src/simulation-worker.js', './src/motion.js', './src/sound.js', './src/styles.css', './manifest.webmanifest',
  './assets/audio/wheel.wav', './assets/audio/slide.wav', './assets/audio/drop.wav',
  './assets/audio/LICENSE-interface.txt', './assets/audio/LICENSE-casino.txt',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
].map(path => new URL(path, ROOT).href);
const ASSET_SET = new Set(ASSETS);
const INDEX = new URL('./index.html', ROOT).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existingCache = (await caches.keys()).includes(CACHE);
    try {
      const cache = await caches.open(CACHE);
      // addAll fails the installation if any essential resource fails. Assets are
      // fetched without relying on an older HTTP cache for an update.
      await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
      const missing = await missingAssets(cache);
      if (missing.length) throw new Error('Le cache hors ligne est incomplet.');
      await cache.put(INSTALL_INFO, new Response(JSON.stringify({ firstInstall: !self.registration.active }),
        { headers: { 'Content-Type': 'application/json' } }));
    } catch (error) {
      // A failed retry of this version must not remove a previous working shell.
      if (!existingCache) await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    const cache = await caches.open(CACHE);
    const info = await cache.match(INSTALL_INFO);
    if (info && (await info.json()).firstInstall) await self.clients.claim();
    // Later activations do not reload documents. Explicit activation can change
    // the controller of the neutral page; the document itself stays loaded.
  })());
});

async function missingAssets(cache) {
  const present = await Promise.all(ASSETS.map(url => cache.match(url)));
  return ASSETS.filter((_, index) => !present[index] || !present[index].ok);
}

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const others = windows.filter(client => client.id !== event.source?.id && client.url.startsWith(ROOT.href));
      if (others.length) {
        event.source?.postMessage({ type: 'UPDATE_BLOCKED', reason: 'other-windows' });
        return;
      }
      // This message comes only from the app's explicit update action on its
      // neutral home screen, with no unfinished game. Never activate on a timer.
      event.source?.postMessage({ type: 'UPDATE_ACCEPTED', version: VERSION });
      await self.skipWaiting();
    })());
    return;
  }
  if (event.data?.type !== 'CACHE_STATUS') return;
  event.waitUntil((async () => {
    let missing = ASSETS;
    try { missing = await missingAssets(await caches.open(CACHE)); }
    catch { /* An unreadable cache is not ready for offline use. */ }
    const status = { type: 'CACHE_STATUS', version: VERSION, ready: missing.length === 0, missing };
    if (event.ports?.[0]) event.ports[0].postMessage(status);
    else event.source?.postMessage(status);
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(INDEX);
      // The index and modules belong to one atomically installed shell version.
      // Serving a newer network index alongside cached old modules would mix
      // engines. It also adds an unnecessary network wait to offline navigation.
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) return response;
      } catch { /* A loaded PWA still opens when there is no network. */ }
      return new Response(
        '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Cascado</title>' +
        '<p>Le jeu n’est pas encore disponible hors ligne. Reconnecte-toi pour terminer son chargement.</p></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    })());
    return;
  }

  // Only the explicit application shell is cached. No private game data or
  // unrelated request is written to Cache Storage.
  if (!ASSET_SET.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
