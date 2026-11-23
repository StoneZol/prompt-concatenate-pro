import { IMAGE_ICON_SVG } from "./icons.js";
import {
  clearPresetPreview,
  clearTemplatePreview,
  setPresetPreview,
  setTemplatePreview,
} from "./api.js";
import { injectPopupStyles } from "./popup.js";
import { normalizeShelfPath, SHELF_SEP } from "./shelf_paths.js";

const MAX_EDGE = 512;
const JPEG_QUALITY = 0.85;

let coverTip = null;

/** Library key written into blocks_data / URL: `одежда/office suit/v1`. */
export function pairPreviewKey(category, title) {
  const shelf = normalizeShelfPath(category);
  const name = String(title || "").trim();
  if (!name) return "";
  return shelf ? `${shelf}${SHELF_SEP}${name}` : name;
}

function withBust(url, bust = "") {
  if (!url) return "";
  const qs = bust ? `?v=${encodeURIComponent(bust)}` : "";
  return `${url}${qs}`;
}

/** Prefer shelf/title path (stable after F5); fall back to numeric id. */
export function presetPreviewUrl(presetOrId, bust = "") {
  if (presetOrId && typeof presetOrId === "object") {
    const key = pairPreviewKey(presetOrId.category, presetOrId.title);
    if (key) {
      return withBust(
        `/prompt_craft/preset_preview/by/${key.split(SHELF_SEP).map(encodeURIComponent).join("/")}`,
        bust,
      );
    }
    const id = Number(presetOrId.id || 0);
    return id ? withBust(`/prompt_craft/preset_preview/${id}`, bust) : "";
  }
  const id = Number(presetOrId || 0);
  return id ? withBust(`/prompt_craft/preset_preview/${id}`, bust) : "";
}

/** Prefer folder/name path; fall back to numeric id. */
export function templatePreviewUrl(templateOrId, bust = "") {
  if (templateOrId && typeof templateOrId === "object") {
    const key = pairPreviewKey(templateOrId.folder, templateOrId.name || templateOrId.title);
    if (key) {
      return withBust(
        `/prompt_craft/template_preview/by/${key.split(SHELF_SEP).map(encodeURIComponent).join("/")}`,
        bust,
      );
    }
    const id = Number(templateOrId.id || 0);
    return id ? withBust(`/prompt_craft/template_preview/${id}`, bust) : "";
  }
  const id = Number(templateOrId || 0);
  return id ? withBust(`/prompt_craft/template_preview/${id}`, bust) : "";
}

/**
 * Write the ready preview URL into blocks_data once (LoRA coverPath style).
 * Hover only reads group.loadedPreviewPath — never rebuilds.
 */
export function writeLoadedPreviewMeta(
  group,
  { id = 0, hasPreview = false, bust = "", category = "", title = "" } = {},
) {
  if (!group || typeof group !== "object") return;
  const presetId = Number(id || 0);
  const shelf = normalizeShelfPath(category || group.loadedCategory);
  const name = String(title || group.loadedTitle || "").trim();
  const key = pairPreviewKey(shelf, name);
  const on = Boolean(hasPreview) && Boolean(key || presetId);
  const rev = String(bust || Date.now());
  group.loadedPresetId = on ? presetId : 0;
  group.loadedHasPreview = on;
  group.loadedPreviewRev = on ? rev : "";
  group.loadedPreviewKey = on && key ? key : "";
  // Full ready URL — persisted in blocks_data next to loadedTitle.
  group.loadedPreviewPath = on
    ? presetPreviewUrl(key ? { category: shelf, title: name, id: presetId } : presetId, rev)
    : "";
}

export function clearLoadedPreviewMeta(group) {
  writeLoadedPreviewMeta(group, { id: 0, hasPreview: false });
}

/** Ready path from blocks_data only (no rebuild on hover). */
export function loadedPreviewSrc(group) {
  if (!group?.loadedHasPreview) return "";
  return String(group.loadedPreviewPath || "").trim();
}

export function hidePairPreviewTip() {
  if (!coverTip) return;
  coverTip.remove();
  coverTip = null;
}

/** Same pattern as Ultimate LoRA Loader: plain img.src from a known path. */
export function showPairPreviewTip(anchorEl, coverUrl) {
  hidePairPreviewTip();
  if (!coverUrl || !anchorEl) return;
  // Styles for .pc-pair-preview-tip are in popup CSS (position/z-index).
  injectPopupStyles();

  const tip = document.createElement("div");
  tip.className = "pc-pair-preview-tip";
  tip.addEventListener("pointerdown", (e) => e.stopPropagation());
  const img = document.createElement("img");
  img.src = coverUrl;
  img.alt = "preview";
  tip.appendChild(img);
  document.body.appendChild(tip);
  coverTip = tip;

  const rect = anchorEl.getBoundingClientRect();
  const tipW = 228;
  const tipH = 290;
  let left = rect.right + 8;
  let top = rect.top;
  if (left + tipW > window.innerWidth - 8) left = rect.left - tipW - 8;
  if (top + tipH > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - tipH - 8);
  }
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

export function bindPairPreviewHover(btn, getUrl) {
  if (!btn) return;
  // Property handlers like LoRA loader — more reliable inside Comfy DOM widgets.
  btn.onmouseenter = () => {
    const url = typeof getUrl === "function" ? getUrl() : getUrl;
    if (url) showPairPreviewTip(btn, url);
  };
  btn.onmouseleave = () => hidePairPreviewTip();
  btn.onmousedown = (e) => e.stopPropagation();
  btn.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const url = typeof getUrl === "function" ? getUrl() : getUrl;
    if (url) showPairPreviewTip(btn, url);
  };
}

/** Compact eye control (div, no native title — it covers the tip). */
export function makePairPreviewBtn(getUrl, { className = "pc-pair-preview-btn" } = {}) {
  const btn = document.createElement("div");
  btn.className = className;
  btn.innerHTML = IMAGE_ICON_SVG;
  bindPairPreviewHover(btn, getUrl);
  return btn;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

/** Resize pasted/file image → JPEG blob (max edge 512). */
export async function compressPreviewBlob(blob) {
  const source = blob || null;
  if (!source || !String(source.type || "").startsWith("image/")) {
    throw new Error("Clipboard has no image");
  }
  const objectUrl = URL.createObjectURL(source);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || 1) * scale));
    const height = Math.max(1, Math.round((img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, width, height);
    const out = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (!out) throw new Error("Failed to encode preview");
    return out;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function readClipboardImageBlob() {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard image paste is not supported here");
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = (item.types || []).find((t) => t.startsWith("image/"));
    if (!type) continue;
    return item.getType(type);
  }
  throw new Error("No image in clipboard");
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Save/Edit UI: small thumb + Paste / Clear.
 * Holds pending blob until uploadAfterSave(id).
 * `kind: "template"` uploads to template_preview routes.
 */
export function mountPreviewEditor(
  host,
  {
    initialUrl = "",
    widthCap = true,
    kind = "pair",
    statusReady = "",
  } = {},
) {
  const isTemplate = kind === "template";
  const setPreview = isTemplate ? setTemplatePreview : setPresetPreview;
  const clearPreview = isTemplate ? clearTemplatePreview : clearPresetPreview;
  const readyText =
    statusReady ||
    (isTemplate ? "Preview ready — saved with the template" : "Preview ready — saved with the pair");

  const root = document.createElement("div");
  root.className = "pc-pair-preview-edit" + (widthCap ? " capped" : "");

  const thumb = document.createElement("div");
  thumb.className = "pc-pair-preview-thumb is-empty";

  const emptyLabel = document.createElement("span");
  emptyLabel.textContent = "No preview";

  const img = document.createElement("img");
  img.alt = "preview";
  img.hidden = true;
  thumb.append(emptyLabel, img);

  const actions = document.createElement("div");
  actions.className = "pc-pair-preview-edit-actions";

  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button";
  pasteBtn.className = "pc-popup-btn";
  pasteBtn.textContent = "Paste preview";
  pasteBtn.title = "Paste image from clipboard";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "pc-popup-btn";
  clearBtn.textContent = "Clear";
  clearBtn.hidden = true;

  const status = document.createElement("div");
  status.className = "pc-pair-preview-edit-status";

  actions.append(pasteBtn, clearBtn);
  root.append(thumb, actions, status);
  host.appendChild(root);

  let pendingBlob = null;
  let clearExisting = false;
  let objectUrl = "";

  function paint(url) {
    const next = String(url || "").trim();
    // Don't revoke the URL we're about to show (ingestBlob used to set objectUrl then paint it).
    if (objectUrl && objectUrl !== next) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }
    if (next) {
      if (next.startsWith("blob:")) objectUrl = next;
      img.onload = () => {
        img.hidden = false;
        emptyLabel.hidden = true;
        thumb.classList.remove("is-empty");
        clearBtn.hidden = false;
      };
      img.onerror = () => {
        if (objectUrl === next) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = "";
        }
        img.removeAttribute("src");
        img.hidden = true;
        emptyLabel.hidden = false;
        thumb.classList.add("is-empty");
        clearBtn.hidden = true;
      };
      // Reset first so repeated pastes of the same blob URL still fire onload.
      img.removeAttribute("src");
      img.hidden = true;
      img.src = next;
    } else {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("src");
      img.hidden = true;
      emptyLabel.hidden = false;
      thumb.classList.add("is-empty");
      clearBtn.hidden = true;
    }
  }

  if (initialUrl) paint(initialUrl);
  else paint("");

  async function ingestBlob(blob) {
    status.textContent = "";
    const compressed = await compressPreviewBlob(blob);
    pendingBlob = compressed;
    clearExisting = false;
    paint(URL.createObjectURL(compressed));
  }

  pasteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    pasteBtn.disabled = true;
    status.textContent = "Reading clipboard…";
    try {
      const blob = await readClipboardImageBlob();
      await ingestBlob(blob);
      status.textContent = readyText;
    } catch (err) {
      status.textContent = err?.message || "Paste failed";
    } finally {
      pasteBtn.disabled = false;
    }
  });

  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pendingBlob = null;
    clearExisting = Boolean(initialUrl);
    paint("");
    status.textContent = clearExisting ? "Preview will be removed on save" : "";
  });

  root.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type?.startsWith("image/")) continue;
      e.preventDefault();
      e.stopPropagation();
      try {
        await ingestBlob(item.getAsFile());
        status.textContent = readyText;
      } catch (err) {
        status.textContent = err?.message || "Paste failed";
      }
      return;
    }
  });

  return {
    root,
    async uploadAfterSave(entityId) {
      const id = Number(entityId || 0);
      if (!id) return { ok: true };
      if (pendingBlob) {
        const dataUrl = await blobToDataUrl(pendingBlob);
        return setPreview({ id, data: dataUrl, mime: "image/jpeg" });
      }
      if (clearExisting) {
        return clearPreview(id);
      }
      return { ok: true };
    },
    hasPending() {
      return Boolean(pendingBlob) || clearExisting;
    },
  };
}
