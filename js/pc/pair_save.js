import { openConfirmPopup, openPopup } from "./popup.js";
import { listCategories, listPresets, savePreset } from "./api.js";
import { baseShelfName } from "./titles.js";
import { openExistingNamePicker } from "./save_name_picker.js";
import { mountPreviewEditor, presetPreviewUrl } from "./pair_preview.js";
import {
  normalizeShelfPath,
  openShelfPicker,
  splitShelfName,
  wrapShelfInput,
} from "./shelf_paths.js";

export function openSavePairPopup({ anchor, group, onSaved, nested = false }) {
  const defaultCategory = baseShelfName(group?.title);
  const positive = group?.positive || "";
  const negative = group?.negative || "";
  const loadedTitle = (group?.loadedTitle || "").trim();
  const loadedCategory = (group?.loadedCategory || "").trim();
  const loadedDescription = (group?.loadedDescription || "").trim();

  if (!defaultCategory) {
    openConfirmPopup({
      nested,
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
      nested,
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
    nested,
    anchor,
    title: "Save pair",
    width: 420,
    render(body, { close }) {
      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "prompt name";
      title.value = loadedTitle;

      const nameRow = document.createElement("div");
      nameRow.className = "pc-save-folder-row";

      const existingBtn = document.createElement("button");
      existingBtn.type = "button";
      existingBtn.className = "pc-popup-btn";
      existingBtn.textContent = "Existing";
      existingBtn.title = "Overwrite an existing pair";

      nameRow.append(title, existingBtn);

      const categoryRow = document.createElement("div");
      categoryRow.className = "pc-save-folder-row";

      const category = document.createElement("input");
      category.className = "pc-popup-input";
      category.type = "text";
      category.placeholder = "collection or path/sub";
      category.value = loadedCategory || defaultCategory;

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      categoryRow.append(wrapShelfInput(category, () => categories), pickBtn);

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
      let existingPicker = null;
      let existingPresetId = 0;

      const previewHost = document.createElement("div");
      let previewEditor = mountPreviewEditor(previewHost, {
        initialUrl:
          group?.loadedHasPreview && group?.loadedPresetId
            ? presetPreviewUrl(group.loadedPresetId, "1")
            : "",
      });

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
          title: "Existing pairs",
          currentGroup: category.value.trim() || defaultCategory,
          currentName: title.value.trim(),
          load: async () => {
            const result = await listPresets();
            if (!result.ok) throw new Error(result.error || "Failed to load prompts");
            return (result.presets || []).map((preset) => ({
              id: preset.id,
              name: preset.title || "",
              group: preset.category || "",
              description: preset.description || "",
              hasPreview: Boolean(preset.hasPreview),
            }));
          },
          onPick: (item) => {
            title.value = item.name;
            category.value = item.group;
            existingPresetId = Number(item.id || 0);
            if (!desc.value.trim()) desc.value = item.description || "";
            title.classList.remove("invalid");
            category.classList.remove("invalid");
            armOverwrite(`Will overwrite in ${item.group}: ${item.name}`);
            previewHost.replaceChildren();
            previewEditor = mountPreviewEditor(previewHost, {
              initialUrl: item.hasPreview && existingPresetId
                ? presetPreviewUrl(existingPresetId, String(Date.now()))
                : "",
            });
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
          categories,
          current: category.value.trim() || defaultCategory,
          allowCreate: true,
          onPick: (name) => {
            category.value = name || "";
            if (errorEl.textContent) errorEl.textContent = "";
            resetOverwrite();
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      async function submit() {
        const split = splitShelfName(category.value || defaultCategory, title.value);
        const name = split.name;
        const shelf = split.folder || defaultCategory;
        title.value = name;
        category.value = shelf;
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
            armOverwrite(`Already exists in ${shelf}: ${name}`);
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            return;
          }
          const presetId = Number(result.id || existingPresetId || 0);
          let hasPreview = Boolean(result.hasPreview);
          if (presetId && previewEditor.hasPending()) {
            const previewResult = await previewEditor.uploadAfterSave(presetId);
            if (!previewResult?.ok) {
              errorEl.textContent = previewResult?.error || "Preview save failed";
              return;
            }
            hasPreview = Boolean(previewResult.hasPreview);
          }
          group.loadedTitle = name;
          group.loadedCategory = shelf;
          group.loadedDescription = desc.value.trim();
          group.loadedPresetId = presetId || 0;
          group.loadedHasPreview = hasPreview;
          onSaved?.(name, { id: presetId, hasPreview });
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
      body.append(nameRow, categoryRow, desc, previewHost, errorEl, actions);
      requestAnimationFrame(() => title.focus());

      listCategories()
        .then((result) => {
          categories = (result.categories || []).filter((entry) => entry?.name);
          if (
            defaultCategory &&
            !categories.some((entry) => entry.name.toLowerCase() === defaultCategory.toLowerCase())
          ) {
            categories = [{ name: defaultCategory, count: 0 }, ...categories];
          }
        })
        .catch(() => {
          categories = defaultCategory ? [{ name: defaultCategory, count: 0 }] : [];
        });
    },
  });
}
