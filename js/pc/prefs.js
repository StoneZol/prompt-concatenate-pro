import { getUiPrefs, updateUiPrefs } from "./api.js";

const LEGACY_KEY = "pc-ui-prefs";

const DEFAULTS = {
  otherCollections: false,
  showEmpty: false,
  searchInPrompts: false,
};

let cache = { ...DEFAULTS };
let loaded = false;
let loadPromise = null;

function readLegacyLocal() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const prefs = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (key in parsed) prefs[key] = Boolean(parsed[key]);
    }
    return prefs;
  } catch {
    return null;
  }
}

function clearLegacyLocal() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

function applyPrefs(prefs) {
  cache = { ...DEFAULTS, ...(prefs || {}) };
  for (const key of Object.keys(DEFAULTS)) {
    cache[key] = Boolean(cache[key]);
  }
  loaded = true;
  return cache;
}

/** Load prefs from SQLite (once). Migrates old localStorage values if present. */
export async function ensureUiPrefs() {
  if (loaded) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      const result = await getUiPrefs();
      if (!result.ok) {
        applyPrefs(DEFAULTS);
        return cache;
      }

      let prefs = { ...DEFAULTS, ...(result.prefs || {}) };
      const legacy = readLegacyLocal();
      if (legacy) {
        const merged = { ...prefs, ...legacy };
        const saved = await updateUiPrefs(merged);
        if (saved.ok) {
          prefs = saved.prefs || merged;
          clearLegacyLocal();
        } else {
          prefs = merged;
        }
      }
      return applyPrefs(prefs);
    })().catch(() => applyPrefs(DEFAULTS));
  }
  return loadPromise;
}

export function getUiPref(key) {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? cache[key] : undefined;
}

export function setUiPref(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
  cache[key] = Boolean(value);
  updateUiPrefs({ [key]: cache[key] }).then((result) => {
    if (result?.ok && result.prefs) applyPrefs(result.prefs);
  });
}
