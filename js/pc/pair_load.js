import { CHEVRON_ICON_SVG, LOAD_ICON_SVG, TEXT_ICON_SVG } from "./icons.js";
import { openConfirmPopup, openPopup } from "./popup.js";
import { listPresets } from "./api.js";
import { bindPromptTip, hidePromptTip } from "./preview_tip.js";
import { getUiPref, setUiPref, ensureUiPrefs } from "./prefs.js";
import { matchesPromptPreset, parseSearchQuery } from "./search.js";

const DESC_PREVIEW_CHARS = 60;

function makePromptCard(preset, { onLoad }) {
  const card = document.createElement("div");
  card.className = "pc-preset-item";

  const head = document.createElement("div");
  head.className = "pc-preset-head";

  const name = document.createElement("div");
  name.className = "pc-preset-name";
  name.textContent = preset.title || "Untitled";

  const peekBtn = document.createElement("button");
  peekBtn.type = "button";
  peekBtn.className = "pc-preset-peek";
  peekBtn.innerHTML = TEXT_ICON_SVG;
  bindPromptTip(peekBtn, () => ({
    positive: preset.positive,
    negative: preset.negative,
  }));

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "pc-preset-load";
  loadBtn.title = "Load";
  loadBtn.innerHTML = LOAD_ICON_SVG;
  loadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    hidePromptTip();
    onLoad?.(preset);
  });

  head.append(name, peekBtn, loadBtn);
  card.appendChild(head);

  const description = (preset.description || "").trim();
  if (!description) return card;

  const descRow = document.createElement("div");
  descRow.className = "pc-preset-desc-row";

  const desc = document.createElement("div");
  desc.className = "pc-preset-desc";

  const long = description.length > DESC_PREVIEW_CHARS;
  const short = long ? `${description.slice(0, DESC_PREVIEW_CHARS).trimEnd()}…` : description;
  desc.textContent = short;
  descRow.appendChild(desc);

  if (long) {
    card.classList.add("desc-long", "desc-collapsed");
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "pc-preset-collapse";
    collapseBtn.innerHTML = CHEVRON_ICON_SVG;

    function applyCollapsed() {
      const collapsed = card.classList.contains("desc-collapsed");
      desc.textContent = collapsed ? short : description;
      collapseBtn.title = collapsed ? "Expand notes" : "Collapse notes";
      collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      card.classList.toggle("desc-collapsed");
      applyCollapsed();
    });

    descRow.appendChild(collapseBtn);
    applyCollapsed();
  }

  card.appendChild(descRow);
  return card;
}

function makeFolder({ title, presets, expanded, onLoad }) {
  const folder = document.createElement("div");
  folder.className = "pc-preset-folder";
  if (!expanded) folder.classList.add("collapsed");

  const head = document.createElement("button");
  head.type = "button";
  head.className = "pc-preset-folder-head";

  const chevron = document.createElement("span");
  chevron.className = "pc-preset-folder-chevron";
  chevron.innerHTML = CHEVRON_ICON_SVG;

  const label = document.createElement("span");
  label.className = "pc-preset-folder-name";
  label.textContent = title;

  const count = document.createElement("span");
  count.className = "pc-preset-folder-count";
  count.textContent = String(presets.length);

  head.append(chevron, label, count);
  head.title = expanded ? "Collapse folder" : "Expand folder";
  head.setAttribute("aria-expanded", expanded ? "true" : "false");

  const body = document.createElement("div");
  body.className = "pc-preset-folder-body";
  for (const preset of presets) {
    body.appendChild(makePromptCard(preset, { onLoad }));
  }

  head.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = folder.classList.toggle("collapsed");
    head.title = collapsed ? "Expand folder" : "Collapse folder";
    head.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  folder.append(head, body);
  return folder;
}

function groupByCategory(presets) {
  const folders = new Map();
  for (const preset of presets) {
    const name = (preset.category || "").trim() || "Uncategorised";
    const list = folders.get(name) || [];
    list.push(preset);
    folders.set(name, list);
  }
  return folders;
}

function paintList(list, presets, { query, others, currentCategory, onLoad, includeBody }) {
  hidePromptTip();
  const q = (query || "").trim().toLowerCase();
  const matched = presets.filter((preset) =>
    matchesPromptPreset(preset, query, { includeBody }),
  );
  list.replaceChildren();
  if (!matched.length) {
    const empty = document.createElement("div");
    empty.className = "pc-popup-message";
    empty.textContent = q
      ? "No prompts"
      : others
        ? "No saved prompts yet."
        : "No prompts in this collection.";
    list.appendChild(empty);
    return;
  }

  if (!others) {
    for (const preset of matched) {
      list.appendChild(makePromptCard(preset, { onLoad }));
    }
    return;
  }

  const folders = groupByCategory(matched);
  const names = [...folders.keys()].sort((a, b) => {
    const current = (currentCategory || "").toLowerCase();
    const aCur = a.toLowerCase() === current;
    const bCur = b.toLowerCase() === current;
    if (aCur !== bCur) return aCur ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });

  for (const name of names) {
    const items = folders.get(name) || [];
    const isCurrent = name.toLowerCase() === (currentCategory || "").toLowerCase();
    list.appendChild(
      makeFolder({
        title: name,
        presets: items,
        expanded: isCurrent || Boolean(q),
        onLoad,
      }),
    );
  }
}

export async function openLoadPairPopup({ anchor, category, onPick }) {
  const shelf = (category || "").trim();
  if (!shelf) {
    openConfirmPopup({
      anchor,
      title: "Load pair",
      message: "Name the pair first.",
      confirmLabel: "OK",
      showCancel: false,
      danger: false,
    });
    return;
  }
  await ensureUiPrefs();
  return openPopup({
    anchor,
    title: shelf ? `Load pair · ${shelf}` : "Load pair",
    width: 340,
    onClose: hidePromptTip,
    render(body, { close, reposition }) {
      const status = document.createElement("div");
      status.className = "pc-popup-message";
      status.textContent = "Loading…";
      body.appendChild(status);

      let own = [];
      let all = null;
      let others = Boolean(getUiPref("otherCollections"));
      let includeBody = Boolean(getUiPref("searchInPrompts"));

      const search = document.createElement("input");
      search.className = "pc-popup-input";
      search.type = "text";
      search.placeholder = "name or shelf\\keyword";

      const extra = document.createElement("div");
      extra.className = "pc-toggle-row";

      const toggle = document.createElement("div");
      toggle.className = "pc-toggle" + (others ? " on" : "");
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", others ? "true" : "false");
      const knob = document.createElement("div");
      knob.className = "pc-toggle-knob";
      toggle.appendChild(knob);

      const extraLabel = document.createElement("span");
      extraLabel.textContent = "Other collections";

      extra.append(toggle, extraLabel);

      const bodyRow = document.createElement("div");
      bodyRow.className = "pc-toggle-row";

      const bodyToggle = document.createElement("div");
      bodyToggle.className = "pc-toggle" + (includeBody ? " on" : "");
      bodyToggle.setAttribute("role", "switch");
      bodyToggle.setAttribute("aria-checked", includeBody ? "true" : "false");
      const bodyKnob = document.createElement("div");
      bodyKnob.className = "pc-toggle-knob";
      bodyToggle.appendChild(bodyKnob);

      const bodyLabel = document.createElement("span");
      bodyLabel.textContent = "Search in prompts";

      bodyRow.append(bodyToggle, bodyLabel);

      const list = document.createElement("div");
      list.className = "pc-preset-list";

      const onLoad = (picked) => {
        close();
        onPick?.(picked);
      };

      function currentItems() {
        return others && all ? all : own;
      }

      function paint() {
        paintList(list, currentItems(), {
          query: search.value,
          others,
          currentCategory: shelf,
          onLoad,
          includeBody,
        });
        reposition();
      }

      async function enableOthers({ persist = true } = {}) {
        if (!all) {
          extraLabel.textContent = "Loading…";
          const result = await listPresets();
          if (!result.ok) {
            extraLabel.textContent = "Other collections";
            throw new Error(result.error || "Failed to load prompts");
          }
          all = result.presets || [];
        }
        others = true;
        toggle.classList.add("on");
        toggle.setAttribute("aria-checked", "true");
        extraLabel.textContent = "Other collections";
        if (persist) setUiPref("otherCollections", true);
        paint();
      }

      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (others) {
          others = false;
          toggle.classList.remove("on");
          toggle.setAttribute("aria-checked", "false");
          setUiPref("otherCollections", false);
          paint();
          return;
        }
        enableOthers().catch((err) => {
          status.textContent = err?.message || "Failed to load prompts";
          if (!status.isConnected) body.prepend(status);
          reposition();
        });
      });

      bodyToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        includeBody = !includeBody;
        bodyToggle.classList.toggle("on", includeBody);
        bodyToggle.setAttribute("aria-checked", includeBody ? "true" : "false");
        setUiPref("searchInPrompts", includeBody);
        paint();
      });

      search.addEventListener("input", () => {
        const { hasShelfFilter } = parseSearchQuery(search.value);
        if (hasShelfFilter && !others) {
          enableOthers({ persist: false }).catch((err) => {
            status.textContent = err?.message || "Failed to load prompts";
            if (!status.isConnected) body.prepend(status);
            reposition();
          });
          return;
        }
        paint();
      });

      listPresets({ category: shelf })
        .then(async (result) => {
          if (!result.ok) {
            status.textContent = result.error || "Failed to load prompts";
            reposition();
            return;
          }
          own = result.presets || [];
          status.remove();
          body.append(search, extra, bodyRow, list);
          if (others) {
            try {
              await enableOthers({ persist: false });
            } catch (err) {
              others = false;
              toggle.classList.remove("on");
              toggle.setAttribute("aria-checked", "false");
              status.textContent = err?.message || "Failed to load prompts";
              body.prepend(status);
              paint();
            }
          } else {
            paint();
          }
          requestAnimationFrame(() => search.focus());
        })
        .catch((err) => {
          status.textContent = err?.message || "Failed to load prompts";
          reposition();
        });
    },
  });
}

export function confirmReplacePair({ anchor, onConfirm }) {
  openConfirmPopup({
    anchor,
    title: "Load pair",
    message: "Replace current prompts with this pair?",
    confirmLabel: "Replace",
    cancelLabel: "Cancel",
    danger: true,
    onConfirm,
  });
}
