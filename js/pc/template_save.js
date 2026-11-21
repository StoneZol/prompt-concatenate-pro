import { openConfirmPopup, openPopup } from "./popup.js";
import { listTemplateFolders, listTemplates, saveTemplate } from "./api.js";
import { serializeTemplateSlots } from "./template_apply.js";
import { openExistingNamePicker } from "./save_name_picker.js";
import { openShelfPicker, splitShelfName, wrapShelfInput } from "./shelf_paths.js";

const UNCATEGORISED = "Uncategorised";

export function openSaveTemplatePopup({ anchor, groups, loadedTemplate, onSaved }) {
  const slots = serializeTemplateSlots(groups);

  if (!slots.length) {
    openConfirmPopup({
      anchor,
      title: "Save template",
      message: "Write at least one pair with text first. Empty pairs are not saved.",
      confirmLabel: "OK",
      showCancel: false,
      danger: false,
    });
    return;
  }

  return openPopup({
    anchor,
    title: "Save template",
    width: 320,
    render(body, { close }) {
      const hint = document.createElement("div");
      hint.className = "pc-save-slots";
      hint.textContent = slots.map((slot) => slot.title).join(" · ");

      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "template name or path/name";
      title.value = (loadedTemplate?.title || "").trim();

      const nameRow = document.createElement("div");
      nameRow.className = "pc-save-folder-row";

      const existingBtn = document.createElement("button");
      existingBtn.type = "button";
      existingBtn.className = "pc-popup-btn";
      existingBtn.textContent = "Existing";
      existingBtn.title = "Overwrite an existing template";

      nameRow.append(title, existingBtn);

      const folderRow = document.createElement("div");
      folderRow.className = "pc-save-folder-row";

      const folder = document.createElement("input");
      folder.className = "pc-popup-input";
      folder.type = "text";
      folder.placeholder = "Uncategorised or path/sub";
      folder.value = (loadedTemplate?.folder || "").trim();

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      folderRow.append(wrapShelfInput(folder, () => folders), pickBtn);

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 3;
      desc.value = (loadedTemplate?.description || "").trim();

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
      let existingPicker = null;

      function resetOverwrite() {
        if (!overwrite) return;
        overwrite = false;
        confirm.textContent = "Save";
        confirm.classList.remove("danger");
        confirm.classList.add("primary");
      }

      function armOverwrite(message) {
        overwrite = true;
        errorEl.textContent = message;
        confirm.textContent = "Overwrite";
        confirm.classList.add("danger");
        confirm.classList.remove("primary");
      }

      existingBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (existingPicker) {
          existingPicker.close();
          existingPicker = null;
          return;
        }
        existingPicker = openExistingNamePicker({
          anchor: existingBtn,
          title: "Existing templates",
          currentGroup: folder.value.trim(),
          currentName: title.value.trim(),
          load: async () => {
            const result = await listTemplates();
            if (!result.ok) throw new Error(result.error || "Failed to load templates");
            return (result.templates || []).map((template) => ({
              name: template.name || "",
              group: template.folder || "",
              description: template.description || "",
            }));
          },
          onPick: (item) => {
            title.value = item.name;
            folder.value = item.group;
            if (!desc.value.trim()) desc.value = item.description || "";
            title.classList.remove("invalid");
            armOverwrite(`Will overwrite in ${item.group || UNCATEGORISED}: ${item.name}`);
          },
          onClose: () => {
            existingPicker = null;
          },
        });
      });

      pickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker) {
          picker.close();
          picker = null;
          return;
        }
        picker = openShelfPicker({
          anchor: pickBtn,
          title: "Folder",
          categories: folders,
          current: folder.value.trim(),
          allowEmpty: true,
          emptyLabel: UNCATEGORISED,
          onPick: (name) => {
            folder.value = name || "";
            resetOverwrite();
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      async function submit() {
        const split = splitShelfName(folder.value, title.value);
        const name = split.name;
        title.value = name;
        folder.value = split.folder;
        title.classList.toggle("invalid", !name);
        if (!name) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        confirm.disabled = true;
        try {
          const result = await saveTemplate({
            name,
            description: desc.value.trim(),
            slots,
            folder: split.folder,
            overwrite,
          });
          if (result.conflicts?.length) {
            const hit = result.conflicts[0];
            armOverwrite(`Already exists in ${hit.folder || split.folder || UNCATEGORISED}: ${hit.name || name}`);
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            return;
          }
          onSaved?.({
            title: result.name || name,
            folder: result.folder || split.folder,
            description: desc.value.trim(),
          });
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
      folder.addEventListener("input", () => {
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
      body.append(hint, nameRow, folderRow, desc, errorEl, actions);
      requestAnimationFrame(() => title.focus());

      listTemplateFolders()
        .then((result) => {
          folders = (result.folders || []).filter((entry) => entry?.name);
        })
        .catch(() => {});
    },
  });
}
