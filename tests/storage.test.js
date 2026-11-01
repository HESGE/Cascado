import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Real IndexedDB integration tests. Run against the local server with
// DDC_BROWSER_TEST_URL=http://127.0.0.1:4173 and Playwright available via NODE_PATH.
// The ordinary dependency-free engine suite can run without a browser installation.
const baseURL = process.env.DDC_BROWSER_TEST_URL;
let browser;
let context;
let page;
async function initializeBrowser() {
  if (!baseURL) return;
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  page = await context.newPage();
  await page.goto(new URL('./icons/icon.svg', `${baseURL}/`).href);
}
await initializeBrowser();
after(async () => { await context?.close(); await browser?.close(); });

test('IndexedDB: snapshot copied at enqueue time, UI reveal authorization excluded', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    await storage.clearGame();
    const saved = { game: { active: 0, turn: 1, angles: [0, 0, 0, 0, 0] },
      phase: 'open', recipient: 0, confirmed: true, screen: 'private-board' };
    const pending = storage.saveGame(saved, { action: 'start' });
    saved.game.angles[0] = 99;
    await pending;
    return { saved: await storage.loadGame(), available: await storage.storageAvailable() };
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.saved, { game: { active: 0, turn: 1, angles: [0, 0, 0, 0, 0] }, phase: 'open', recipient: 0 });
});

test('IndexedDB: queued writes preserve order and snapshot/journal share a revision', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    await Promise.all([
      storage.saveGame({ game: { active: 0, turn: 1, angle: 0.5 }, phase: 'open', recipient: 0 }, { action: 'rotate' }),
      storage.saveGame({ game: { active: 1, turn: 2, angle: 1 }, phase: 'passed', recipient: 1 }, { action: 'transmit' }),
    ]);
    const saved = await storage.loadGame();
    const history = await storage.getHistory(3);
    const record = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dix-de-chute-v1', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('state', 'readonly');
        const read = tx.objectStore('state').get('current');
        read.onsuccess = () => resolve(read.result);
        tx.oncomplete = () => db.close();
        tx.onabort = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    return { saved, history, record };
  });
  assert.equal(result.saved.phase, 'passed');
  assert.equal(result.saved.game.turn, 2);
  assert.deepEqual(result.history.map(entry => entry.revision), [3, 2, 1]);
  assert.equal(result.record.revision, result.history[0].revision);
  assert.deepEqual(result.record.saved, result.history[0].saved);
});

test('IndexedDB: journal failure aborts snapshot too and a subsequent retry succeeds', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const before = await storage.loadGame();
    const historyBefore = await storage.getHistory();
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'journal') {
        this.transaction.abort();
        throw new DOMException('Quota de test dépassé', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
    let errorName;
    try { await storage.saveGame({ game: { active: 0, turn: 999 }, phase: 'open', recipient: 0 }); }
    catch (error) { errorName = error.name; }
    finally { IDBObjectStore.prototype.put = originalPut; }
    const after = await storage.loadGame();
    const historyAfter = await storage.getHistory();
    await storage.saveGame({ game: { active: 0, turn: 3 }, phase: 'open', recipient: 0 }, { action: 'retry' });
    return { before, after, historyBefore, historyAfter, errorName, retry: await storage.loadGame() };
  });
  assert.equal(result.errorName, 'StorageError');
  assert.deepEqual(result.after, result.before);
  assert.deepEqual(result.historyAfter, result.historyBefore);
  assert.equal(result.retry.game.turn, 3);
});

test('IndexedDB: journal retention is bounded while the last full state is durable', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const pending = [];
    for (let turn = 4; turn <= 265; turn++) {
      pending.push(storage.saveGame({ game: { active: turn % 2, turn }, phase: 'open', recipient: turn % 2 }));
    }
    await Promise.all(pending);
    return { history: await storage.getHistory(999), saved: await storage.loadGame() };
  });
  assert.equal(result.history.length, 256);
  assert.equal(result.saved.game.turn, 265);
  assert.equal(result.history[0].saved.game.turn, 265);
  assert.equal(result.history.at(-1).revision, result.history[0].revision - 255);
});

test('IndexedDB: clearing removes both snapshot and journal', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    await storage.clearGame();
    return { saved: await storage.loadGame(), history: await storage.getHistory() };
  });
  assert.equal(result.saved, null);
  assert.deepEqual(result.history, []);
});

test('IndexedDB: unavailable storage reports failure without a memory substitute', { skip: !baseURL }, async () => {
  const isolatedPage = await context.newPage();
  await isolatedPage.goto(new URL('./icons/icon.svg', `${baseURL}/`).href);
  const result = await isolatedPage.evaluate(async () => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true });
    const storage = await import('/src/storage.js');
    const errors = [];
    for (const operation of [() => storage.loadGame(), () => storage.loadStatistics(), () => storage.resetStatistics(),
      () => storage.saveGame({ game: { active: 0 }, phase: 'open', recipient: 0 }), () => storage.clearGame()]) {
      try { await operation(); errors.push(null); } catch (error) { errors.push(error.name); }
    }
    return { available: await storage.storageAvailable(), errors };
  });
  await isolatedPage.close();
  assert.equal(result.available, false);
  assert.deepEqual(result.errors, ['StorageError', 'StorageError', 'StorageError', 'StorageError', 'StorageError']);
});

test('IndexedDB: a hidden verdict never counts before result revelation, then counts once', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    await storage.clearGame();
    await storage.resetStatistics();
    const game = { statsId: crypto.randomUUID(), active: 1, turn: 7,
      players: [{ name: 'Camille', controller: 'human' }, { name: 'Léa', controller: 'ai', level: 'hard' }],
      verdict: { winner: 0, reason: 'complete' } };
    const totals = [];
    for (const phase of ['open', 'passed', 'revealed-result', 'revealed-result']) {
      await storage.saveGame({ game, phase, recipient: 1 });
      totals.push((await storage.loadStatistics()).totalGames);
    }
    return { totals, statistics: await storage.loadStatistics() };
  });
  assert.deepEqual(result.totals, [0, 0, 1, 1]);
  assert.equal(result.statistics.totalTurns, 6);
  assert.equal(result.statistics.profiles[0].wins, 1);
  assert.equal(result.statistics.profiles[1].losses, 1);
  assert.equal(result.statistics.profiles[1].level, 'hard');
});

test('IndexedDB: reset preserves the current game and journal, and never resurrects an old result', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const saved = await storage.loadGame();
    const history = await storage.getHistory(256);
    const reset = await storage.resetStatistics();
    const after = await storage.loadGame();
    const historyAfter = await storage.getHistory(256);
    await storage.saveGame(saved);
    const replayed = await storage.loadStatistics();
    const next = structuredClone(saved);
    next.game.statsId = crypto.randomUUID();
    await storage.saveGame(next);
    return { saved, history, reset, after, historyAfter, replayed, next: await storage.loadStatistics() };
  });
  assert.equal(result.reset.totalGames, 0);
  assert.deepEqual(result.reset.profiles, []);
  assert.deepEqual(result.after, result.saved);
  assert.deepEqual(result.historyAfter, result.history);
  assert.equal(result.replayed.totalGames, 0);
  assert.equal(result.next.totalGames, 1);
});

test('IndexedDB: clearing a match keeps counters and consumed IDs', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const saved = await storage.loadGame();
    const before = await storage.loadStatistics();
    await storage.clearGame();
    const afterClear = { game: await storage.loadGame(), history: await storage.getHistory(), statistics: await storage.loadStatistics() };
    await storage.saveGame(saved);
    return { before, afterClear, replayed: await storage.loadStatistics() };
  });
  assert.equal(result.afterClear.game, null);
  assert.deepEqual(result.afterClear.history, []);
  assert.deepEqual(result.afterClear.statistics, result.before);
  assert.deepEqual(result.replayed, result.before);
});

test('IndexedDB: competing tabs count the same result exactly once', { skip: !baseURL }, async () => {
  const otherPage = await context.newPage();
  await otherPage.goto(new URL('./icons/icon.svg', `${baseURL}/`).href);
  try {
    const saved = await page.evaluate(async () => {
      const storage = await import('/src/storage.js');
      await storage.resetStatistics();
      return { game: { statsId: crypto.randomUUID(), active: 0, turn: 4,
        players: [{ name: 'A' }, { name: 'B' }], verdict: { winner: null, reason: 'draw' } },
      phase: 'revealed-result', recipient: 0 };
    });
    await Promise.all([page, otherPage].map(tab => tab.evaluate(async value => {
      const storage = await import('/src/storage.js');
      await storage.saveGame(value);
    }, saved)));
    const statistics = await page.evaluate(async () => (await import('/src/storage.js')).loadStatistics());
    assert.equal(statistics.totalGames, 1);
    assert.deepEqual(statistics.profiles.map(profile => profile.draws), [1, 1]);
  } finally { await otherPage.close(); }
});

test('IndexedDB: failed statistics commit rolls back snapshot, journal and dedup marker together', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const saved = { game: { statsId: crypto.randomUUID(), active: 0, turn: 2,
      players: [{ name: 'A' }, { name: 'B' }], verdict: { winner: 0, reason: 'order' } }, phase: 'open', recipient: 0 };
    await storage.saveGame(saved);
    const before = { game: await storage.loadGame(), history: await storage.getHistory(), statistics: await storage.loadStatistics() };
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'state' && args[0]?.id === 'statistics') {
        this.transaction.abort();
        throw new DOMException('Quota de test dépassé', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
    let error;
    saved.phase = 'revealed-result';
    try { await storage.saveGame(saved); } catch (failure) { error = failure.name; }
    finally { IDBObjectStore.prototype.put = originalPut; }
    const after = { game: await storage.loadGame(), history: await storage.getHistory(), statistics: await storage.loadStatistics() };
    await storage.saveGame(saved);
    return { error, before, after, retried: await storage.loadStatistics() };
  });
  assert.equal(result.error, 'StorageError');
  assert.deepEqual(result.after, result.before);
  assert.equal(result.retried.totalGames, result.before.statistics.totalGames + 1);
});

test('IndexedDB: legacy totals survive and Miroir 50 saves retain pool provenance with separate counters', { skip: !baseURL }, async () => {
  const result = await page.evaluate(async () => {
    const storage = await import('/src/storage.js');
    const { recordStatistics } = await import('/src/statistics.js');
    const { createGame } = await import('/src/engine.js');
    const { MIRROR_GEOMETRY_VERSION } = await import('/src/geometry.js');
    const { configureGameSet } = await import('/src/starting-position.js');
    await storage.resetStatistics();
    const legacy = recordStatistics(undefined, { statsId: crypto.randomUUID(), turn: 8,
      players: [{ name: 'A' }, { name: 'B' }], verdict: { winner: 0, reason: 'complete' } });
    delete legacy.gameSets;
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('dix-de-chute-v1', 1);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction('state', 'readwrite');
        tx.objectStore('state').put({ id: 'statistics', value: legacy });
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onabort = () => { database.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
    const migrated = await storage.loadStatistics();
    const game = configureGameSet(createGame(['A', 'B'], 0, MIRROR_GEOMETRY_VERSION),
      'miroir-50', { mode: 'miroir-50', seed: 42 });
    game.statsId = crypto.randomUUID();
    game.turn = 6;
    game.verdict = { winner: 1, reason: 'complete' };
    const saved = { game, phase: 'revealed-result', recipient: game.active };
    await storage.saveGame(saved);
    const restored = await storage.loadGame();
    const statistics = await storage.loadStatistics();
    const reset = await storage.resetStatistics();
    await storage.saveGame(saved);
    return { migrated, saved, restored, statistics, reset, afterReplay: await storage.loadStatistics() };
  });
  assert.equal(result.migrated.totalGames, 1);
  assert.deepEqual(result.migrated.gameSets.map(group => [group.id, group.totalGames]), [['reference', 1]]);
  assert.deepEqual(result.restored, result.saved);
  assert.equal(result.restored.game.gameSetId, 'miroir-50');
  assert.ok(result.restored.game.startingPose.poolId);
  assert.equal(result.statistics.totalGames, 2);
  assert.deepEqual(result.statistics.gameSets.map(group => [group.id, group.totalGames]),
    [['reference', 1], ['miroir-50', 1]]);
  assert.deepEqual(result.reset.gameSets, []);
  assert.deepEqual(result.afterReplay, result.reset);
});
