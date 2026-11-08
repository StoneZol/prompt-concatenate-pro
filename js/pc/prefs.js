import { getUiPrefs, updateUiPrefs } from "./api.js";

const LEGACY_KEY = "pc-ui-prefs";

const MANAGER_TABS = new Set(["presets", "prompts", "templates", "suggest"]);

/** Persisted in SQLite (survive Comfy / browser restart). */
const DEFAULTS = {
  otherCollections: false,
  showEmpty: false,
  searchInPrompts: false,
  /** Suggest segments from saved pairs / autocomplete dict. */
  promptAutocomplete: false,
  /** Last Library manager tab: presets | prompts | templates | suggest */
  managerTab: "presets",
  /** Skip Load-pair replace + Clear-pair confirms. */
  skipPairReplaceConfirm: false,
  /** Show Civitai button on pairs — import triggers from Toolkit local DB. */
  civitaiToolkitImport: false,
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
  cache = { ...DEFAULTS };
  const incoming = prefs || {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key in incoming) cache[key] = coercePref(key, incoming[key]);
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
        const patch = {};
        for (const key of Object.keys(DEFAULTS)) {
          if (key in merged) patch[key] = coercePref(key, merged[key]);
        }
        const saved = await updateUiPrefs(patch);
        if (saved.ok) {
          prefs = saved.prefs || patch;
          clearLegacyLocal();
        } else {
          prefs = patch;
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
