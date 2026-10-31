/**
 * The saved model is private local data, never a reusable permission to reveal it.
 * Each accepted operation replaces the snapshot and appends its journal entry in
 * the same IndexedDB transaction. The latest 256 commits remain available for
 * diagnosis; the current snapshot always contains the complete authoritative game.
 */
import { emptyStatistics, normalizeStatistics, recordStatistics, validStatisticsGame } from './statistics.js';

const DATABASE = 'dix-de-chute-v1';
const DATABASE_VERSION = 1;
const FORMAT_VERSION = 1;
const JOURNAL_LIMIT = 256;
const PHASES = new Set(['open', 'passed', 'revealed-result']);

let databasePromise;
let writeQueue = Promise.resolve();

export class StorageError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'StorageError';
  }
}

function plainCopy(value, depth = 0) {
  if (depth > 64) throw new StorageError('Les données de partie sont trop complexes.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(item => plainCopy(item, depth + 1));
  if (value && typeof value === 'object' &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const result = {};
    for (const key of Object.keys(value)) {
      // Define the property explicitly so even untrusted property names are data.
      Object.defineProperty(result, key, {
        value: plainCopy(value[key], depth + 1), enumerable: true, writable: true, configurable: true,
      });
    }
    return result;
  }
  throw new StorageError('La sauvegarde contient une donnée non prise en charge.');
}

function normalizeSaved(saved) {
  if (!saved || !saved.game || typeof saved.game !== 'object' || Array.isArray(saved.game) ||
      !PHASES.has(saved.phase) || !Number.isInteger(saved.recipient) ||
      saved.recipient < 0 || saved.recipient > 1) {
    throw new StorageError('Le format de la partie ne peut pas être sauvegardé.');
  }
  // Deliberately discard UI state, including any confirmation/reveal permission.
  return { game: plainCopy(saved.game), phase: saved.phase, recipient: saved.recipient };
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new StorageError('Le stockage local est indisponible dans ce navigateur.'));
      return;
    }
    let settled = false;
    let request;
    try { request = globalThis.indexedDB.open(DATABASE, DATABASE_VERSION); }
    catch (error) {
      reject(new StorageError('Impossible d’ouvrir le stockage local.', error));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('state')) database.createObjectStore('state', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('journal')) database.createObjectStore('journal', { keyPath: 'revision' });
    };
    request.onblocked = () => {
      settled = true;
      reject(new StorageError('Le stockage est bloqué par un autre onglet. Ferme les autres fenêtres du jeu.'));
    };
    request.onerror = () => {
      settled = true;
      reject(new StorageError('Impossible d’ouvrir le stockage local.', request.error));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) { database.close(); return; }
      settled = true;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

function transaction(database, stores, mode) {
  if (mode !== 'readwrite') return database.transaction(stores, mode);
  // Strict durability requests that commits reach durable storage before success.
  // Older implementations ignore the optional third argument or reject it.
  try { return database.transaction(stores, mode, { durability: 'strict' }); }
  catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return database.transaction(stores, mode);
  }
}

function completed(tx, message) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new StorageError(message, tx.error));
    tx.onerror = () => { /* The transaction's abort is the authoritative failure. */ };
  });
}

function serialWrite(operation) {
  const next = writeQueue.then(operation);
  // A failed write is reported to its caller; it must not poison future retries.
  writeQueue = next.catch(() => {});
  return next;
}

/** Load only the model and resume purpose. Every caller must start behind a mask. */
export async function loadGame() {
  await writeQueue;
  const database = await openDatabase();
  try {
    const tx = transaction(database, ['state'], 'readonly');
    const done = completed(tx, 'Impossible de lire la sauvegarde.');
    const request = tx.objectStore('state').get('current');
    let record;
    request.onsuccess = () => { record = request.result; };
    await done;
    if (!record) return null;
    if (record.formatVersion !== FORMAT_VERSION) {
      throw new StorageError('Cette sauvegarde provient d’une version incompatible du jeu.');
    }
    return normalizeSaved(record.saved);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('Impossible de lire la sauvegarde.', error);
  }
}

/** A resolving promise means both snapshot and journal committed successfully. */
export function saveGame(saved, meta = {}) {
  // Copy now: later UI mutations cannot change an operation already queued.
  let payload;
  let detail;
  try { payload = normalizeSaved(saved); detail = plainCopy(meta); }
  catch (error) { return Promise.reject(error); }
  return serialWrite(async () => {
    const database = await openDatabase();
    try {
      const tx = transaction(database, ['state', 'journal'], 'readwrite');
      const done = completed(tx, 'La partie n’a pas pu être enregistrée.');
      const states = tx.objectStore('state');
      const journal = tx.objectStore('journal');
      const previous = states.get('current');
      previous.onsuccess = () => {
        const revision = (previous.result?.revision ?? 0) + 1;
        const record = { id: 'current', formatVersion: FORMAT_VERSION, revision,
          savedAt: Date.now(), saved: payload };
        states.put(record);
        journal.put({ revision, formatVersion: FORMAT_VERSION, savedAt: record.savedAt,
          saved: payload, meta: detail });
        if (revision > JOURNAL_LIMIT) {
          journal.delete(globalThis.IDBKeyRange.upperBound(revision - JOURNAL_LIMIT));
        }
      };
      if (payload.phase === 'revealed-result' && validStatisticsGame(payload.game)) {
        // All tabs serialize on this same read/write store. Keep only a small
        // identity marker per announced match, outside resettable counters.
        // A stale result can therefore never reappear after a statistics reset.
        const markerId = `statistics-game:${payload.game.statsId}`;
        const marker = states.get(markerId);
        marker.onsuccess = () => {
          if (marker.result) return;
          const statistics = states.get('statistics');
          statistics.onsuccess = () => {
            try {
              const updated = recordStatistics(statistics.result?.value, payload.game);
              states.put({ id: 'statistics', value: updated });
              states.put({ id: markerId });
            } catch {
              // Invalid counters or a quota failure must abort the entire save;
              // never commit a result whose statistics have silently vanished.
              try { tx.abort(); } catch { /* It may already have been aborted by IndexedDB. */ }
            }
          };
        };
      }
      await done;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('La partie n’a pas pu être enregistrée.', error);
    }
  });
}

/** Clear the one local game and journal, preserving statistics and ID markers. */
export function clearGame() {
  return serialWrite(async () => {
    const database = await openDatabase();
    try {
      const tx = transaction(database, ['state', 'journal'], 'readwrite');
      const done = completed(tx, 'Impossible de supprimer la sauvegarde.');
      tx.objectStore('state').delete('current');
      tx.objectStore('journal').clear();
      await done;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('Impossible de supprimer la sauvegarde.', error);
    }
  });
}

/** Aggregates contain only names, controller kinds, levels and public counters. */
export async function loadStatistics() {
  await writeQueue;
  const database = await openDatabase();
  try {
    const tx = transaction(database, ['state'], 'readonly');
    const done = completed(tx, 'Impossible de lire les statistiques.');
    const request = tx.objectStore('state').get('statistics');
    let record;
    request.onsuccess = () => { record = request.result; };
    await done;
    return normalizeStatistics(record?.value);
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('Impossible de lire les statistiques.', error);
  }
}

/** Reset counters only. An open game and previously counted identities survive. */
export function resetStatistics() {
  return serialWrite(async () => {
    const database = await openDatabase();
    const statistics = emptyStatistics();
    try {
      const tx = transaction(database, ['state'], 'readwrite');
      const done = completed(tx, 'Impossible de remettre les statistiques à zéro.');
      tx.objectStore('state').put({ id: 'statistics', value: statistics });
      await done;
      return statistics;
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('Impossible de remettre les statistiques à zéro.', error);
    }
  });
}

/** Probe a real read/write transaction. No memory/localStorage substitute is used. */
export async function storageAvailable() {
  try {
    const database = await openDatabase();
    const tx = transaction(database, ['state'], 'readwrite');
    const done = completed(tx, 'Le stockage local est indisponible.');
    const probe = tx.objectStore('state');
    probe.put({ id: 'probe', value: 1 });
    probe.delete('probe');
    await done;
    return true;
  } catch { return false; }
}

/** Diagnostics only; the application never renders this private journal. */
export async function getHistory(limit = 20) {
  await writeQueue;
  const database = await openDatabase();
  const count = Math.max(0, Math.min(JOURNAL_LIMIT, Math.floor(Number(limit) || 0)));
  if (!count) return [];
  try {
    const tx = transaction(database, ['journal'], 'readonly');
    const done = completed(tx, 'Impossible de lire le journal local.');
    const records = [];
    const request = tx.objectStore('journal').openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      records.push(plainCopy(cursor.value));
      if (records.length < count) cursor.continue();
    };
    await done;
    return records;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError('Impossible de lire le journal local.', error);
  }
}
