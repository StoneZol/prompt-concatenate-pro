import { getUiPrefs, updateUiPrefs } from "./api.js";

const LEGACY_KEY = "pc-ui-prefs";

const MANAGER_TABS = new Set(["presets", "prompts", "templates", "suggest"]);

const DEFAULTS = {
  otherCollections: false,
  showEmpty: false,
  searchInPrompts: false,
  /** Write joined prompts into stock CLIP text + detach wires on queue (PNG meta). */
  embedClipMeta: false,
  /** Experimental: suggest segments from saved pairs / autocomplete dict. */
  promptAutocomplete: false,
  /** Last Library manager tab: presets | prompts | templates | suggest */
  managerTab: "presets",
};

let cache = { ...DEFAULTS };
let loaded = false;
let loadPromise = null;

function normalizeManagerTab(value) {
  let val = String(value || "").trim().toLowerCase();
  if (val === "stacks") val = "presets";
  return MANAGER_TABS.has(val) ? val : "presets";
}

function coercePref(key, value) {
  if (key === "managerTab") return normalizeManagerTab(value);
  return Boolean(value);
}

function readLegacyLocal() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const prefs = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (key in parsed) prefs[key] = coercePref(key, parsed[key]);
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
    cache[key] = coercePref(key, cache[key]);
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
  cache[key] = coercePref(key, value);
  updateUiPrefs({ [key]: cache[key] }).then((result) => {
    if (result?.ok && result.prefs) applyPrefs(result.prefs);
  });
}
