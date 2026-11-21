import { CHEVRON_ICON_SVG, LOAD_ICON_SVG, PLUS_ICON_SVG } from "./icons.js";
import { openConfirmPopup, openPopup } from "./popup.js";
import { listTemplates } from "./api.js";
import { matchesTemplatePreset } from "./search.js";
import { normalizeShelfPath, shelfLeaf, shelfSegments } from "./shelf_paths.js";

const DESC_PREVIEW_CHARS = 60;
const UNCATEGORISED = "Uncategorised";

function slotMeta(template) {
  const slots = template.slots || [];
  const titles = slots.map((slot) => (slot?.title || "").trim()).filter(Boolean);
  const on = slots.filter((slot) => slot?.enabled !== false).length;
  const off = slots.length - on;
  const names = titles.join(" · ") || "No fields";
  if (off > 0) return `${names} · ${on} on / ${off} off`;
  return names;
}

function makeTemplateCard(template, { onLoad }) {
  const card = document.createElement("div");
  card.className = "pc-preset-item";

  const head = document.createElement("div");
  head.className = "pc-preset-head";

  const name = document.createElement("div");
  name.className = "pc-preset-name";
  name.textContent = template.name || "Untitled";

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "pc-preset-load";
  loadBtn.title = "Replace all pairs with this template";
  loadBtn.innerHTML = LOAD_ICON_SVG;
  loadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onLoad?.(template, "replace");
  });

  const mergeBtn = document.createElement("button");
  mergeBtn.type = "button";
  mergeBtn.className = "pc-preset-append";
  mergeBtn.title = "Merge into current pairs by slot name";
  mergeBtn.innerHTML = PLUS_ICON_SVG;
  mergeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onLoad?.(template, "merge");
  });

  head.append(name, loadBtn, mergeBtn);

  const slots = document.createElement("div");
  slots.className = "pc-preset-slots";
  slots.textContent = slotMeta(template);

  card.append(head, slots);

  const description = (template.description || "").trim();
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

function buildFolderTree(items, folderKey) {
  const root = { path: "", items: [], children: new Map() };
  for (const item of items) {
    const path = normalizeShelfPath(item[folderKey]) || UNCATEGORISED;
    let node = root;
    for (const segment of shelfSegments(path)) {
      const key = segment.toLowerCase();
      if (!node.children.has(key)) {
        node.children.set(key, {
          path: node.path ? `${node.path}/${segment}` : segment,
          items: [],
          children: new Map(),
        });
      }
      node = node.children.get(key);
    }
    node.items.push(item);
  }
  return root;
}

function treeTotal(node) {
  return (
    node.items.length +
    [...node.children.values()].reduce((sum, child) => sum + treeTotal(child), 0)
  );
}

function sortedChildren(node) {
  return [...node.children.values()].sort((a, b) => {
    const aUncat = a.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    const bUncat = b.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    if (aUncat !== bUncat) return aUncat ? -1 : 1;
    return shelfLeaf(a.path).localeCompare(shelfLeaf(b.path), undefined, {
      sensitivity: "base",
    });
  });
}

function makeFolder({ title, templates, expanded, onLoad, children = [], count, tooltip }) {
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
  if (tooltip) label.title = tooltip;

  const countEl = document.createElement("span");
  countEl.className = "pc-preset-folder-count";
  countEl.textContent = String(count ?? templates.length);

  head.append(chevron, label, countEl);
  head.title = expanded ? "Collapse folder" : "Expand folder";
  head.setAttribute("aria-expanded", expanded ? "true" : "false");

  const body = document.createElement("div");
  body.className = "pc-preset-folder-body";
  for (const child of children) body.appendChild(child);
  for (const template of templates) {
    body.appendChild(makeTemplateCard(template, { onLoad }));
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

function paintTemplateList(list, templates, query, onLoad) {
  const q = (query || "").trim();
  const matched = templates.filter((template) =>
    matchesTemplatePreset(template, query, { emptyFolder: UNCATEGORISED }),
  );
  list.replaceChildren();
  if (!matched.length) {
    const empty = document.createElement("div");
    empty.className = "pc-popup-message";
    empty.textContent = q ? "No templates" : "No saved templates yet.";
    list.appendChild(empty);
    return;
  }

  const searching = Boolean(q);
  const root = buildFolderTree(matched, "folder");
  const renderNode = (node) => {
    const isUncat = node.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    return makeFolder({
      title: isUncat ? node.path : shelfLeaf(node.path),
      tooltip: isUncat ? undefined : node.path,
      templates: node.items,
      count: treeTotal(node),
      children: sortedChildren(node).map(renderNode),
      expanded: searching || isUncat,
      onLoad,
    });
  };
  for (const node of sortedChildren(root)) {
    list.appendChild(renderNode(node));
  }
}

export function openLoadTemplatePopup({ anchor, onPick }) {
  return openPopup({
    anchor,
    title: "Load template",
    width: 340,
    render(body, { close, reposition }) {
      const status = document.createElement("div");
      status.className = "pc-popup-message";
      status.textContent = "Loading…";
      body.appendChild(status);

      listTemplates()
        .then((result) => {
          const templates = result.templates || [];
          if (!result.ok) {
            status.textContent = result.error || "Failed to load templates";
            reposition();
            return;
          }
          if (!templates.length) {
            status.textContent = "No saved templates yet.";
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

          const onLoad = (picked, mode) => {
            close();
            onPick?.(picked, mode);
          };

          search.addEventListener("input", () => {
            paintTemplateList(list, templates, search.value, onLoad);
            reposition();
          });

          paintTemplateList(list, templates, "", onLoad);
          body.append(search, list);
          reposition();
          requestAnimationFrame(() => search.focus());
        })
        .catch((err) => {
          status.textContent = err?.message || "Failed to load templates";
          reposition();
        });
    },
  });
}

export function confirmReplaceTemplate({ anchor, onConfirm }) {
  openConfirmPopup({
    anchor,
    title: "Load template",
    message: "Replace all pairs on this node with this template?",
    confirmLabel: "Replace",
    cancelLabel: "Cancel",
    danger: true,
    onConfirm,
  });
}

export function confirmReloadTemplate({ anchor, onConfirm }) {
  openConfirmPopup({
    anchor,
    title: "Reload template",
    message: "Load the saved template onto this node again?",
    confirmLabel: "Load again",
    cancelLabel: "Cancel",
    danger: false,
    onConfirm,
  });
}
