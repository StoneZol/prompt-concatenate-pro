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

/**
 * Toolkit stores each parsed trigger group as one array entry
 * (often already comma-separated inside the string).
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
    const text = String(item ?? "")
      .replace(/[ \t\r\n]+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/(,\s*){2,}/g, ", ")
      .replace(/^[, ]+|[, ]+$/g, "")
      .trim();
    if (text) out.push(text);
  }
  return out;
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

export function searchCivitaiLoras(models, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const model of models || []) {
    const name = (model.civitai_model_name || "").toLowerCase();
    const file = normPath(model.filename);
    const base = basename(file).toLowerCase();
    const version = (model.version_name || "").toLowerCase();
    if (
      name.includes(q) ||
      file.includes(q) ||
      base.includes(q) ||
      version.includes(q)
    ) {
      hits.push(model);
    }
  }
  hits.sort((a, b) =>
    modelDisplayName(a).localeCompare(modelDisplayName(b), undefined, {
      sensitivity: "base",
    }),
  );
  return hits;
}
