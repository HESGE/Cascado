const STORAGE_KEY = 'ddc-human-roster';
const NAME_LIMIT = 20;
const ROSTER_LIMIT = 100;

/** Stored names are plain text; callers escape them when inserting HTML. */
export function normalizeHumanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  // Count Unicode characters instead of splitting a surrogate pair at the limit.
  return [...name].slice(0, NAME_LIMIT).join('').trimEnd();
}

function nameKey(name) {
  return name.toLowerCase().normalize('NFC');
}

function uniqueNames(values) {
  const seen = new Set();
  const names = [];
  for (const value of values) {
    const name = normalizeHumanName(value);
    if (!name || seen.has(nameKey(name))) continue;
    seen.add(nameKey(name));
    names.push(name);
    if (names.length === ROSTER_LIMIT) break;
  }
  return names;
}

function normalizeRoster(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const lastNames = [0, 1].map(index =>
    normalizeHumanName(Array.isArray(source.lastNames) ? source.lastNames[index] : null) || null);
  let names = uniqueNames(Array.isArray(source.names) ? source.names : []);

  // Keep a seat's remembered human selectable, including after repairing a
  // partial payload or trimming a full list of older names.
  const missing = uniqueNames(lastNames).filter(name =>
    !names.some(known => nameKey(known) === nameKey(name)));
  names = [...names, ...missing];
  const rememberedKeys = new Set(lastNames.filter(Boolean).map(nameKey));
  for (let index = names.length - 1; names.length > ROSTER_LIMIT; index--) {
    if (!rememberedKeys.has(nameKey(names[index]))) names.splice(index, 1);
  }
  return {
    names,
    lastNames: lastNames.map(name => name === null ? null :
      names.find(known => nameKey(known) === nameKey(name)) ?? name),
  };
}

function browserStorage(storage) {
  // Accessing localStorage itself can throw when browser storage is disabled.
  try { return storage === undefined ? globalThis.localStorage : storage; }
  catch { return null; }
}

/** Names belong to this browser only; unavailable storage starts an empty list. */
export function loadHumanRoster(storage) {
  try {
    const raw = browserStorage(storage)?.getItem(STORAGE_KEY);
    return normalizeRoster(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeRoster(null);
  }
}

/** Merge known humans without saving or changing the two remembered seats. */
export function mergeHumanNames(roster, names) {
  const previous = normalizeRoster(roster);
  return normalizeRoster({
    names: uniqueNames([...(Array.isArray(names) ? names : []), ...previous.names]),
    lastNames: previous.lastNames,
  });
}

/** Remember a created game's humans; two null seats persist a recovered roster. */
export function rememberHumanNames(roster, humanNames, storage) {
  const previous = normalizeRoster(roster);
  const selected = [0, 1].map(index =>
    normalizeHumanName(Array.isArray(humanNames) ? humanNames[index] : null) || null);
  const updated = normalizeRoster({
    names: uniqueNames([...selected, ...previous.names]),
    lastNames: selected.map((name, index) => name ?? previous.lastNames[index]),
  });
  try { browserStorage(storage)?.setItem(STORAGE_KEY, JSON.stringify(updated)); }
  catch { /* The returned roster remains usable for this open application. */ }
  return updated;
}
