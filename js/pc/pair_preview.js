import { IMAGE_ICON_SVG } from "./icons.js";
import { clearPresetPreview, setPresetPreview } from "./api.js";

const MAX_EDGE = 512;
const JPEG_QUALITY = 0.85;

let coverTip = null;

export function presetPreviewUrl(presetOrId, bust = "") {
  const id =
    typeof presetOrId === "object" && presetOrId
      ? Number(presetOrId.id || 0)
      : Number(presetOrId || 0);
  if (!id) return "";
  const qs = bust ? `?v=${encodeURIComponent(bust)}` : "";
  return `/prompt_craft/preset_preview/${id}${qs}`;
}

export function hidePairPreviewTip() {
  if (!coverTip) return;
  coverTip.remove();
  coverTip = null;
}

export function showPairPreviewTip(anchorEl, coverUrl) {
  hidePairPreviewTip();
  if (!coverUrl || !anchorEl) return;

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
  btn.addEventListener("mouseenter", () => {
    const url = typeof getUrl === "function" ? getUrl() : getUrl;
    if (url) showPairPreviewTip(btn, url);
  });
  btn.addEventListener("mouseleave", hidePairPreviewTip);
  btn.addEventListener("click", (e) => e.stopPropagation());
}

/** Compact eye/image button; hidden when no url. */
export function makePairPreviewBtn(getUrl, { className = "pc-pair-preview-btn" } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = "Preview";
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
 * Holds pending blob until uploadAfterSave(presetId).
 */
export function mountPreviewEditor(host, { initialUrl = "", widthCap = true } = {}) {
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
      status.textContent = "Preview ready — saved with the pair";
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
        status.textContent = "Preview ready — saved with the pair";
      } catch (err) {
        status.textContent = err?.message || "Paste failed";
      }
      return;
    }
  });

  return {
    root,
    async uploadAfterSave(presetId) {
      const id = Number(presetId || 0);
      if (!id) return { ok: true };
      if (pendingBlob) {
        const dataUrl = await blobToDataUrl(pendingBlob);
        return setPresetPreview({ id, data: dataUrl, mime: "image/jpeg" });
      }
      if (clearExisting) {
        return clearPresetPreview(id);
      }
      return { ok: true };
    },
    hasPending() {
      return Boolean(pendingBlob) || clearExisting;
    },
  };
}
