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

export async function updateLayout({ id, name, description, folder, overwrite = false }) {
  const res = await fetch(LAYOUTS_URL, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, description, folder, overwrite }),
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
