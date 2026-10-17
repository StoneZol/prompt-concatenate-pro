const LAYOUTS_URL = "/prompt_craft/layouts";
const FOLDERS_URL = "/prompt_craft/layout_folders";

async function readJson(res) {
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok && !data.error && !data.conflicts) {
    data.error = `Request failed (HTTP ${res.status})`;
  }
  return data;
}

/** API shelves may be plain strings (legacy) or { name, count }. */
export function shelfNames(items) {
  return (items || [])
    .map((item) => (typeof item === "string" ? item : item?.name || ""))
    .filter(Boolean);
}

export async function saveLayout({ name, description, slots, folder = "", overwrite = false }) {
  const res = await fetch(LAYOUTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, slots, folder, overwrite }),
  });
  return readJson(res);
}

export async function listLayouts() {
  const res = await fetch(LAYOUTS_URL);
  return readJson(res);
}

export async function updateLayout({ id, name, description, folder, slots, overwrite = false }) {
  const body = { id, name, description, folder, overwrite };
  if (slots !== undefined) body.slots = slots;
  const res = await fetch(LAYOUTS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function deleteLayout(id) {
  const res = await fetch(`${LAYOUTS_URL}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return readJson(res);
}

export async function listLayoutFolders() {
  const res = await fetch(FOLDERS_URL);
  return readJson(res);
}

export async function renameLayoutFolder({ name, newName }) {
  const res = await fetch(FOLDERS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, new_name: newName }),
  });
  return readJson(res);
}

export async function deleteLayoutFolder(name) {
  const res = await fetch(`${FOLDERS_URL}?name=${encodeURIComponent(name)}`, { method: "DELETE" });
  return readJson(res);
}

const PRESETS_URL = "/prompt_craft/presets";

export async function savePreset({
  category,
  title,
  description = "",
  positive = "",
  negative = "",
  overwrite = false,
}) {
  const res = await fetch(PRESETS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, title, description, positive, negative, overwrite }),
  });
  return readJson(res);
}

export async function listPresets({ category = "" } = {}) {
  const url = category
    ? `${PRESETS_URL}?category=${encodeURIComponent(category)}`
    : PRESETS_URL;
  const res = await fetch(url);
  return readJson(res);
}

export async function updatePreset({
  id,
  title,
  description,
  category,
  positive,
  negative,
  overwrite = false,
}) {
  const res = await fetch(PRESETS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, title, description, category, positive, negative, overwrite }),
  });
  return readJson(res);
}

export async function deletePreset(id) {
  const res = await fetch(`${PRESETS_URL}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return readJson(res);
}

const CATEGORIES_URL = "/prompt_craft/categories";

export async function listCategories() {
  const res = await fetch(CATEGORIES_URL);
  return readJson(res);
}

export async function renameCategory({ name, newName }) {
  const res = await fetch(CATEGORIES_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, new_name: newName }),
  });
  return readJson(res);
}

export async function deleteCategory(name) {
  const res = await fetch(`${CATEGORIES_URL}?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return readJson(res);
}

const TEMPLATES_URL = "/prompt_craft/templates";
const TEMPLATE_FOLDERS_URL = "/prompt_craft/template_folders";

export async function saveTemplate({ name, description, slots, folder = "", overwrite = false }) {
  const res = await fetch(TEMPLATES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, slots, folder, overwrite }),
  });
  return readJson(res);
}

export async function listTemplates() {
  const res = await fetch(TEMPLATES_URL);
  return readJson(res);
}

export async function updateTemplate({ id, name, description, folder, slots, overwrite = false }) {
  const body = { id, name, description, folder, overwrite };
  if (slots !== undefined) body.slots = slots;
  const res = await fetch(TEMPLATES_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function deleteTemplate(id) {
  const res = await fetch(`${TEMPLATES_URL}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return readJson(res);
}

export async function listTemplateFolders() {
  const res = await fetch(TEMPLATE_FOLDERS_URL);
  return readJson(res);
}

export async function renameTemplateFolder({ name, newName }) {
  const res = await fetch(TEMPLATE_FOLDERS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, new_name: newName }),
  });
  return readJson(res);
}

export async function deleteTemplateFolder(name) {
  const res = await fetch(`${TEMPLATE_FOLDERS_URL}?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  return readJson(res);
}

const PREFS_URL = "/prompt_craft/prefs";

export async function getUiPrefs() {
  const res = await fetch(PREFS_URL);
  return readJson(res);
}

export async function updateUiPrefs(patch) {
  const res = await fetch(PREFS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch || {}),
  });
  return readJson(res);
}

const AUTOCOMPLETE_URL = "/prompt_craft/autocomplete";

export async function autocompleteLookup(side, prefix, limit = 20) {
  const qs = new URLSearchParams({
    side: side || "pos",
    prefix: prefix || "",
    limit: String(limit),
  });
  const res = await fetch(`${AUTOCOMPLETE_URL}?${qs}`);
  return readJson(res);
}

export async function autocompleteList(side, bucket = "", limit = 500) {
  const qs = new URLSearchParams({
    side: side || "pos",
    limit: String(limit),
  });
  if (bucket) qs.set("bucket", bucket);
  const res = await fetch(`${AUTOCOMPLETE_URL}/list?${qs}`);
  return readJson(res);
}

export async function autocompleteBuckets(side) {
  const qs = new URLSearchParams({ side: side || "pos" });
  const res = await fetch(`${AUTOCOMPLETE_URL}/buckets?${qs}`);
  return readJson(res);
}

export async function autocompleteAction(payload) {
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return readJson(res);
}

/**
 * Rebuild dictionaries with streamed progress (NDJSON).
 * onProgress({ current, total, percent, label, phase })
 */
export async function rebuildAutocomplete(onProgress) {
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rebuild" }),
  });

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!res.body || !ct.includes("ndjson")) {
    const data = await readJson(res);
    if (data.ok) {
      onProgress?.({
        phase: "done",
        current: data.presets || 0,
        total: data.presets || 0,
        percent: 100,
      });
    }
    return data;
  }

  if (!res.ok) {
    return { ok: false, error: `Request failed (HTTP ${res.status})` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last = { ok: true, presets: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (msg.ok === false) return msg;
      if (msg.phase === "start" || msg.phase === "progress") {
        onProgress?.(msg);
      }
      if (msg.phase === "done") {
        last = msg;
        onProgress?.(msg);
      }
    }
  }

  if (buffer.trim()) {
    try {
      const msg = JSON.parse(buffer.trim());
      if (msg.ok === false) return msg;
      if (msg.phase === "done") last = msg;
      onProgress?.(msg);
    } catch {
      /* ignore trailing junk */
    }
  }

  return last;
}
