import { openConfirmPopup, openPopup } from "./popup.js";
import { listLayoutFolders, saveLayout, shelfNames } from "./api.js";

const UNCATEGORISED = "Uncategorised";

function matchesFolder(name, query) {
  if (!query) return true;
  const label = name || UNCATEGORISED;
  return label.toLowerCase().includes(query);
}

function openFolderPicker({ anchor, folders, current, onPick, onClose }) {
  return openPopup({
    nested: true,
    anchor,
    title: "Category",
    width: 260,
    onClose,
    render(body, { close }) {
      const filter = document.createElement("input");
      filter.className = "pc-popup-input";
      filter.type = "text";
      filter.placeholder = "filter";

      const list = document.createElement("div");
      list.className = "pc-pick-list";

      const items = ["", ...folders];
      const selected = (current || "").trim();

      function paint() {
        const q = filter.value.trim().toLowerCase();
        const shown = items.filter((name) => matchesFolder(name, q));

        list.replaceChildren();
        if (!shown.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = "No categories";
          list.appendChild(empty);
          return;
        }
        for (const name of shown) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pc-pick-item";
          btn.textContent = name || UNCATEGORISED;
          if ((name || "") === selected) btn.classList.add("selected");
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

export function openSavePresetsPopup({ anchor, groups }) {
  const slots = (groups || [])
    .map((group) => (group.title || "").trim())
    .filter(Boolean);

  if (!slots.length) {
    openConfirmPopup({
      anchor,
      title: "Save preset",
      message: "Add a group first.",
      confirmLabel: "OK",
      showCancel: false,
      danger: false,
    });
    return;
  }

  return openPopup({
    anchor,
    title: "Save preset",
    width: 320,
    render(body, { close }) {
      const hint = document.createElement("div");
      hint.className = "pc-save-slots";
      hint.textContent = slots.join(" · ");

      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "preset name";

      const folderRow = document.createElement("div");
      folderRow.className = "pc-save-folder-row";

      const folder = document.createElement("input");
      folder.className = "pc-popup-input";
      folder.type = "text";
      folder.placeholder = "Uncategorised";

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      folderRow.append(folder, pickBtn);

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 3;

      const errorEl = document.createElement("div");
      errorEl.className = "pc-popup-error";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "pc-popup-btn primary";
      confirm.textContent = "Save";

      let overwrite = false;
      let folders = [];
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
        picker = openFolderPicker({
          anchor: pickBtn,
          folders,
          current: folder.value.trim(),
          onPick: (name) => {
            folder.value = name || "";
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      async function submit() {
        const name = title.value.trim();
        title.classList.toggle("invalid", !name);
        if (!name) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        confirm.disabled = true;
        try {
          const result = await saveLayout({
            name,
            description: desc.value.trim(),
            slots,
            folder: folder.value.trim(),
            overwrite,
          });
          if (result.conflicts?.length) {
            errorEl.textContent = `Already exists: ${name}`;
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
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
      folder.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });

      actions.appendChild(confirm);
      body.append(hint, title, folderRow, desc, errorEl, actions);
      requestAnimationFrame(() => title.focus());

      listLayoutFolders()
        .then((result) => {
          folders = shelfNames(result.folders);
        })
        .catch(() => {});
    },
  });
}
