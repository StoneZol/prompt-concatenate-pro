/** Soft dependency on ComfyUI-Civitai-Toolkit (`/civitai_utils/*`). */

let cache = null;
let cacheTime = 0;
const CACHE_MS = 60_000;

function normPath(p) {
  return String(p || "").replace(/\\/g, "/").toLowerCase();
}

function basename(path) {
  const n = String(path || "").replace(/\\/g, "/");
  const parts = n.split("/").filter(Boolean);
  return parts[parts.length - 1] || n;
}

const MAX_TRIGGER_GROUPS = 48;
const MAX_TRIGGER_CHARS = 1200;
const MAX_TAGS = 48;
const MAX_TAG_CHARS = 48;

/**
 * Toolkit stores each parsed trigger group as one array entry
 * (often already comma-separated inside the string).
 * Caps length/count so malformed LoRAs cannot blow up the UI.
 */
export function parseTriggerGroups(trainedWords) {
  let items = trainedWords;
  if (items == null || items === "") return [];
  if (typeof items === "string") {
    const raw = items.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
      else items = [raw];
    } catch {
      items = [raw];
    }
  }
  if (!Array.isArray(items)) return [];

  const out = [];
  for (const item of items) {
    let text = String(item ?? "")
      .replace(/[ \t\r\n]+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/(,\s*){2,}/g, ", ")
      .replace(/^[, ]+|[, ]+$/g, "")
      .trim();
    if (!text) continue;
    if (text.length > MAX_TRIGGER_CHARS) {
      text = `${text.slice(0, MAX_TRIGGER_CHARS - 1)}…`;
    }
    out.push(text);
    if (out.length >= MAX_TRIGGER_GROUPS) break;
  }
  return out;
}

/** Normalized Civitai tags from Toolkit model payload. */
export function modelTags(model) {
  const raw = model?.tags;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    let text = String(item ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length > MAX_TAG_CHARS) text = `${text.slice(0, MAX_TAG_CHARS - 1)}…`;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * Folder tree from Toolkit `filename` paths (same mental model as the LoRA loader).
 * Node shape: { __files__: string[], __models__: { [file]: model }, [folder]: node }
 */
export function buildLoraFolderTree(models) {
  const root = { __files__: [], __models__: {} };
  for (const model of models || []) {
    const file = String(model?.filename || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!file) continue;
    const parts = file.split("/").filter(Boolean);
    if (!parts.length) continue;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node[seg] || typeof node[seg] !== "object") {
        node[seg] = { __files__: [], __models__: {} };
      }
      node = node[seg];
    }
    const base = parts[parts.length - 1];
    if (!node.__files__.includes(base)) node.__files__.push(base);
    node.__models__[base] = model;
  }
  return root;
}

/** Walk a tree node → [{ model, folderPrefix }]. */
export function flattenLoraTree(node, folderPrefix = []) {
  const out = [];
  if (!node || typeof node !== "object") return out;
  for (const file of node.__files__ || []) {
    const model = node.__models__?.[file];
    if (model) out.push({ model, folderPrefix: folderPrefix.slice() });
  }
  for (const key of Object.keys(node)) {
    if (key === "__files__" || key === "__models__") continue;
    out.push(...flattenLoraTree(node[key], [...folderPrefix, key]));
  }
  return out;
}

export function getTreeNodeAtPath(tree, pathSegs) {
  let node = tree;
  for (const seg of pathSegs || []) {
    node = node?.[seg];
    if (!node || typeof node !== "object") return null;
  }
  return node;
}

export function modelDisplayName(model) {
  const civitai = (model?.civitai_model_name || "").trim();
  if (civitai) return civitai;
  return basename(model?.filename || "") || "Untitled LoRA";
}

export function modelFileLabel(model) {
  return (model?.filename || "").trim() || "";
}

export function modelCoverUrl(model) {
  const url = (model?.local_cover_path || "").trim();
  return url || null;
}

function htmlToPlainText(html) {
  const raw = String(html || "").trim();
  if (!raw) return "";
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    return (doc.body?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Toolkit description text (version + model). */
export function modelDescriptionText(model) {
  const version = htmlToPlainText(model?.version_description);
  let body = htmlToPlainText(model?.model_description);
  if (/^no description found\.?$/i.test(body)) body = "";
  const parts = [];
  if (version) parts.push(version);
  if (body) parts.push(body);
  return parts.join("\n\n").trim();
}

/**
 * Build a Civitai page URL if Toolkit already exposed IDs on the model object.
 */
export function modelCivitaiUrlFromFields(model) {
  const modelId =
    model?.model_id || model?.modelId || model?.civitai_model_id || null;
  if (!modelId) return null;
  const versionId =
    model?.version_id || model?.modelVersionId || model?.civitai_version_id || null;
  let url = `https://civitai.com/models/${modelId}`;
  if (versionId) url += `?modelVersionId=${versionId}`;
  return url;
}

/**
 * On-demand Civitai page URL for one LoRA hash (Toolkit SQLite lookup).
 * Does not scan the library or call Civitai — one local DB read.
 */
export async function fetchCivitaiPageUrl(hash) {
  const h = String(hash || "").trim();
  if (!h) return { ok: false, url: "", error: "Missing hash" };
  try {
    const qs = new URLSearchParams({ hash: h });
    const res = await fetch(`/prompt_craft/civitai_url?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.url) {
      return {
        ok: false,
        url: "",
        error: data?.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, url: String(data.url), modelId: data.model_id, versionId: data.version_id };
  } catch (err) {
    return { ok: false, url: "", error: err?.message || "Request failed" };
  }
}

/**
 * On-demand sidecar note for one LoRA (`Name.txt` / `.md` / `.caption`).
 * Does not scan the whole library — one file lookup on the server.
 */
export async function fetchLoraSidecarNotes(filename) {
  const file = String(filename || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!file) return { ok: false, notes: "", source: null, error: "Missing file" };
  try {
    const qs = new URLSearchParams({ file });
    const res = await fetch(`/prompt_craft/lora_note?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        notes: "",
        source: null,
        error: data?.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      notes: String(data.notes || "").trim(),
      source: data.source || null,
    };
  } catch (err) {
    return { ok: false, notes: "", source: null, error: err?.message || "Request failed" };
  }
}

export async function fetchCivitaiLoras(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheTime < CACHE_MS) return { ok: true, models: cache };

  let res;
  try {
    res = await fetch("/civitai_utils/get_local_models");
  } catch (err) {
    return {
      ok: false,
      error:
        err?.message ||
        "Civitai Toolkit unreachable. Is ComfyUI-Civitai-Toolkit installed?",
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Civitai Toolkit API HTTP ${res.status}. Is the Toolkit installed and loaded?`,
    };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Civitai Toolkit returned invalid JSON" };
  }

  if (data.status !== "ok" || !Array.isArray(data.models)) {
    return {
      ok: false,
      error: data.message || "Civitai Toolkit returned no models",
    };
  }

  const loras = data.models.filter(
    (m) => String(m.model_type || "").toLowerCase() === "loras",
  );
  cache = loras.length ? loras : data.models;
  cacheTime = now;
  return { ok: true, models: cache };
}

export function modelMatchesQuery(model, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const name = (model?.civitai_model_name || "").toLowerCase();
  const file = normPath(model?.filename);
  const base = basename(file).toLowerCase();
  const version = (model?.version_name || "").toLowerCase();
  const bm = (model?.base_model || "").toLowerCase();
  if (
    name.includes(q) ||
    file.includes(q) ||
    base.includes(q) ||
    version.includes(q) ||
    bm.includes(q)
  ) {
    return true;
  }
  for (const tag of modelTags(model)) {
    if (tag.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function searchCivitaiLoras(models, query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const hits = (models || []).filter((model) => modelMatchesQuery(model, q));
  hits.sort((a, b) =>
    modelDisplayName(a).localeCompare(modelDisplayName(b), undefined, {
      sensitivity: "base",
    }),
  );
  return hits;
}
