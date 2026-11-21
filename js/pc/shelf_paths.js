import { CHEVRON_ICON_SVG, PLUS_ICON_SVG } from "./icons.js";
import { openPopup } from "./popup.js";

/** Collection paths: `Scene/Walk/Night` — `/` separates nested collections. */
export const SHELF_SEP = "/";

export function normalizeShelfPath(raw) {
  return String(raw || "")
    .split(SHELF_SEP)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(SHELF_SEP);
}

/** `Scene` + `Walk/Night` → `{ folder: "Scene/Walk", name: "Night" }`. */
export function splitShelfName(folder, name) {
  const shelf = normalizeShelfPath(folder);
  const raw = String(name || "").trim();
  if (!raw.includes(SHELF_SEP)) return { folder: shelf, name: raw };
  const parts = raw
    .split(SHELF_SEP)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { folder: shelf, name: "" };
  if (parts.length === 1) return { folder: shelf, name: parts[0] };
  const prefix = parts.slice(0, -1).join(SHELF_SEP);
  return {
    folder: normalizeShelfPath(shelf ? `${shelf}${SHELF_SEP}${prefix}` : prefix),
    name: parts[parts.length - 1],
  };
}

export function shelfSegments(path) {
  const normalized = normalizeShelfPath(path);
  return normalized ? normalized.split(SHELF_SEP) : [];
}

export function shelfLeaf(path) {
  const segments = shelfSegments(path);
  return segments[segments.length - 1] || "";
}

export function shelfRoot(path) {
  return shelfSegments(path)[0] || "";
}

export function joinShelfPath(parent, child) {
  return normalizeShelfPath(`${parent || ""}${SHELF_SEP}${child || ""}`);
}

export function isInShelfTree(name, root) {
  const key = normalizeShelfPath(name).toLowerCase();
  const base = normalizeShelfPath(root).toLowerCase();
  if (!base) return Boolean(key);
  return key === base || key.startsWith(base + SHELF_SEP);
}

export function relativeShelfPath(name, root) {
  const path = normalizeShelfPath(name);
  const base = normalizeShelfPath(root);
  if (!base) return path;
  if (path.toLowerCase() === base.toLowerCase()) return "";
  return path.slice(base.length + 1);
}

/** `{ name, count }` entries → direct children of `parent` with subtree totals. */
export function shelfChildren(entries, parent = "") {
  const base = normalizeShelfPath(parent);
  const depth = shelfSegments(base).length;
  const children = new Map();
  for (const entry of entries || []) {
    const name = normalizeShelfPath(typeof entry === "string" ? entry : entry?.name);
    if (!name || !isInShelfTree(name, base)) continue;
    const segments = name.split(SHELF_SEP);
    if (segments.length <= depth) continue;
    const path = segments.slice(0, depth + 1).join(SHELF_SEP);
    const key = path.toLowerCase();
    const child = children.get(key) || { path, leaf: segments[depth], total: 0 };
    child.total += Number(typeof entry === "string" ? 0 : entry?.count || 0);
    children.set(key, child);
  }
  return [...children.values()].sort((a, b) =>
    a.leaf.localeCompare(b.leaf, undefined, { sensitivity: "base" }),
  );
}

/** Every path and its ancestors, so intermediate folders without own pairs stay pickable. */
export function allShelfPaths(entries) {
  const paths = new Map();
  for (const entry of entries || []) {
    const segments = shelfSegments(typeof entry === "string" ? entry : entry?.name);
    for (let i = 1; i <= segments.length; i += 1) {
      const path = segments.slice(0, i).join(SHELF_SEP);
      if (!paths.has(path.toLowerCase())) paths.set(path.toLowerCase(), path);
    }
  }
  return [...paths.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function shelfTotal(entries, path) {
  let total = 0;
  for (const entry of entries || []) {
    if (typeof entry === "string") continue;
    if (isInShelfTree(entry?.name, path)) total += Number(entry?.count || 0);
  }
  return total;
}

export function makeShelfCrumbs({ path, rootLabel = "All", root = "", onNavigate }) {
  const crumbs = document.createElement("div");
  crumbs.className = "pc-civitai-crumbs pc-shelf-crumbs";
  const base = shelfSegments(root);
  const segments = shelfSegments(path);

  const add = (label, target, isCurrent) => {
    const crumb = document.createElement("button");
    crumb.type = "button";
    crumb.className = "pc-civitai-crumb" + (isCurrent ? " is-current" : "");
    crumb.textContent = label;
    crumb.title = target || label;
    if (!isCurrent) {
      crumb.addEventListener("click", (e) => {
        e.stopPropagation();
        onNavigate?.(target);
      });
    }
    crumbs.appendChild(crumb);
  };
  const sep = () => {
    const el = document.createElement("span");
    el.className = "pc-civitai-crumb-sep";
    el.textContent = "›";
    crumbs.appendChild(el);
  };

  if (!base.length) {
    add(rootLabel, "", !segments.length);
  } else {
    add(base[base.length - 1], base.join(SHELF_SEP), segments.length <= base.length);
  }
  for (let i = base.length; i < segments.length; i += 1) {
    sep();
    add(segments[i], segments.slice(0, i + 1).join(SHELF_SEP), i === segments.length - 1);
  }
  return crumbs;
}

export function makeShelfFolderRow({ leaf, total, title, onOpen }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pc-pick-item pc-shelf-folder-row";
  btn.title = title || leaf;

  const icon = document.createElement("span");
  icon.className = "pc-shelf-folder-icon";
  icon.innerHTML = CHEVRON_ICON_SVG;

  const label = document.createElement("span");
  label.className = "pc-shelf-folder-label";
  label.textContent = leaf;

  const count = document.createElement("span");
  count.className = "pc-shelf-folder-count";
  count.textContent = String(total || 0);

  btn.append(icon, label, count);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onOpen?.();
  });
  return btn;
}

/**
 * Choose a collection path: browse sub-collections, filter all paths, or create a sub-folder.
 * `categories` — `{ name, count }` from listCategories (plain strings work too).
 */
export function openShelfPicker({
  anchor,
  categories,
  current,
  onPick,
  onClose,
  nested = true,
  title = "Collection",
  allowEmpty = false,
  emptyLabel = "Uncategorised",
}) {
  return openPopup({
    nested,
    anchor,
    title,
    width: 300,
    onClose,
    render(body, { close, reposition }) {
      let path = normalizeShelfPath(current);
      const known = new Set(allShelfPaths(categories).map((p) => p.toLowerCase()));
      if (path && !known.has(path.toLowerCase())) {
        const parts = shelfSegments(path);
        while (parts.length && !known.has(parts.join(SHELF_SEP).toLowerCase())) parts.pop();
        path = parts.join(SHELF_SEP);
      }

      const crumbsHost = document.createElement("div");

      const filter = document.createElement("input");
      filter.className = "pc-popup-input";
      filter.type = "text";
      filter.placeholder = "filter all collections";

      const list = document.createElement("div");
      list.className = "pc-pick-list";

      const newRow = document.createElement("div");
      newRow.className = "pc-save-folder-row";
      newRow.hidden = true;

      const newInput = document.createElement("input");
      newInput.className = "pc-popup-input";
      newInput.type = "text";
      newInput.placeholder = "sub-folder name";

      const newConfirm = document.createElement("button");
      newConfirm.type = "button";
      newConfirm.className = "pc-popup-btn primary";
      newConfirm.textContent = "Create";
      newRow.append(newInput, newConfirm);

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const newBtn = document.createElement("button");
      newBtn.type = "button";
      newBtn.className = "pc-popup-btn pc-shelf-new-btn";
      newBtn.innerHTML = `${PLUS_ICON_SVG}<span>New folder</span>`;
      newBtn.title = "Create a sub-folder here";

      const useBtn = document.createElement("button");
      useBtn.type = "button";
      useBtn.className = "pc-popup-btn primary";

      actions.append(newBtn, useBtn);

      function pick(value) {
        close();
        onPick?.(normalizeShelfPath(value));
      }

      function paint() {
        crumbsHost.replaceChildren(
          makeShelfCrumbs({
            path,
            onNavigate: (target) => {
              path = target;
              paint();
            },
          }),
        );
        useBtn.disabled = !path && !allowEmpty;
        useBtn.textContent = path
          ? `Use “${shelfLeaf(path)}”`
          : allowEmpty
            ? `Use “${emptyLabel}”`
            : "Pick a folder";
        useBtn.title = path || (allowEmpty ? emptyLabel : "");

        list.replaceChildren();
        const q = filter.value.trim().toLowerCase();
        if (q) {
          const shown = allShelfPaths(categories).filter((p) => p.toLowerCase().includes(q));
          if (!shown.length) {
            const empty = document.createElement("div");
            empty.className = "pc-popup-message";
            empty.textContent = "No matches";
            list.appendChild(empty);
          }
          for (const p of shown) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pc-pick-item";
            btn.textContent = p;
            btn.title = p;
            if (p.toLowerCase() === normalizeShelfPath(current).toLowerCase()) {
              btn.classList.add("selected");
            }
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              pick(p);
            });
            list.appendChild(btn);
          }
          reposition?.();
          return;
        }

        const children = shelfChildren(categories, path);
        if (!children.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = path ? "No sub-folders" : "No collections yet";
          list.appendChild(empty);
        }
        for (const child of children) {
          list.appendChild(
            makeShelfFolderRow({
              leaf: child.leaf,
              total: child.total || shelfTotal(categories, child.path),
              title: child.path,
              onOpen: () => {
                path = child.path;
                paint();
              },
            }),
          );
        }
        reposition?.();
      }

      function createFolder() {
        const name = normalizeShelfPath(newInput.value);
        if (!name) {
          newInput.focus();
          return;
        }
        pick(joinShelfPath(path, name));
      }

      filter.addEventListener("input", paint);
      useBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (path || allowEmpty) pick(path);
      });
      newBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        newRow.hidden = !newRow.hidden;
        if (!newRow.hidden) requestAnimationFrame(() => newInput.focus());
        reposition?.();
      });
      newConfirm.addEventListener("click", (e) => {
        e.stopPropagation();
        createFolder();
      });
      newInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          createFolder();
        }
      });

      paint();
      body.append(crumbsHost, filter, list, newRow, actions);
      requestAnimationFrame(() => filter.focus());
    },
  });
}

/**
 * Sub-folder hints while typing a path: after `Scene/` lists children of `Scene`.
 * Tab / click completes the segment. `getCategories` returns current `{ name, count }` list.
 */
export function bindShelfPathHints(input, getCategories) {
  const box = document.createElement("div");
  box.className = "pc-shelf-hints";
  box.hidden = true;
  let items = [];
  let active = 0;

  function hide() {
    box.hidden = true;
    items = [];
  }

  function apply(item) {
    input.value = `${item.path}${SHELF_SEP}`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function paint() {
    const raw = input.value;
    const cut = raw.lastIndexOf(SHELF_SEP);
    const parent = cut >= 0 ? normalizeShelfPath(raw.slice(0, cut)) : "";
    const typed = (cut >= 0 ? raw.slice(cut + 1) : raw).trim().toLowerCase();
    if (cut < 0 && !typed) {
      hide();
      return;
    }
    items = shelfChildren(getCategories?.() || [], parent).filter((child) => {
      const leaf = child.leaf.toLowerCase();
      return leaf.startsWith(typed) && leaf !== typed;
    });
    if (!items.length) {
      hide();
      return;
    }
    active = Math.min(active, items.length - 1);
    box.replaceChildren();
    items.slice(0, 8).forEach((item, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pc-shelf-hint" + (index === active ? " active" : "");
      row.textContent = item.leaf;
      row.title = item.path;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        apply(item);
      });
      box.appendChild(row);
    });
    box.hidden = false;
  }

  input.addEventListener("input", () => {
    active = 0;
    paint();
  });
  input.addEventListener("focus", paint);
  input.addEventListener("blur", () => setTimeout(hide, 120));
  input.addEventListener("keydown", (e) => {
    if (box.hidden || !items.length) return;
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      apply(items[active]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % Math.min(items.length, 8);
      paint();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + Math.min(items.length, 8)) % Math.min(items.length, 8);
      paint();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      hide();
    }
  });
  return box;
}

/** Path input + hints wrapper (input stays the same element callers already wire). */
export function wrapShelfInput(input, getCategories) {
  const wrap = document.createElement("div");
  wrap.className = "pc-shelf-input-wrap";
  const hints = bindShelfPathHints(input, getCategories);
  wrap.append(input, hints);
  return wrap;
}
