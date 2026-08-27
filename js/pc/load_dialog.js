import { CHEVRON_ICON_SVG, LOAD_ICON_SVG } from "./icons.js";
import { openConfirmPopup, openPopup } from "./popup.js";
import { listLayouts } from "./api.js";
import { matchesLayoutPreset } from "./search.js";

const DESC_PREVIEW_CHARS = 60;
const UNCATEGORISED = "Uncategorised";

function makePresetCard(layout, { onLoad }) {
  const card = document.createElement("div");
  card.className = "pc-preset-item";

  const head = document.createElement("div");
  head.className = "pc-preset-head";

  const name = document.createElement("div");
  name.className = "pc-preset-name";
  name.textContent = layout.name || "Untitled";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "pc-preset-load";
  loadBtn.title = "Load";
  loadBtn.innerHTML = LOAD_ICON_SVG;
  loadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onLoad?.(layout);
  });

  head.append(name, loadBtn);

  const slots = document.createElement("div");
  slots.className = "pc-preset-slots";
  const slotNames = (layout.slots || []).map((slot) => String(slot || "").trim()).filter(Boolean);
  slots.textContent = slotNames.join(" · ") || "No fields";

  card.append(head, slots);

  const description = (layout.description || "").trim();
  if (!description) return card;

  const descRow = document.createElement("div");
  descRow.className = "pc-preset-desc-row";

  const desc = document.createElement("div");
  desc.className = "pc-preset-desc";

  const long = description.length > DESC_PREVIEW_CHARS;
  const preview = long ? `${description.slice(0, DESC_PREVIEW_CHARS).trimEnd()}…` : description;
  desc.textContent = preview;

  descRow.appendChild(desc);

  if (long) {
    card.classList.add("desc-long", "desc-collapsed");
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "pc-preset-collapse";
    collapseBtn.innerHTML = CHEVRON_ICON_SVG;

    function applyCollapsed() {
      const collapsed = card.classList.contains("desc-collapsed");
      desc.textContent = collapsed ? preview : description;
      collapseBtn.title = collapsed ? "Expand description" : "Collapse description";
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

function groupLayouts(layouts) {
  const folders = new Map();
  const uncategorised = [];
  for (const layout of layouts) {
    const folder = String(layout.folder || "").trim();
    if (!folder) {
      uncategorised.push(layout);
      continue;
    }
    const list = folders.get(folder) || [];
    list.push(layout);
    folders.set(folder, list);
  }
  const named = [...folders.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return { uncategorised, named, folders };
}

function makeFolder({ title, layouts, expanded, onLoad }) {
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
  count.textContent = String(layouts.length);

  head.append(chevron, label, count);
  head.title = expanded ? "Collapse folder" : "Expand folder";
  head.setAttribute("aria-expanded", expanded ? "true" : "false");

  const body = document.createElement("div");
  body.className = "pc-preset-folder-body";
  for (const layout of layouts) {
    body.appendChild(makePresetCard(layout, { onLoad }));
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

function matchesLayout(layout, query) {
  return matchesLayoutPreset(layout, query, { emptyFolder: UNCATEGORISED });
}

function paintPresetList(list, layouts, query, onLoad) {
  const q = (query || "").trim();
  const matched = layouts.filter((layout) => matchesLayout(layout, query));
  list.replaceChildren();
  if (!matched.length) {
    const empty = document.createElement("div");
    empty.className = "pc-popup-message";
    empty.textContent = q ? "No presets" : "No saved presets yet.";
    list.appendChild(empty);
    return;
  }

  const grouped = groupLayouts(matched);
  const searching = Boolean(q);

  if (grouped.uncategorised.length) {
    list.appendChild(
      makeFolder({
        title: UNCATEGORISED,
        layouts: grouped.uncategorised,
        expanded: true,
        onLoad,
      }),
    );
  }
  for (const name of grouped.named) {
    list.appendChild(
      makeFolder({
        title: name,
        layouts: grouped.folders.get(name) || [],
        expanded: searching,
        onLoad,
      }),
    );
  }
}

export function openLoadPresetPopup({ anchor, onPick }) {
  return openPopup({
    anchor,
    title: "Load preset",
    width: 340,
    render(body, { close, reposition }) {
      const status = document.createElement("div");
      status.className = "pc-popup-message";
      status.textContent = "Loading…";
      body.appendChild(status);

      listLayouts()
        .then((result) => {
          const layouts = result.layouts || [];
          if (!result.ok) {
            status.textContent = result.error || "Failed to load presets";
            reposition();
            return;
          }
          if (!layouts.length) {
            status.textContent = "No saved presets yet.";
            reposition();
            return;
          }
          status.remove();

          const search = document.createElement("input");
          search.className = "pc-popup-input";
          search.type = "text";
          search.placeholder = "name or folder\\slot";

          const list = document.createElement("div");
          list.className = "pc-preset-list";

          const onLoad = (picked) => {
            close();
            onPick?.(picked);
          };

          search.addEventListener("input", () => {
            paintPresetList(list, layouts, search.value, onLoad);
            reposition();
          });

          paintPresetList(list, layouts, "", onLoad);
          body.append(search, list);
          reposition();
          requestAnimationFrame(() => search.focus());
        })
        .catch((err) => {
          status.textContent = err?.message || "Failed to load presets";
          reposition();
        });
    },
  });
}

export function confirmReplaceGroups({ anchor, onConfirm }) {
  openConfirmPopup({
    anchor,
    title: "Load preset",
    message: "Replace current groups with this preset?",
    confirmLabel: "Replace",
    cancelLabel: "Cancel",
    danger: true,
    onConfirm,
  });
}
