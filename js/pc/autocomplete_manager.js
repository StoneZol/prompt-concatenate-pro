import { autocompleteAction, autocompleteList, rebuildAutocomplete } from "./api.js";
import { CHEVRON_ICON_SVG } from "./icons.js";
import { makeBusyLine } from "./busy.js";

function makeSideTabs(current, onChange) {
  const row = document.createElement("div");
  row.className = "pc-ac-mgr-tabs";
  for (const side of [
    { id: "pos", label: "positive" },
    { id: "neg", label: "negative" },
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pc-ac-mgr-tab" + (current === side.id ? " active" : "");
    btn.textContent = side.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (current !== side.id) onChange(side.id);
    });
    row.appendChild(btn);
  }
  return row;
}

function bucketLabel(bucket) {
  if (!bucket || bucket === "_other") return "other";
  return bucket;
}

function groupByBucket(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.bucket || "_other";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      String(a.text || "").localeCompare(String(b.text || ""), undefined, {
        sensitivity: "base",
      }),
    );
  }
  return map;
}

function sortBucketKeys(keys) {
  return [...keys].sort((a, b) => {
    if (a === "_other") return 1;
    if (b === "_other") return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  });
}

/** Search forces open; otherwise remember toggles (default collapsed). */
function groupExpanded(name, { query, openMap }) {
  if ((query || "").trim()) return true;
  if (openMap?.has(name)) return openMap.get(name);
  return false;
}

function makeBucketSection({ title, bucketKey, items, expanded, onToggleExpand, renderItem }) {
  const folder = document.createElement("div");
  folder.className = "pc-preset-folder";
  if (!expanded) folder.classList.add("collapsed");

  const head = document.createElement("div");
  head.className = "pc-preset-folder-head pc-mgr-folder-head";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pc-mgr-folder-toggle";

  const chevron = document.createElement("span");
  chevron.className = "pc-preset-folder-chevron";
  chevron.innerHTML = CHEVRON_ICON_SVG;

  const label = document.createElement("span");
  label.className = "pc-preset-folder-name";
  label.textContent = title;

  const count = document.createElement("span");
  count.className = "pc-preset-folder-count";
  count.textContent = String(items.length);

  toggle.append(chevron, label, count);
  toggle.title = expanded ? "Collapse" : "Expand";
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  head.appendChild(toggle);

  const body = document.createElement("div");
  body.className = "pc-preset-folder-body pc-ac-mgr-bucket-body";
  for (const item of items) {
    body.appendChild(renderItem(item));
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const collapsed = folder.classList.toggle("collapsed");
    toggle.title = collapsed ? "Expand" : "Collapse";
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    onToggleExpand?.(!collapsed);
  });

  folder.append(head, body);
  folder.dataset.bucket = bucketKey;
  return folder;
}

/**
 * Embed autocomplete dictionary UI into a host (Library manager tab).
 * Returns { reload } so the parent can refresh when switching tabs.
 */
export function mountAutocompletePanel(host, { reposition } = {}) {
  host.replaceChildren();
  host.classList.add("pc-ac-mgr-panel");

  let side = "pos";
  let items = [];
  const openMaps = {
    pos: new Map(),
    neg: new Map(),
  };

  const tabsHost = document.createElement("div");
  const filter = document.createElement("input");
  filter.className = "pc-popup-input";
  filter.type = "text";
  filter.placeholder = "search segments";

  const addRow = document.createElement("div");
  addRow.className = "pc-ac-mgr-add";
  const addInput = document.createElement("input");
  addInput.className = "pc-popup-input";
  addInput.type = "text";
  addInput.placeholder = "add segment";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "pc-popup-btn primary";
  addBtn.textContent = "Add";
  addRow.append(addInput, addBtn);

  const busy = makeBusyLine({ className: "pc-ac-mgr-busy-overlay" });

  const list = document.createElement("div");
  list.className = "pc-ac-mgr-list pc-preset-list";

  const status = document.createElement("div");
  status.className = "pc-popup-message";

  const actions = document.createElement("div");
  actions.className = "pc-popup-actions";
  const rebuild = document.createElement("button");
  rebuild.type = "button";
  rebuild.className = "pc-popup-btn";
  rebuild.textContent = "Rebuild from library";
  rebuild.title = "Scan all saved pairs into pos/neg dictionaries";
  actions.appendChild(rebuild);

  let working = false;

  function setWorking(on, message) {
    working = Boolean(on);
    filter.disabled = working;
    addInput.disabled = working;
    addBtn.disabled = working;
    rebuild.disabled = working;
    tabsHost.style.pointerEvents = working ? "none" : "";
    tabsHost.style.opacity = working ? "0.55" : "";
    list.classList.toggle("is-busy", working);
    if (working) busy.show(message || "Working…");
  }

  function clearWorking() {
    working = false;
    filter.disabled = false;
    addInput.disabled = false;
    addBtn.disabled = false;
    rebuild.disabled = false;
    tabsHost.style.pointerEvents = "";
    tabsHost.style.opacity = "";
    list.classList.remove("is-busy");
  }

  function paintTabs() {
    tabsHost.replaceChildren(
      makeSideTabs(side, (next) => {
        if (working) return;
        side = next;
        paintTabs();
        load();
      }),
    );
  }

  function paintList() {
    const q = filter.value.trim().toLowerCase();
    const openMap = openMaps[side];
    list.replaceChildren();

    const matched = q
      ? items.filter((row) => String(row.text || "").toLowerCase().includes(q))
      : items;

    if (!matched.length) {
      const empty = document.createElement("div");
      empty.className = "pc-popup-message";
      empty.textContent = items.length ? "No matches" : "Dictionary empty";
      list.appendChild(empty);
      reposition?.();
      return;
    }

    const grouped = groupByBucket(matched);
    const keys = sortBucketKeys(grouped.keys());

    for (const key of keys) {
      const groupItems = grouped.get(key) || [];
      list.appendChild(
        makeBucketSection({
          title: bucketLabel(key),
          bucketKey: key,
          items: groupItems,
          expanded: groupExpanded(key, { query: q, openMap }),
          onToggleExpand: (open) => openMap.set(key, open),
          renderItem: (row) => {
            const line = document.createElement("div");
            line.className = "pc-ac-mgr-row";
            const label = document.createElement("div");
            label.className = "pc-ac-mgr-text";
            label.textContent = row.text;
            label.title = `${row.text} · ×${row.use_count || 1}`;
            const del = document.createElement("button");
            del.type = "button";
            del.className = "pc-popup-btn danger";
            del.textContent = "×";
            del.title = "Remove";
            del.addEventListener("click", async (e) => {
              e.stopPropagation();
              del.disabled = true;
              const result = await autocompleteAction({
                action: "delete",
                side,
                text: row.text,
              });
              if (!result.ok) {
                status.textContent = result.error || "Delete failed";
                del.disabled = false;
                return;
              }
              status.textContent = "";
              load();
            });
            line.append(label, del);
            return line;
          },
        }),
      );
    }
    reposition?.();
  }

  async function load() {
    setWorking(true, "Loading dictionary…");
    status.textContent = "";
    try {
      const result = await autocompleteList(side, "", 2000);
      if (!result.ok) {
        busy.error(result.error || "Load failed");
        items = [];
        paintList();
        return;
      }
      items = result.items || [];
      const buckets = new Set(items.map((row) => row.bucket || "_other")).size;
      status.textContent = `${items.length} segment${items.length === 1 ? "" : "s"} · ${buckets} group${buckets === 1 ? "" : "s"}`;
      paintList();
      busy.hide();
    } catch (err) {
      busy.error(err?.message || "Load failed");
      items = [];
      paintList();
    } finally {
      clearWorking();
    }
  }

  async function addSegment() {
    const text = addInput.value.trim();
    if (!text) return;
    addBtn.disabled = true;
    const result = await autocompleteAction({ action: "add", side, text });
    addBtn.disabled = false;
    if (!result.ok) {
      status.textContent = result.error || "Add failed";
      return;
    }
    addInput.value = "";
    status.textContent = "";
    await load();
    const added = String(result.text || text);
    const found = items.find((row) => row.text === added);
    if (found) {
      openMaps[side].set(found.bucket || "_other", true);
      paintList();
    }
  }

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addSegment();
  });
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSegment();
    }
  });
  filter.addEventListener("input", paintList);
  rebuild.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (working) return;
    setWorking(true, "Rebuilding dictionary from library…");
    status.textContent = "";
    try {
      const result = await rebuildAutocomplete((msg) => {
        if (msg.phase === "start" && !msg.total) {
          busy.progress({
            current: 0,
            total: 0,
            percent: 100,
            message: "No pairs in library yet",
          });
          return;
        }
        busy.progress(msg);
      });
      if (!result.ok) {
        busy.error(result.error || "Rebuild failed");
        clearWorking();
        return;
      }
      const n = result.presets || result.total || 0;
      busy.done(`Rebuilt from ${n} pair${n === 1 ? "" : "s"}`);
      await new Promise((r) => setTimeout(r, 350));
      await load();
    } catch (err) {
      busy.error(err?.message || "Rebuild failed");
      clearWorking();
    }
  });

  paintTabs();
  host.append(tabsHost, filter, addRow, busy.el, list, status, actions);
  load();

  return { reload: load };
}
