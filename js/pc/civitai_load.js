import { CHEVRON_ICON_SVG, CLOSE_ICON_SVG, COPY_ICON_SVG, IMAGE_ICON_SVG } from "./icons.js";
import { injectPopupStyles } from "./popup.js";
import {
  buildLoraFolderTree,
  fetchCivitaiLoras,
  fetchCivitaiPageUrl,
  fetchLoraSidecarNotes,
  flattenLoraTree,
  getTreeNodeAtPath,
  modelCivitaiUrlFromFields,
  modelCoverUrl,
  modelDescriptionText,
  modelDisplayName,
  modelFileLabel,
  modelMatchesQuery,
  modelTags,
  parseTriggerGroups,
} from "./civitai_toolkit.js";
import { joinFields } from "./join.js";

const PREVIEW_CHARS = 144; // ~1.5× the original 96
const DESC_PREVIEW_CHARS = 200;
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

/**
 * LoRA detail: meta + notes + description + selectable trigger groups → Append / Replace.
 */
function openModelInfoOverlay(model, { onApply, onDone } = {}) {
  document.querySelector(".pc-civitai-info-overlay")?.remove();

  const title = modelDisplayName(model);
  const file = modelFileLabel(model);
  const cover = modelCoverUrl(model);
  const description = modelDescriptionText(model);
  const base = (model.base_model || "").trim();
  const groups = parseTriggerGroups(model.trained_words);

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
    return { section, text, copyBtn, label };
  }

  // Order: Notes → Tags → Description → Triggers. Empty blocks are omitted.
  const notesSlot = document.createElement("div");
  notesSlot.className = "pc-civitai-info-notes-slot";
  body.appendChild(notesSlot);

  const tags = modelTags(model);
  if (tags.length) {
    const tagsSection = document.createElement("div");
    tagsSection.className = "pc-civitai-info-section";
    const tagsHead = document.createElement("div");
    tagsHead.className = "pc-civitai-info-section-head";
    const tagsLabel = document.createElement("div");
    tagsLabel.className = "pc-civitai-info-label";
    tagsLabel.textContent = `Civitai tags · ${tags.length}`;
    tagsHead.appendChild(tagsLabel);
    const tagsWrap = document.createElement("div");
    tagsWrap.className = "pc-civitai-info-tags";
    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "pc-civitai-tag";
      chip.textContent = tag;
      chip.title = tag;
      tagsWrap.appendChild(chip);
    }
    tagsSection.append(tagsHead, tagsWrap);
    body.appendChild(tagsSection);
  }

  if (description) {
    const desc = makeSection("Description");
    desc.section.classList.add("pc-civitai-info-desc");
    desc.copyBtn.disabled = false;
    desc.copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyText(description, desc.copyBtn);
    });

    const needsCollapse = description.length > DESC_PREVIEW_CHARS;
    // No triggers → open; has triggers → truncated to ~200 chars.
    let descOpen = groups.length === 0 || !needsCollapse;
    const preview = `${description.slice(0, DESC_PREVIEW_CHARS)}…`;

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "pc-civitai-desc-more";

    function paintDescOpen() {
      desc.text.textContent = descOpen || !needsCollapse ? description : preview;
      if (!needsCollapse) {
        moreBtn.hidden = true;
        return;
      }
      moreBtn.hidden = false;
      moreBtn.textContent = descOpen ? "Show less" : "Show more";
      moreBtn.title = descOpen ? "Collapse description" : "Expand description";
    }

    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      descOpen = !descOpen;
      paintDescOpen();
    });

    paintDescOpen();
    if (needsCollapse) desc.section.appendChild(moreBtn);
    body.appendChild(desc.section);
  }

  // --- Trigger groups (Append / Replace targets) ---
  const triggersSection = document.createElement("div");
  triggersSection.className = "pc-civitai-info-section pc-civitai-info-triggers";

  const triggersHead = document.createElement("div");
  triggersHead.className = "pc-civitai-info-section-head";
  const triggersLabel = document.createElement("div");
  triggersLabel.className = "pc-civitai-info-label";
  triggersLabel.textContent = groups.length
    ? `Triggers · ${groups.length}`
    : "Triggers";
  triggersHead.appendChild(triggersLabel);

  const groupsWrap = document.createElement("div");
  groupsWrap.className = "pc-civitai-groups";

  /** @type {Set<number>} */
  const selected = new Set();
  /** @type {Map<number, string>} */
  const selectedText = new Map();

  const footer = document.createElement("div");
  footer.className = "pc-civitai-info-footer";

  const appendBtn = document.createElement("button");
  appendBtn.type = "button";
  appendBtn.className = "pc-popup-btn";
  appendBtn.textContent = "Append";

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "pc-popup-btn primary";
  replaceBtn.textContent = "Replace";

  footer.append(appendBtn, replaceBtn);

  function paintActions() {
    const on = selected.size > 0;
    appendBtn.disabled = !on;
    replaceBtn.disabled = !on;
  }

  function collectedText() {
    const parts = [];
    for (const idx of [...selected].sort((a, b) => a - b)) {
      const text = selectedText.get(idx);
      if (text) parts.push(text);
    }
    return joinFields(parts);
  }

  function apply(mode) {
    const text = collectedText();
    if (!text) return;
    onApply?.(text, mode);
    overlay.remove();
    onDone?.();
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

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "pc-civitai-empty-groups";
    empty.textContent = "No trigger groups";
    groupsWrap.appendChild(empty);
  } else {
    const rows = groups.map((text, groupIndex) => {
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
          textEl.classList.toggle("is-expanded", expanded);
          expandBtn.classList.toggle("open", expanded);
          expandBtn.title = expanded ? "Collapse" : "Show full";
        });
      }

      function paintSelected() {
        const on = selected.has(groupIndex);
        row.classList.toggle("selected", on);
        row.setAttribute("aria-pressed", on ? "true" : "false");
      }

      function toggleSelected() {
        if (selected.has(groupIndex)) {
          selected.delete(groupIndex);
          selectedText.delete(groupIndex);
        } else {
          selected.add(groupIndex);
          selectedText.set(groupIndex, text);
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
    });

    const extra = rows.length > GROUPS_PREVIEW;
    let listExpanded = false;

    function paintGroups() {
      groupsWrap.replaceChildren();
      const visible = listExpanded ? rows : rows.slice(0, GROUPS_PREVIEW);
      for (const row of visible) groupsWrap.appendChild(row);
      if (!extra) return;

      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "pc-civitai-more-groups";
      const hidden = rows.length - GROUPS_PREVIEW;
      moreBtn.textContent = listExpanded
        ? "Show less"
        : `Show ${hidden} more group${hidden === 1 ? "" : "s"}`;
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        listExpanded = !listExpanded;
        paintGroups();
      });
      groupsWrap.appendChild(moreBtn);
    }

    paintGroups();
  }

  triggersSection.append(triggersHead, groupsWrap);
  body.appendChild(triggersSection);

  panel.append(head, body, footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  fetchLoraSidecarNotes(file).then((result) => {
    if (!notesSlot.isConnected) return;
    if (!(result.ok && result.notes)) {
      notesSlot.remove();
      return;
    }
    const notes = makeSection(result.source ? `Notes · ${result.source}` : "Notes");
    notes.text.textContent = result.notes;
    notes.copyBtn.disabled = false;
    notes.copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyText(result.notes, notes.copyBtn);
    });
    notesSlot.replaceChildren(notes.section);
  });
}

/**
 * Browse / search Toolkit LoRAs. Click title → Info (triggers + Append / Replace).
 * Closes only via X.
 */
export async function openCivitaiLoadPopup({ onApply } = {}) {
  injectPopupStyles();
  hideCoverTip();
  activeOverlay?.remove();
  activeOverlay = null;

  const loaded = await fetchCivitaiLoras();
  const tree = loaded.ok ? buildLoraFolderTree(loaded.models) : { __files__: [], __models__: {} };

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
  title.textContent = "Civitai · LoRAs";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "pc-civitai-modal-close";
  closeBtn.title = "Close";
  closeBtn.innerHTML = CLOSE_ICON_SVG;

  head.append(title, closeBtn);

  const top = document.createElement("div");
  top.className = "pc-civitai-modal-top";

  const crumbs = document.createElement("div");
  crumbs.className = "pc-civitai-crumbs";

  const search = document.createElement("input");
  search.type = "search";
  search.className = "pc-popup-input pc-civitai-search";
  search.placeholder = "Browse · or search name / file / tag…";
  search.autocomplete = "off";

  const status = document.createElement("div");
  status.className = "pc-popup-message pc-civitai-status";

  top.append(head, crumbs, search, status);

  const scroll = document.createElement("div");
  scroll.className = "pc-civitai-list";

  modal.append(top, scroll);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  /** @type {string[]} */
  let folderPath = [];

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

  function openInfo(model) {
    hideCoverTip();
    openModelInfoOverlay(model, {
      onApply,
      onDone: close,
    });
  }

  function makeLoraRow(model) {
    const row = document.createElement("div");
    row.className = "pc-civitai-row";

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

    const nameEl = document.createElement("button");
    nameEl.type = "button";
    nameEl.className = "pc-civitai-title-btn";
    nameEl.textContent = modelDisplayName(model);
    nameEl.title = "Open LoRA info";
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      openInfo(model);
    });

    const file = modelFileLabel(model);
    const fileBase = file.replace(/\\/g, "/").split("/").pop() || file;
    titles.appendChild(nameEl);
    if (fileBase) {
      const sub = document.createElement("div");
      sub.className = "pc-civitai-file";
      sub.textContent = fileBase;
      sub.title = file;
      titles.appendChild(sub);
    }

    const base = (model.base_model || "").trim();
    if (base && base !== "N/A") {
      const bm = document.createElement("div");
      bm.className = "pc-civitai-base";
      bm.textContent = base;
      bm.title = base;
      row.append(previewBtn, titles, bm);
    } else {
      row.append(previewBtn, titles);
    }

    row.addEventListener("click", (e) => {
      if (e.target.closest(".pc-civitai-preview-btn")) return;
      openInfo(model);
    });

    return row;
  }

  function makeSearchGroupHeader(folderKey, count) {
    const header = document.createElement("button");
    header.type = "button";
    header.className = "pc-civitai-search-group" + (folderKey ? " clickable" : "");
    const label = folderKey
      ? `📁 ${folderKey.split("/").join(" / ")}`
      : "📁 loras (root)";
    header.textContent = `${label}  ·  ${count}`;
    header.title = folderKey ? `Open folder: ${folderKey}` : "Already at root";
    header.disabled = !folderKey;
    if (folderKey) {
      header.addEventListener("click", (e) => {
        e.stopPropagation();
        folderPath = [...folderPath, ...folderKey.split("/").filter(Boolean)];
        search.value = "";
        render();
      });
    }
    return header;
  }

  function makeFolderRow(name) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "pc-civitai-folder";
    const icon = document.createElement("span");
    icon.className = "pc-civitai-folder-icon";
    icon.textContent = "📁";
    const label = document.createElement("span");
    label.className = "pc-civitai-folder-label";
    label.textContent = name;
    const arrow = document.createElement("span");
    arrow.className = "pc-civitai-folder-arrow";
    arrow.textContent = "▸";
    row.append(icon, label, arrow);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      folderPath = [...folderPath, name];
      search.value = "";
      render();
    });
    return row;
  }

  function paintCrumbs() {
    crumbs.replaceChildren();

    const root = document.createElement("button");
    root.type = "button";
    root.className = "pc-civitai-crumb" + (folderPath.length ? "" : " is-current");
    root.textContent = "loras";
    if (folderPath.length === 0) {
      root.setAttribute("aria-current", "page");
    } else {
      root.addEventListener("click", (e) => {
        e.stopPropagation();
        folderPath = [];
        search.value = "";
        render();
      });
    }
    crumbs.appendChild(root);

    folderPath.forEach((seg, idx) => {
      const sep = document.createElement("span");
      sep.className = "pc-civitai-crumb-sep";
      sep.textContent = "/";
      crumbs.appendChild(sep);

      const isCurrent = idx === folderPath.length - 1;
      const crumb = document.createElement("button");
      crumb.type = "button";
      crumb.className = "pc-civitai-crumb" + (isCurrent ? " is-current" : "");
      crumb.textContent = seg;
      crumb.title = seg;
      if (isCurrent) {
        crumb.setAttribute("aria-current", "page");
      } else {
        crumb.addEventListener("click", (e) => {
          e.stopPropagation();
          folderPath = folderPath.slice(0, idx + 1);
          search.value = "";
          render();
        });
      }
      crumbs.appendChild(crumb);
    });
  }

  function render() {
    hideCoverTip();
    paintCrumbs();
    scroll.replaceChildren();

    if (!loaded.ok) {
      status.textContent = loaded.error || "Toolkit unavailable";
      return;
    }

    let node = getTreeNodeAtPath(tree, folderPath);
    if (!node) {
      folderPath = [];
      node = tree;
      paintCrumbs();
    }

    const q = search.value.trim();
    const scopeLabel = folderPath.length ? folderPath.join("/") : "all folders";
    search.placeholder = q
      ? `Search in ${scopeLabel}…`
      : `Browse ${scopeLabel} · or search name / file / tag…`;

    if (q) {
      const hits = flattenLoraTree(node)
        .filter((item) => modelMatchesQuery(item.model, q))
        .sort((a, b) => {
          const pa = a.folderPrefix.join("/");
          const pb = b.folderPrefix.join("/");
          if (pa !== pb) return pa.localeCompare(pb, undefined, { sensitivity: "base" });
          return modelDisplayName(a.model).localeCompare(modelDisplayName(b.model), undefined, {
            sensitivity: "base",
          });
        });

      if (!hits.length) {
        status.textContent = `No matches in ${scopeLabel}`;
        return;
      }

      const groups = new Map();
      for (const hit of hits) {
        const key = hit.folderPrefix.join("/") || "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(hit);
      }

      status.textContent = `${hits.length} match${hits.length === 1 ? "" : "es"} in ${groups.size} folder${groups.size === 1 ? "" : "s"}`;
      for (const [folderKey, groupHits] of groups) {
        scroll.appendChild(makeSearchGroupHeader(folderKey, groupHits.length));
        for (const hit of groupHits) {
          scroll.appendChild(makeLoraRow(hit.model));
        }
      }
      return;
    }

    const subfolders = Object.keys(node)
      .filter((k) => k !== "__files__" && k !== "__models__")
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const files = (node.__files__ || [])
      .slice()
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    if (!subfolders.length && !files.length) {
      status.textContent = "No LoRAs here";
      return;
    }

    status.textContent = [
      subfolders.length ? `${subfolders.length} folder${subfolders.length === 1 ? "" : "s"}` : "",
      files.length ? `${files.length} LoRA${files.length === 1 ? "" : "s"}` : "",
      "click title for triggers",
    ]
      .filter(Boolean)
      .join(" · ");

    for (const folder of subfolders) {
      scroll.appendChild(makeFolderRow(folder));
    }
    for (const file of files) {
      const model = node.__models__?.[file];
      if (!model) continue;
      scroll.appendChild(makeLoraRow(model));
    }
  }

  let timer = null;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => render(), 120);
  });
  search.addEventListener("keydown", (e) => e.stopPropagation());

  render();
  requestAnimationFrame(() => search.focus());
}
