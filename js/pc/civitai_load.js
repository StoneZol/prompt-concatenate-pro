import { CHEVRON_ICON_SVG, CLOSE_ICON_SVG, COPY_ICON_SVG, IMAGE_ICON_SVG, TEXT_ICON_SVG } from "./icons.js";
import { injectPopupStyles } from "./popup.js";
import {
  fetchCivitaiLoras,
  fetchCivitaiPageUrl,
  fetchLoraSidecarNotes,
  modelCivitaiUrlFromFields,
  modelCoverUrl,
  modelDescriptionText,
  modelDisplayName,
  modelFileLabel,
  parseTriggerGroups,
  searchCivitaiLoras,
} from "./civitai_toolkit.js";
import { joinFields } from "./join.js";

const PREVIEW_CHARS = 96;
const GROUPS_PREVIEW = 2;

let coverTip = null;
let activeOverlay = null;

function hideCoverTip() {
  if (!coverTip) return;
  coverTip.remove();
  coverTip = null;
}

function showCoverTip(anchorEl, coverUrl) {
  hideCoverTip();
  if (!coverUrl || !anchorEl) return;

  const tip = document.createElement("div");
  tip.className = "pc-civitai-cover-tip";
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

function truncatePreview(text) {
  const s = String(text || "");
  if (s.length <= PREVIEW_CHARS) return { preview: s, clipped: false };
  return { preview: `${s.slice(0, PREVIEW_CHARS - 1)}…`, clipped: true };
}

function selectionKey(modelIndex, groupIndex) {
  return `${modelIndex}:${groupIndex}`;
}

function copyText(text, btn) {
  const value = String(text || "");
  if (!value || !btn) return;
  const label = btn.querySelector("span") || btn;
  navigator.clipboard.writeText(value).then(() => {
    const prev = label.textContent;
    label.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => {
      label.textContent = prev;
      btn.classList.remove("copied");
    }, 1200);
  }).catch(() => {});
}

function openModelInfoOverlay(model) {
  document.querySelector(".pc-civitai-info-overlay")?.remove();

  const title = modelDisplayName(model);
  const file = modelFileLabel(model);
  const cover = modelCoverUrl(model);
  const description = modelDescriptionText(model);
  const base = (model.base_model || "").trim();

  const overlay = document.createElement("div");
  overlay.className = "pc-civitai-info-overlay";
  overlay.addEventListener("pointerdown", (e) => e.stopPropagation());
  overlay.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  const panel = document.createElement("div");
  panel.className = "pc-civitai-info-panel";

  const head = document.createElement("div");
  head.className = "pc-civitai-modal-head";

  const heading = document.createElement("div");
  heading.className = "pc-civitai-modal-title";
  heading.textContent = "LoRA info";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "pc-civitai-modal-close";
  closeBtn.title = "Close";
  closeBtn.innerHTML = CLOSE_ICON_SVG;
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    overlay.remove();
  });

  head.append(heading, closeBtn);

  const body = document.createElement("div");
  body.className = "pc-civitai-info-body";

  const hero = document.createElement("div");
  hero.className = "pc-civitai-info-hero";

  const imgWrap = document.createElement("div");
  imgWrap.className = "pc-civitai-info-cover";
  if (cover) {
    const img = document.createElement("img");
    img.src = cover;
    img.alt = title;
    imgWrap.appendChild(img);
  } else {
    imgWrap.classList.add("is-empty");
    imgWrap.textContent = "No cover";
  }

  const meta = document.createElement("div");
  meta.className = "pc-civitai-info-meta";

  const titleEl = document.createElement("div");
  titleEl.className = "pc-civitai-info-name";
  titleEl.textContent = title || "Untitled LoRA";
  titleEl.title = title || "";
  meta.appendChild(titleEl);

  const linkLine = document.createElement("div");
  linkLine.className = "pc-civitai-info-line";
  linkLine.textContent = "Civitai · …";
  meta.appendChild(linkLine);

  const notesMeta = document.createElement("div");
  notesMeta.className = "pc-civitai-info-line";
  notesMeta.textContent = "Notes · Loading…";
  meta.appendChild(notesMeta);

  if (base && base !== "N/A") {
    const typeEl = document.createElement("div");
    typeEl.className = "pc-civitai-info-line";
    typeEl.textContent = `Model · ${base}`;
    meta.appendChild(typeEl);
  }

  if (file) {
    const fileEl = document.createElement("div");
    fileEl.className = "pc-civitai-info-line pc-civitai-info-path";
    fileEl.textContent = file;
    fileEl.title = file;
    meta.appendChild(fileEl);
  }

  function setCivitaiLink(url) {
    if (!linkLine.isConnected || !url) {
      if (linkLine.isConnected) linkLine.textContent = "Civitai · none";
      return;
    }
    linkLine.textContent = "";
    const a = document.createElement("a");
    a.className = "pc-civitai-info-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open on Civitai ↗";
    a.title = url;
    a.addEventListener("click", (e) => e.stopPropagation());
    linkLine.appendChild(a);
  }

  const directUrl = modelCivitaiUrlFromFields(model);
  if (directUrl) {
    setCivitaiLink(directUrl);
  } else if (model?.hash) {
    fetchCivitaiPageUrl(model.hash).then((result) => {
      if (!linkLine.isConnected) return;
      if (result.ok && result.url) setCivitaiLink(result.url);
      else linkLine.textContent = "Civitai · none";
    });
  } else {
    linkLine.textContent = "Civitai · none";
  }

  hero.append(imgWrap, meta);
  body.appendChild(hero);

  function makeSection(labelText) {
    const section = document.createElement("div");
    section.className = "pc-civitai-info-section";
    const row = document.createElement("div");
    row.className = "pc-civitai-info-section-head";
    const label = document.createElement("div");
    label.className = "pc-civitai-info-label";
    label.textContent = labelText;
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "pc-civitai-copy-btn";
    copyBtn.innerHTML = `${COPY_ICON_SVG}<span>Copy</span>`;
    copyBtn.disabled = true;
    row.append(label, copyBtn);
    const text = document.createElement("div");
    text.className = "pc-civitai-info-text";
    section.append(row, text);
    return { section, text, copyBtn };
  }

  const notes = makeSection("Notes");
  notes.text.textContent = "Loading…";
  body.appendChild(notes.section);

  const desc = makeSection("Description");
  desc.section.classList.add("pc-civitai-info-desc");
  if (description) {
    desc.text.textContent = description;
    desc.copyBtn.disabled = false;
    desc.copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyText(description, desc.copyBtn);
    });
  } else {
    desc.text.textContent = "No description.";
    desc.section.classList.add("is-empty");
  }
  body.appendChild(desc.section);

  panel.append(head, body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  fetchLoraSidecarNotes(file).then((result) => {
    if (!notes.section.isConnected) return;
    if (result.ok && result.notes) {
      notes.text.textContent = result.notes;
      notes.copyBtn.disabled = false;
      const source = result.source || "sidecar";
      notes.section.querySelector(".pc-civitai-info-label").textContent = `Notes · ${source}`;
      notesMeta.textContent = `Notes · ${source}`;
      notes.copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyText(result.notes, notes.copyBtn);
      });
    } else {
      notes.text.textContent = "No sidecar note (.txt / .md).";
      notes.section.classList.add("is-empty");
      notesMeta.textContent = "Notes · none";
    }
  });
}

/**
 * Search Civitai Toolkit local DB for LoRA trigger groups → Append / Replace positive.
 * Custom overlay — closes only via X (not outside click).
 */
export async function openCivitaiLoadPopup({ onApply } = {}) {
  injectPopupStyles();
  hideCoverTip();
  activeOverlay?.remove();
  activeOverlay = null;

  const loaded = await fetchCivitaiLoras();

  const overlay = document.createElement("div");
  overlay.className = "pc-civitai-overlay";
  overlay.addEventListener("pointerdown", (e) => e.stopPropagation());
  overlay.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

  const modal = document.createElement("div");
  modal.className = "pc-civitai-modal";

  const head = document.createElement("div");
  head.className = "pc-civitai-modal-head";

  const title = document.createElement("div");
  title.className = "pc-civitai-modal-title";
  title.textContent = "Civitai · triggers";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "pc-civitai-modal-close";
  closeBtn.title = "Close";
  closeBtn.innerHTML = CLOSE_ICON_SVG;

  head.append(title, closeBtn);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "pc-popup-input pc-civitai-search";
  search.placeholder = "Search filename or title…";
  search.autocomplete = "off";

  const status = document.createElement("div");
  status.className = "pc-popup-message pc-civitai-status";

  const scroll = document.createElement("div");
  scroll.className = "pc-civitai-list";

  const footer = document.createElement("div");
  footer.className = "pc-civitai-modal-footer";

  const appendBtn = document.createElement("button");
  appendBtn.type = "button";
  appendBtn.className = "pc-popup-btn";
  appendBtn.textContent = "Append";

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "pc-popup-btn primary";
  replaceBtn.textContent = "Replace";

  footer.append(appendBtn, replaceBtn);
  modal.append(head, search, status, scroll, footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  /** @type {Set<string>} */
  const selected = new Set();
  /** @type {Map<string, string>} */
  const selectedText = new Map();

  function close() {
    hideCoverTip();
    document.querySelector(".pc-civitai-info-overlay")?.remove();
    overlay.remove();
    if (activeOverlay === overlay) activeOverlay = null;
  }

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });

  function paintActions() {
    const on = selected.size > 0;
    appendBtn.disabled = !on;
    replaceBtn.disabled = !on;
  }

  function collectedText() {
    const parts = [];
    for (const key of selected) {
      const text = selectedText.get(key);
      if (text) parts.push(text);
    }
    return joinFields(parts);
  }

  function apply(mode) {
    const text = collectedText();
    if (!text) return;
    onApply?.(text, mode);
    close();
  }

  appendBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    apply("append");
  });
  replaceBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    apply("replace");
  });
  paintActions();

  function makeGroupRow(modelIndex, groupIndex, text) {
    const key = selectionKey(modelIndex, groupIndex);
    const { preview, clipped } = truncatePreview(text);

    const row = document.createElement("div");
    row.className = "pc-civitai-group";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.setAttribute("aria-pressed", "false");

    const textEl = document.createElement("div");
    textEl.className = "pc-civitai-group-text";
    textEl.textContent = preview;

    let expanded = false;
    let expandBtn = null;
    if (clipped) {
      expandBtn = document.createElement("button");
      expandBtn.type = "button";
      expandBtn.className = "pc-civitai-expand";
      expandBtn.title = "Show full";
      expandBtn.innerHTML = CHEVRON_ICON_SVG;
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        expanded = !expanded;
        textEl.textContent = expanded ? text : preview;
        expandBtn.classList.toggle("open", expanded);
        expandBtn.title = expanded ? "Collapse" : "Show full";
      });
    }

    function paintSelected() {
      const on = selected.has(key);
      row.classList.toggle("selected", on);
      row.setAttribute("aria-pressed", on ? "true" : "false");
    }

    function toggleSelected() {
      if (selected.has(key)) {
        selected.delete(key);
        selectedText.delete(key);
      } else {
        selected.add(key);
        selectedText.set(key, text);
      }
      paintSelected();
      paintActions();
    }

    row.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelected();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      toggleSelected();
    });

    paintSelected();
    row.appendChild(textEl);
    if (expandBtn) row.appendChild(expandBtn);
    return row;
  }

  function makeModelCard(model, modelIndex) {
    const card = document.createElement("div");
    card.className = "pc-civitai-card";

    const headRow = document.createElement("div");
    headRow.className = "pc-civitai-head";

    const coverUrl = modelCoverUrl(model);
    const previewBtn = document.createElement("button");
    previewBtn.type = "button";
    previewBtn.className =
      "pc-civitai-preview-btn" + (coverUrl ? " has-preview" : "");
    previewBtn.innerHTML = IMAGE_ICON_SVG;
    previewBtn.title = coverUrl ? "Preview" : "No cover";
    previewBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    previewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    if (coverUrl) {
      previewBtn.addEventListener("mouseenter", () => showCoverTip(previewBtn, coverUrl));
      previewBtn.addEventListener("mouseleave", () => hideCoverTip());
    }

    const titles = document.createElement("div");
    titles.className = "pc-civitai-titles";

    const nameEl = document.createElement("div");
    nameEl.className = "pc-civitai-title";
    nameEl.textContent = modelDisplayName(model);
    nameEl.title = modelDisplayName(model);

    const file = modelFileLabel(model);
    if (file) {
      const sub = document.createElement("div");
      sub.className = "pc-civitai-file";
      sub.textContent = file;
      sub.title = file;
      titles.append(nameEl, sub);
    } else {
      titles.appendChild(nameEl);
    }

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "pc-civitai-info-btn";
    infoBtn.title = "Description & notes";
    infoBtn.innerHTML = TEXT_ICON_SVG;
    infoBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
    infoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      hideCoverTip();
      openModelInfoOverlay(model);
    });

    headRow.append(previewBtn, titles, infoBtn);

    const groups = parseTriggerGroups(model.trained_words);
    const groupsWrap = document.createElement("div");
    groupsWrap.className = "pc-civitai-groups";

    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "pc-civitai-empty-groups";
      empty.textContent = "No trigger groups";
      groupsWrap.appendChild(empty);
    } else {
      const rows = groups.map((text, groupIndex) =>
        makeGroupRow(modelIndex, groupIndex, text),
      );
      const extra = rows.length > GROUPS_PREVIEW;
      let expanded = false;

      function paintGroups() {
        groupsWrap.replaceChildren();
        const visible = expanded ? rows : rows.slice(0, GROUPS_PREVIEW);
        for (const row of visible) groupsWrap.appendChild(row);
        if (!extra) return;

        const moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.className = "pc-civitai-more-groups";
        const hidden = rows.length - GROUPS_PREVIEW;
        moreBtn.textContent = expanded
          ? "Show less"
          : `Show ${hidden} more group${hidden === 1 ? "" : "s"}`;
        moreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          expanded = !expanded;
          paintGroups();
        });
        groupsWrap.appendChild(moreBtn);
      }

      paintGroups();
    }

    card.append(headRow, groupsWrap);
    return card;
  }

  function renderList(query) {
    hideCoverTip();
    selected.clear();
    selectedText.clear();
    paintActions();
    scroll.replaceChildren();

    if (!loaded.ok) {
      status.textContent = loaded.error || "Toolkit unavailable";
      return;
    }

    const q = (query || "").trim();
    if (!q) {
      status.textContent = "Type a filename or Civitai title to search.";
      return;
    }

    const hits = searchCivitaiLoras(loaded.models, q);
    if (!hits.length) {
      status.textContent = "No LoRAs matched.";
      return;
    }

    status.textContent = `${hits.length} LoRA${hits.length === 1 ? "" : "s"}`;
    hits.forEach((model, index) => {
      scroll.appendChild(makeModelCard(model, index));
    });
  }

  let timer = null;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => renderList(search.value), 120);
  });
  search.addEventListener("keydown", (e) => e.stopPropagation());

  if (!loaded.ok) {
    status.textContent = loaded.error || "Toolkit unavailable";
  } else {
    renderList("");
  }

  requestAnimationFrame(() => search.focus());
}
