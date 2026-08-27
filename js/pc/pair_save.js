import { openConfirmPopup, openPopup } from "./popup.js";
import { listCategories, savePreset, shelfNames } from "./api.js";
import { baseShelfName } from "./titles.js";

function matchesCategory(name, query) {
  if (!query) return true;
  return name.toLowerCase().includes(query);
}

function openCategoryPicker({ anchor, categories, current, onPick, onClose }) {
  return openPopup({
    nested: true,
    anchor,
    title: "Collection",
    width: 260,
    onClose,
    render(body, { close }) {
      const filter = document.createElement("input");
      filter.className = "pc-popup-input";
      filter.type = "text";
      filter.placeholder = "filter";

      const list = document.createElement("div");
      list.className = "pc-pick-list";

      const selected = (current || "").trim();
      const items = [...categories];
      if (selected && !items.some((name) => name.toLowerCase() === selected.toLowerCase())) {
        items.unshift(selected);
      }

      function paint() {
        const q = filter.value.trim().toLowerCase();
        const shown = items.filter((name) => matchesCategory(name, q));
        list.replaceChildren();
        if (!shown.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = "No collections";
          list.appendChild(empty);
          return;
        }
        for (const name of shown) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pc-pick-item";
          btn.textContent = name;
          if (name.toLowerCase() === selected.toLowerCase()) btn.classList.add("selected");
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            close();
            onPick?.(name);
          });
          list.appendChild(btn);
        }
      }

      filter.addEventListener("input", paint);
      paint();
      body.append(filter, list);
      requestAnimationFrame(() => filter.focus());
    },
  });
}

export function openSavePairPopup({ anchor, group, onSaved }) {
  const defaultCategory = baseShelfName(group?.title);
  const positive = group?.positive || "";
  const negative = group?.negative || "";
  const loadedTitle = (group?.loadedTitle || "").trim();
  const loadedCategory = (group?.loadedCategory || "").trim();
  const loadedDescription = (group?.loadedDescription || "").trim();

  if (!defaultCategory) {
    openConfirmPopup({
      anchor,
      title: "Save pair",
      message: "Name the pair first.",
      confirmLabel: "OK",
      showCancel: false,
      danger: false,
    });
    return;
  }

  if (!positive.trim() && !negative.trim()) {
    openConfirmPopup({
      anchor,
      title: "Save pair",
      message: "Write a prompt first.",
      confirmLabel: "OK",
      showCancel: false,
      danger: false,
    });
    return;
  }

  return openPopup({
    anchor,
    title: "Save pair",
    width: 320,
    render(body, { close }) {
      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "prompt name";
      title.value = loadedTitle;

      const categoryRow = document.createElement("div");
      categoryRow.className = "pc-save-folder-row";

      const category = document.createElement("input");
      category.className = "pc-popup-input";
      category.type = "text";
      category.placeholder = "collection";
      category.value = loadedCategory || defaultCategory;

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      categoryRow.append(category, pickBtn);

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 3;
      desc.value = loadedDescription;

      const errorEl = document.createElement("div");
      errorEl.className = "pc-popup-error";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "pc-popup-btn primary";
      confirm.textContent = "Save";

      let overwrite = false;
      let categories = [];
      let picker = null;

      function resetOverwrite() {
        if (!overwrite) return;
        overwrite = false;
        confirm.textContent = "Save";
        confirm.classList.remove("danger");
        confirm.classList.add("primary");
      }

      pickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker) {
          picker.close();
          picker = null;
          return;
        }
        picker = openCategoryPicker({
          anchor: pickBtn,
          categories,
          current: category.value.trim() || defaultCategory,
          onPick: (name) => {
            category.value = name || "";
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      async function submit() {
        const name = title.value.trim();
        const shelf = category.value.trim() || defaultCategory;
        title.classList.toggle("invalid", !name);
        category.classList.toggle("invalid", !shelf);
        if (!name) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        if (!shelf) {
          errorEl.textContent = "Collection is required";
          category.focus();
          return;
        }
        confirm.disabled = true;
        try {
          const result = await savePreset({
            category: shelf,
            title: name,
            description: desc.value.trim(),
            positive,
            negative,
            overwrite,
          });
          if (result.conflicts?.length) {
            errorEl.textContent = `Already exists in ${shelf}: ${name}`;
            confirm.textContent = "Overwrite";
            confirm.classList.add("danger");
            confirm.classList.remove("primary");
            overwrite = true;
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            return;
          }
          group.loadedTitle = name;
          group.loadedCategory = shelf;
          group.loadedDescription = desc.value.trim();
          onSaved?.(name);
          close();
        } catch (err) {
          errorEl.textContent = err?.message || "Save failed";
        } finally {
          confirm.disabled = false;
        }
      }

      confirm.addEventListener("click", (e) => {
        e.stopPropagation();
        submit();
      });
      title.addEventListener("input", () => {
        title.classList.remove("invalid");
        if (errorEl.textContent) errorEl.textContent = "";
        resetOverwrite();
      });
      category.addEventListener("input", () => {
        category.classList.remove("invalid");
        if (errorEl.textContent) errorEl.textContent = "";
        resetOverwrite();
      });
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
      category.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });

      actions.appendChild(confirm);
      body.append(title, categoryRow, desc, errorEl, actions);
      requestAnimationFrame(() => title.focus());

      listCategories()
        .then((result) => {
          categories = shelfNames(result.categories);
          if (
            defaultCategory &&
            !categories.some((name) => name.toLowerCase() === defaultCategory.toLowerCase())
          ) {
            categories = [defaultCategory, ...categories];
          }
        })
        .catch(() => {
          categories = defaultCategory ? [defaultCategory] : [];
        });
    },
  });
}
