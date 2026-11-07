import { openPopup } from "./popup.js";
import { CHEVRON_ICON_SVG, IMAGE_ICON_SVG, TEXT_ICON_SVG } from "./icons.js";
import {
  fetchCivitaiLoras,
  fetchLoraSidecarNotes,
  modelCoverUrl,
  modelDescriptionText,
  modelDisplayName,
  modelFileLabel,
  parseTriggerGroups,
  searchCivitaiLoras,
} from "./civitai_toolkit.js";
import { joinFields } from "./join.js";

const PREVIEW_CHARS = 96;

let coverTip = null;

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

function openModelInfoPopup({ anchor, model }) {
  const title = modelDisplayName(model);
  const file = modelFileLabel(model);
  const cover = modelCoverUrl(model);
  const description = modelDescriptionText(model);

  openPopup({
    nested: true,
    title: title || "LoRA info",
    anchor,
    width: 420,
    onClose: hideCoverTip,
    render(body, { reposition }) {
      const scroll = document.createElement("div");
      scroll.className = "pc-popup-scroll pc-civitai-info";

      if (cover) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "pc-civitai-info-cover";
        const img = document.createElement("img");
        img.src = cover;
        img.alt = title;
        imgWrap.appendChild(img);
        scroll.appendChild(imgWrap);
      }

      if (file) {
        const fileEl = document.createElement("div");
        fileEl.className = "pc-civitai-info-file";
        fileEl.textContent = file;
        fileEl.title = file;
        scroll.appendChild(fileEl);
      }

      const notesSection = document.createElement("div");
      notesSection.className = "pc-civitai-info-section";
      const notesLabel = document.createElement("div");
      notesLabel.className = "pc-civitai-info-label";
      notesLabel.textContent = "Notes";
      const notesBody = document.createElement("div");
      notesBody.className = "pc-civitai-info-text";
      notesBody.textContent = "Loading…";
      notesSection.append(notesLabel, notesBody);
      scroll.appendChild(notesSection);

      const descSection = document.createElement("div");
      descSection.className = "pc-civitai-info-section";
      const descLabel = document.createElement("div");
      descLabel.className = "pc-civitai-info-label";
      descLabel.textContent = "Description";
      const descBody = document.createElement("div");
      descBody.className = "pc-civitai-info-text";
      descBody.textContent = description || "No description.";
      descSection.append(descLabel, descBody);
      scroll.appendChild(descSection);

      body.appendChild(scroll);

      fetchLoraSidecarNotes(file).then((notes) => {
        if (!notesSection.isConnected) return;
        if (notes) {
          notesBody.textContent = notes;
        } else {
          notesBody.textContent = "No sidecar note (.txt / .md).";
          notesSection.classList.add("is-empty");
        }
        reposition?.();
      });

      requestAnimationFrame(() => reposition?.());
    },
  });
}

/**
 * Search Civitai Toolkit local DB for LoRA trigger groups → Append / Replace positive.
 * @param {{ anchor: Element, onApply: (text: string, mode: "append"|"replace") => void }} opts
 */
export async function openCivitaiLoadPopup({ anchor, onApply } = {}) {
  const loaded = await fetchCivitaiLoras();

  return openPopup({
    title: "Civitai · triggers",
    anchor,
    width: 460,
    onClose: hideCoverTip,
    render(body, { close, reposition }) {
      const fixed = document.createElement("div");
      fixed.className = "pc-popup-fixed";

      const search = document.createElement("input");
      search.type = "search";
      search.className = "pc-popup-input";
      search.placeholder = "Search filename or title…";
      search.autocomplete = "off";

      const status = document.createElement("div");
      status.className = "pc-popup-message";

      const scroll = document.createElement("div");
      scroll.className = "pc-popup-scroll pc-civitai-list";

      const footer = document.createElement("div");
      footer.className = "pc-popup-footer";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions pc-civitai-footer";

      const appendBtn = document.createElement("button");
      appendBtn.type = "button";
      appendBtn.className = "pc-popup-btn";
      appendBtn.textContent = "Append";

      const replaceBtn = document.createElement("button");
      replaceBtn.type = "button";
      replaceBtn.className = "pc-popup-btn primary";
      replaceBtn.textContent = "Replace";

      actions.append(appendBtn, replaceBtn);
      footer.appendChild(actions);

      /** @type {Set<string>} */
      const selected = new Set();
      /** @type {Map<string, string>} */
      const selectedText = new Map();

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
            reposition?.();
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

        const head = document.createElement("div");
        head.className = "pc-civitai-head";

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
          previewBtn.addEventListener("mouseenter", () => {
            showCoverTip(previewBtn, coverUrl);
          });
          previewBtn.addEventListener("mouseleave", () => hideCoverTip());
        }

        const titles = document.createElement("div");
        titles.className = "pc-civitai-titles";

        const title = document.createElement("div");
        title.className = "pc-civitai-title";
        title.textContent = modelDisplayName(model);
        title.title = modelDisplayName(model);

        const file = modelFileLabel(model);
        if (file) {
          const sub = document.createElement("div");
          sub.className = "pc-civitai-file";
          sub.textContent = file;
          sub.title = file;
          titles.append(title, sub);
        } else {
          titles.appendChild(title);
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
          openModelInfoPopup({ anchor: infoBtn, model });
        });

        head.append(previewBtn, titles, infoBtn);

        const groups = parseTriggerGroups(model.trained_words);
        const groupsWrap = document.createElement("div");
        groupsWrap.className = "pc-civitai-groups";

        if (!groups.length) {
          const empty = document.createElement("div");
          empty.className = "pc-civitai-empty-groups";
          empty.textContent = "No trigger groups";
          groupsWrap.appendChild(empty);
        } else {
          groups.forEach((text, groupIndex) => {
            groupsWrap.appendChild(makeGroupRow(modelIndex, groupIndex, text));
          });
        }

        card.append(head, groupsWrap);
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
        reposition?.();
      }

      let timer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => renderList(search.value), 120);
      });
      search.addEventListener("keydown", (e) => e.stopPropagation());

      fixed.append(search, status);
      body.append(fixed, scroll, footer);

      if (!loaded.ok) {
        status.textContent = loaded.error || "Toolkit unavailable";
      } else {
        renderList("");
      }

      requestAnimationFrame(() => {
        search.focus();
        reposition?.();
      });
    },
  });
}
