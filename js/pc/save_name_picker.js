import { openPopup } from "./popup.js";

const UNCATEGORISED = "Uncategorised";

function groupLabel(name) {
  return (name || "").trim() || UNCATEGORISED;
}

/**
 * Pick an existing saved name to overwrite, grouped by collection / folder.
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
    width: 300,
    onClose,
    render(body, { close }) {
      const filter = document.createElement("input");
      filter.className = "pc-popup-input";
      filter.type = "text";
      filter.placeholder = "filter";

      const list = document.createElement("div");
      list.className = "pc-pick-list";

      const status = document.createElement("div");
      status.className = "pc-popup-message";
      status.textContent = "Loading…";
      list.appendChild(status);

      const selectedGroup = groupLabel(currentGroup).toLowerCase();
      const selectedName = (currentName || "").trim().toLowerCase();
      let items = [];

      function paint() {
        const q = filter.value.trim().toLowerCase();
        const shown = items.filter(
          (item) =>
            !q ||
            item.name.toLowerCase().includes(q) ||
            groupLabel(item.group).toLowerCase().includes(q),
        );
        list.replaceChildren();
        if (!shown.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = items.length ? "No matches" : "Nothing saved yet";
          list.appendChild(empty);
          return;
        }

        const groups = new Map();
        for (const item of shown) {
          const key = groupLabel(item.group);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(item);
        }
        const keys = [...groups.keys()].sort((a, b) => {
          const aCur = a.toLowerCase() === selectedGroup;
          const bCur = b.toLowerCase() === selectedGroup;
          if (aCur !== bCur) return aCur ? -1 : 1;
          return a.localeCompare(b);
        });

        for (const key of keys) {
          const head = document.createElement("div");
          head.className = "pc-pick-group";
          head.textContent = key;
          list.appendChild(head);
          const rows = groups.get(key).sort((a, b) => a.name.localeCompare(b.name));
          for (const item of rows) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pc-pick-item";
            btn.textContent = item.name;
            if (
              key.toLowerCase() === selectedGroup &&
              item.name.toLowerCase() === selectedName
            ) {
              btn.classList.add("selected");
            }
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              close();
              onPick?.(item);
            });
            list.appendChild(btn);
          }
        }
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
        });
    },
  });
}
