import { CHEVRON_ICON_SVG } from "./icons.js";
import { openPopup } from "./popup.js";
import { matchesPromptPreset } from "./search.js";
import { normalizeShelfPath, shelfLeaf, shelfSegments } from "./shelf_paths.js";

const UNCATEGORISED = "Uncategorised";

function groupLabel(name) {
  return normalizeShelfPath(name) || UNCATEGORISED;
}

function buildFolderTree(items) {
  const root = { path: "", items: [], children: new Map() };
  for (const item of items) {
    const path = groupLabel(item.group);
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

function sortedChildren(node, preferredPath = "") {
  const preferred = groupLabel(preferredPath).toLowerCase();
  return [...node.children.values()].sort((a, b) => {
    const aPref =
      preferred === a.path.toLowerCase() || preferred.startsWith(`${a.path.toLowerCase()}/`);
    const bPref =
      preferred === b.path.toLowerCase() || preferred.startsWith(`${b.path.toLowerCase()}/`);
    if (aPref !== bPref) return aPref ? -1 : 1;
    const aUncat = a.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    const bUncat = b.path.toLowerCase() === UNCATEGORISED.toLowerCase();
    if (aUncat !== bUncat) return aUncat ? -1 : 1;
    return shelfLeaf(a.path).localeCompare(shelfLeaf(b.path), undefined, {
      sensitivity: "base",
    });
  });
}

function shouldExpand(node, { searching, currentPath }) {
  if (searching) return true;
  const path = node.path.toLowerCase();
  if (path === UNCATEGORISED.toLowerCase()) return true;
  const current = groupLabel(currentPath).toLowerCase();
  if (!current) return false;
  return current === path || current.startsWith(`${path}/`);
}

function makeFolder({
  title,
  tooltip,
  items,
  children,
  count,
  expanded,
  selectedGroup,
  selectedName,
  onPick,
  close,
}) {
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
  countEl.textContent = String(count ?? items.length);

  head.append(chevron, label, countEl);
  head.title = expanded ? "Collapse folder" : "Expand folder";
  head.setAttribute("aria-expanded", expanded ? "true" : "false");

  const body = document.createElement("div");
  body.className = "pc-preset-folder-body";

  for (const child of children) body.appendChild(child);

  const rows = [...items].sort((a, b) => a.name.localeCompare(b.name));
  for (const item of rows) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pc-pick-item";
    btn.textContent = item.name;
    if (
      groupLabel(item.group).toLowerCase() === selectedGroup &&
      item.name.toLowerCase() === selectedName
    ) {
      btn.classList.add("selected");
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      onPick?.(item);
    });
    body.appendChild(btn);
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

/**
 * Pick an existing saved name to overwrite, nested by collection / folder path.
 * items: [{ name, group, description }]
 */
export function openExistingNamePicker({
  anchor,
  title = "Existing",
  load,
  currentGroup = "",
  currentName = "",
  onPick,
  onClose,
}) {
  return openPopup({
    nested: true,
    anchor,
    title,
    width: 480,
    onClose,
    render(body, { close, reposition }) {
      const filter = document.createElement("input");
      filter.className = "pc-popup-input";
      filter.type = "text";
      filter.placeholder = "name or folder\\token";

      const list = document.createElement("div");
      list.className = "pc-pick-list pc-existing-list";

      const status = document.createElement("div");
      status.className = "pc-popup-message";
      status.textContent = "Loading…";
      list.appendChild(status);

      const selectedGroup = groupLabel(currentGroup).toLowerCase();
      const selectedName = (currentName || "").trim().toLowerCase();
      let items = [];

      function paint() {
        const q = filter.value.trim();
        const searching = Boolean(q);
        const shown = items.filter((item) =>
          matchesPromptPreset(
            {
              title: item.name,
              category: item.group,
              description: item.description,
            },
            q,
          ),
        );
        list.replaceChildren();
        if (!shown.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = items.length ? "No matches" : "Nothing saved yet";
          list.appendChild(empty);
          reposition?.();
          return;
        }

        const root = buildFolderTree(shown);
        const renderNode = (node) => {
          const isUncat = node.path.toLowerCase() === UNCATEGORISED.toLowerCase();
          return makeFolder({
            title: isUncat ? node.path : shelfLeaf(node.path),
            tooltip: isUncat ? undefined : node.path,
            items: node.items,
            count: treeTotal(node),
            children: sortedChildren(node, currentGroup).map(renderNode),
            expanded: shouldExpand(node, { searching, currentPath: currentGroup }),
            selectedGroup,
            selectedName,
            onPick,
            close,
          });
        };

        for (const node of sortedChildren(root, currentGroup)) {
          list.appendChild(renderNode(node));
        }
        reposition?.();
      }

      filter.addEventListener("input", paint);
      body.append(filter, list);
      requestAnimationFrame(() => filter.focus());

      Promise.resolve()
        .then(() => load())
        .then((loaded) => {
          items = (loaded || []).filter((item) => (item.name || "").trim());
          paint();
        })
        .catch((err) => {
          status.textContent = err?.message || "Failed to load";
          reposition?.();
        });
    },
  });
}
