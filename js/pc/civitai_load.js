import { openPopup } from "./popup.js";
import { CHEVRON_ICON_SVG, IMAGE_ICON_SVG } from "./icons.js";
import {
  fetchCivitaiLoras,
  modelCoverUrl,
  modelDisplayName,
  modelFileLabel,
  parseTriggerGroups,
  searchCivitaiLoras,
} from "./civitai_toolkit.js";
import { openToolkitModelInfo } from "./civitai_toolkit_popup.js";
import { openPysssssLoraInfo } from "./pysssss_info.js";
import { joinFields } from "./join.js";

const PREVIEW_CHARS = 96;
/** How many trigger groups to show before “Show more”. */
const GROUPS_PREVIEW = 2;

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

/**
 * Search Civitai Toolkit local DB for LoRA trigger groups → Append / Replace positive.
 * @param {{ anchor: Element, node?: object, onApply: (text: string, mode: "append"|"replace") => void }} opts
 */
export async function openCivitaiLoadPopup({ anchor, node, onApply } = {}) {
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

      function makeInfoPair(model) {
        const pair = document.createElement("div");
        pair.className = "pc-civitai-info-pair";
        const file = modelFileLabel(model);

        const toolkitBtn = document.createElement("button");
        toolkitBtn.type = "button";
        toolkitBtn.className = "pc-civitai-ext-info";
        toolkitBtn.textContent = "?";
        toolkitBtn.title = "Civitai Toolkit · Local Manager info";
        toolkitBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
        toolkitBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          hideCoverTip();
          // Keep search open — Toolkit overlay is above our popup.
          openToolkitModelInfo(model, modelDisplayName(model));
        });

        const fullBtn = document.createElement("button");
        fullBtn.type = "button";
        fullBtn.className = "pc-civitai-ext-info pc-civitai-ext-info-full";
        fullBtn.textContent = "i";
        fullBtn.title = "View Lora info (pysssss)";
        fullBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
        fullBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          hideCoverTip();
          // pysssss ComfyDialog sits under our popup — close first, then open
          // with a Comfy-canonical lora name (Toolkit paths often mismatch).
          close();
          setTimeout(() => openPysssssLoraInfo(file, node), 0);
        });

        pair.append(toolkitBtn, fullBtn);
        return pair;
      }

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

        head.append(previewBtn, titles, makeInfoPair(model));

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
              reposition?.();
            });
            groupsWrap.appendChild(moreBtn);
          }

          paintGroups();
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
