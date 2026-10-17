import {
  CHEVRON_ICON_SVG,
  CLOSE_ICON_SVG,
  COPY_ICON_SVG,
  EDIT_ICON_SVG,
  LOAD_ICON_SVG,
  PLUS_ICON_SVG,
  SAVE_ICON_SVG,
  TEXT_ICON_SVG,
  TRASH_ICON_SVG,
} from "./icons.js";
import { openConfirmPopup, openInputPopup, openPopup } from "./popup.js";
import { bindInfoTip, hidePromptTip } from "./preview_tip.js";
import { confirmReplacePair, openLoadPairPopup } from "./pair_load.js";
import { openSavePairPopup } from "./pair_save.js";
import { joinFields } from "./join.js";
import {
  deleteCategory,
  deleteLayout,
  deleteLayoutFolder,
  deletePreset,
  deleteTemplate,
  deleteTemplateFolder,
  listCategories,
  listLayoutFolders,
  listLayouts,
  listPresets,
  listTemplateFolders,
  listTemplates,
  renameCategory,
  renameLayoutFolder,
  renameTemplateFolder,
  saveLayout,
  savePreset,
  saveTemplate,
  updateLayout,
  updatePreset,
  updateTemplate,
  shelfNames,
} from "./api.js";
import {
  emptyShelfMatchesSearch,
  matchesLayoutPreset,
  matchesPromptPreset,
  matchesTemplatePreset,
} from "./search.js";
import { getUiPref, setUiPref, ensureUiPrefs } from "./prefs.js";
import { bindPromptAutocomplete } from "./autocomplete.js";
import { mountAutocompletePanel } from "./autocomplete_manager.js";
import { baseShelfName, nextDuplicateName } from "./titles.js";

function slotHasPrompt(slot) {
  return Boolean(String(slot?.positive || "").trim() || String(slot?.negative || "").trim());
}

const UNCATEGORISED = "Uncategorised";

function mgrConfirm(opts) {
  return openConfirmPopup({ nested: true, ...opts });
}

function mgrInput(opts) {
  return openInputPopup({ nested: true, ...opts });
}

function matchesQuery(text, query) {
  if (!query) return true;
  return (text || "").toLowerCase().includes(query);
}

function groupByFolder(items, folderKey) {
  const folders = new Map();
  for (const item of items) {
    const name = (item[folderKey] || "").trim() || UNCATEGORISED;
    const list = folders.get(name) || [];
    list.push(item);
    folders.set(name, list);
  }
  return folders;
}

function makeIconBtn(className, title, svg, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = title;
  btn.innerHTML = svg;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick?.(btn);
  });
  return btn;
}

function optionLabel(name, emptyUncategorised) {
  if (emptyUncategorised && !(name || "").trim()) return UNCATEGORISED;
  return name || UNCATEGORISED;
}

function optionMatches(name, value, emptyUncategorised) {
  const left = (name || "").trim();
  const right = (value || "").trim();
  if (emptyUncategorised) {
    if (!left && !right) return true;
    return left.toLowerCase() === right.toLowerCase();
  }
  return left.toLowerCase() === right.toLowerCase();
}

function openNamePicker({
  anchor,
  title,
  items,
  current,
  onPick,
  onClose,
  includeUncategorised = false,
  emptyUncategorised = false,
}) {
  return openPopup({
    nested: true,
    anchor,
    title,
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
      let options = [...items];

      if (includeUncategorised) {
        options = options.filter((name) => {
          const key = (name || "").trim().toLowerCase();
          return key && key !== UNCATEGORISED.toLowerCase();
        });
        options.unshift(emptyUncategorised ? "" : UNCATEGORISED);
      }

      if (selected && !options.some((name) => optionMatches(name, selected, emptyUncategorised))) {
        options.unshift(emptyUncategorised && !selected ? "" : selected);
      }

      function paint() {
        const q = filter.value.trim().toLowerCase();
        list.replaceChildren();
        const shown = options.filter((name) => matchesQuery(optionLabel(name, emptyUncategorised), q));
        if (!shown.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = "No matches";
          list.appendChild(empty);
          return;
        }
        for (const name of shown) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pc-pick-item";
          btn.textContent = optionLabel(name, emptyUncategorised);
          if (optionMatches(name, selected, emptyUncategorised)) btn.classList.add("selected");
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

function makeFolderSection({
  title,
  items,
  expanded,
  canManageFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleExpand,
  renderItem,
}) {
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

  const actions = document.createElement("div");
  actions.className = "pc-mgr-folder-actions";

  if (canManageFolder) {
    actions.append(
      makeIconBtn("pc-mgr-icon-btn", "Rename", EDIT_ICON_SVG, onRenameFolder),
      makeIconBtn("pc-mgr-icon-btn danger", "Delete", TRASH_ICON_SVG, onDeleteFolder),
    );
  }

  head.append(toggle, actions);

  const body = document.createElement("div");
  body.className = "pc-preset-folder-body";
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
  return folder;
}

/** Default collapsed; remember user toggles; search forces open. */
function folderExpanded(name, { query, openMap }) {
  if ((query || "").trim()) return true;
  if (openMap?.has(name)) return openMap.get(name);
  return false;
}

function makeItemRow(item, { name, meta, onEdit, onDuplicate, onDelete }) {
  const row = document.createElement("div");
  row.className = "pc-mgr-item";

  const info = document.createElement("div");
  info.className = "pc-mgr-item-info";

  const titleEl = document.createElement("div");
  titleEl.className = "pc-mgr-item-name";
  titleEl.textContent = name;

  info.appendChild(titleEl);
  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "pc-mgr-item-meta";
    metaEl.textContent = meta;
    info.appendChild(metaEl);
  }

  const actions = document.createElement("div");
  actions.className = "pc-mgr-item-actions";
  const buttons = [makeIconBtn("pc-mgr-icon-btn", "Edit", EDIT_ICON_SVG, onEdit)];
  if (onDuplicate) {
    buttons.push(makeIconBtn("pc-mgr-icon-btn", "Duplicate", COPY_ICON_SVG, onDuplicate));
  }
  buttons.push(makeIconBtn("pc-mgr-icon-btn danger", "Delete", TRASH_ICON_SVG, onDelete));
  actions.append(...buttons);

  row.append(info, actions);
  return row;
}

function showMgrError(anchor, title, message) {
  mgrConfirm({
    anchor,
    title,
    message: message || "Request failed",
    confirmLabel: "OK",
    showCancel: false,
    danger: false,
  });
}

function openEditLayoutPopup({ anchor, layout, folders, onSaved }) {
  return openPopup({
    nested: true,
    anchor,
    title: "Edit stack",
    width: 320,
    render(body, { close }) {
      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "preset name";
      title.value = layout.name || "";

      const folderRow = document.createElement("div");
      folderRow.className = "pc-save-folder-row";

      const folder = document.createElement("input");
      folder.className = "pc-popup-input";
      folder.type = "text";
      folder.placeholder = UNCATEGORISED;
      folder.value = layout.folder || "";

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      folderRow.append(folder, pickBtn);

      const slots = document.createElement("textarea");
      slots.className = "pc-popup-textarea";
      slots.placeholder = "slots, comma-separated";
      slots.rows = 3;
      slots.value = (layout.slots || [])
        .map((slot) => String(slot || "").trim())
        .filter(Boolean)
        .join(", ");

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 2;
      desc.value = layout.description || "";

      const errorEl = document.createElement("div");
      errorEl.className = "pc-popup-error";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "pc-popup-btn primary";
      confirm.textContent = "Save";

      let overwrite = false;
      let picker = null;

      pickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker) {
          picker.close();
          picker = null;
          return;
        }
        picker = openNamePicker({
          anchor: pickBtn,
          title: "Folder",
          items: folders,
          current: folder.value.trim(),
          includeUncategorised: true,
          emptyUncategorised: true,
          onPick: (name) => {
            folder.value = name || "";
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      function parseSlotsText(text) {
        return String(text || "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      }

      async function submit() {
        const nextName = title.value.trim();
        const nextSlots = parseSlotsText(slots.value);
        if (!nextName) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        if (!nextSlots.length) {
          errorEl.textContent = "Add at least one slot";
          slots.focus();
          return;
        }
        confirm.disabled = true;
        try {
          const result = await updateLayout({
            id: layout.id,
            name: nextName,
            description: desc.value.trim(),
            folder: folder.value.trim(),
            slots: nextSlots,
            overwrite,
          });
          if (result.conflicts?.length) {
            errorEl.textContent = `Already exists: ${nextName}`;
            confirm.textContent = "Overwrite";
            confirm.classList.remove("primary");
            confirm.classList.add("danger");
            overwrite = true;
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            return;
          }
          close();
          onSaved?.();
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
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });

      actions.appendChild(confirm);
      body.append(title, folderRow, slots, desc, errorEl, actions);
      requestAnimationFrame(() => title.focus());
    },
  });
}

function makePromptField(labelText, kind, value) {
  const wrap = document.createElement("div");
  wrap.className = "pc-mgr-prompt-field";

  const label = document.createElement("div");
  label.className = `pc-mgr-prompt-label ${kind}`;
  label.textContent = labelText;

  const area = document.createElement("textarea");
  area.className = "pc-popup-textarea pc-mgr-prompt-area";
  area.placeholder = labelText;
  area.rows = 4;
  area.value = value || "";
  bindPromptAutocomplete(area, kind);

  wrap.append(label, area);
  return { wrap, area };
}

function openEditPromptPopup({ preset, categories, onSaved }) {
  return openPopup({
    nested: true,
    centered: true,
    title: "Edit prompt",
    width: 440,
    render(body, { close }) {
      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "prompt name";
      title.value = preset.title || "";

      const categoryRow = document.createElement("div");
      categoryRow.className = "pc-save-folder-row";

      const category = document.createElement("input");
      category.className = "pc-popup-input";
      category.type = "text";
      category.placeholder = "collection";
      category.value = preset.category || "";

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      categoryRow.append(category, pickBtn);

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 3;
      desc.value = preset.description || "";

      const pos = makePromptField("positive", "positive", preset.positive);
      const neg = makePromptField("negative", "negative", preset.negative);

      const errorEl = document.createElement("div");
      errorEl.className = "pc-popup-error";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "pc-popup-btn primary";
      confirm.textContent = "Save";

      let overwrite = false;
      let picker = null;

      pickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker) {
          picker.close();
          picker = null;
          return;
        }
        picker = openNamePicker({
          anchor: pickBtn,
          title: "Collection",
          items: categories,
          current: category.value.trim(),
          onPick: (name) => {
            category.value = name || "";
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      async function submit() {
        const nextTitle = title.value.trim();
        const shelf = category.value.trim();
        if (!nextTitle) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        if (!shelf) {
          errorEl.textContent = "Collection is required";
          category.focus();
          return;
        }
        if (!pos.area.value.trim() && !neg.area.value.trim()) {
          errorEl.textContent = "Write a prompt first";
          pos.area.focus();
          return;
        }
        confirm.disabled = true;
        try {
          const result = await updatePreset({
            id: preset.id,
            title: nextTitle,
            description: desc.value.trim(),
            category: shelf,
            positive: pos.area.value,
            negative: neg.area.value,
            overwrite,
          });
          if (result.conflicts?.length) {
            errorEl.textContent = `Already exists in ${shelf}: ${nextTitle}`;
            confirm.textContent = "Overwrite";
            confirm.classList.remove("primary");
            confirm.classList.add("danger");
            overwrite = true;
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            return;
          }
          close();
          onSaved?.();
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
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });

      actions.appendChild(confirm);

      const fixed = document.createElement("div");
      fixed.className = "pc-popup-fixed";
      fixed.append(title, categoryRow, desc);

      const scroll = document.createElement("div");
      scroll.className = "pc-popup-scroll";
      scroll.append(pos.wrap, neg.wrap);

      const footer = document.createElement("div");
      footer.className = "pc-popup-footer";
      footer.append(errorEl, actions);

      body.append(fixed, scroll, footer);
      requestAnimationFrame(() => title.focus());
    },
  });
}

function openEditTemplatePopup({ anchor, template, folders, onSaved }) {
  return openPopup({
    nested: true,
    centered: true,
    anchor,
    title: "Edit template",
    width: 460,
    render(body, { close, reposition }) {
      const title = document.createElement("input");
      title.className = "pc-popup-input";
      title.type = "text";
      title.placeholder = "template name";
      title.value = template.name || "";

      const folderRow = document.createElement("div");
      folderRow.className = "pc-save-folder-row";

      const folder = document.createElement("input");
      folder.className = "pc-popup-input";
      folder.type = "text";
      folder.placeholder = UNCATEGORISED;
      folder.value = template.folder || "";

      const pickBtn = document.createElement("button");
      pickBtn.type = "button";
      pickBtn.className = "pc-popup-btn";
      pickBtn.textContent = "Choose";

      folderRow.append(folder, pickBtn);

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "notes (optional)";
      desc.rows = 2;
      desc.value = template.description || "";

      const addSlotBtn = document.createElement("button");
      addSlotBtn.type = "button";
      addSlotBtn.className = "pc-popup-btn";
      addSlotBtn.innerHTML = `${PLUS_ICON_SVG}<span>Add pair</span>`;

      const slotsWrap = document.createElement("div");
      slotsWrap.className = "pc-popup-scroll";
      slotsWrap.style.display = "flex";
      slotsWrap.style.flexDirection = "column";
      slotsWrap.style.gap = "8px";

      const slotState = (template.slots || []).map((slot) => ({
        title: (slot.title || "").trim(),
        positive: slot.positive || "",
        negative: slot.negative || "",
        enabled: slot.enabled !== false,
        loadedTitle: (slot.loadedTitle || "").trim(),
        loadedCategory: (slot.loadedCategory || "").trim(),
        loadedDescription: (slot.loadedDescription || "").trim(),
      }));

      function slotTitleError(name, exceptIndex) {
        const next = (name || "").trim();
        if (!next) return "Name is required";
        const key = next.toLowerCase();
        const taken = slotState.some(
          (slot, index) => index !== exceptIndex && (slot.title || "").trim().toLowerCase() === key,
        );
        if (taken) return "Name already used";
        return "";
      }

      function paintSlots() {
        slotsWrap.replaceChildren();
        if (!slotState.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = "No pairs yet — add one or load from the library";
          slotsWrap.appendChild(empty);
          reposition();
          return;
        }
        slotState.forEach((slot, index) => {
          const card = document.createElement("div");
          card.className = "pc-tpl-slot" + (slot.enabled ? "" : " is-off");

          const head = document.createElement("div");
          head.className = "pc-tpl-slot-head";

          const toggle = document.createElement("div");
          toggle.className = "pc-toggle" + (slot.enabled ? " on" : "");
          toggle.setAttribute("role", "switch");
          toggle.setAttribute("aria-checked", slot.enabled ? "true" : "false");
          toggle.title = slot.enabled ? "Included on load" : "Skipped on load";
          const knob = document.createElement("div");
          knob.className = "pc-toggle-knob";
          toggle.appendChild(knob);
          toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            slot.enabled = !slot.enabled;
            paintSlots();
          });

          const nameInput = document.createElement("input");
          nameInput.className = "pc-popup-input";
          nameInput.type = "text";
          nameInput.placeholder = "pair name";
          nameInput.value = slot.title;
          nameInput.addEventListener("input", () => {
            slot.title = nameInput.value;
          });

          const removeBtn = makeIconBtn("pc-mgr-icon-btn danger", "Remove pair", TRASH_ICON_SVG, () => {
            mgrConfirm({
              anchor: removeBtn,
              title: "Remove pair",
              message: `Remove “${(slot.title || "").trim() || "pair"}” from this template?`,
              confirmLabel: "Remove",
              danger: true,
              onConfirm: () => {
                slotState.splice(index, 1);
                paintSlots();
              },
            });
          });

          head.append(toggle, nameInput, removeBtn);

          const toolbar = document.createElement("div");
          toolbar.className = "pc-tpl-slot-toolbar";

          const savePairBtn = document.createElement("button");
          savePairBtn.type = "button";
          savePairBtn.className = "pc-popup-btn";
          savePairBtn.innerHTML = `${SAVE_ICON_SVG}<span>Save</span>`;
          savePairBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openSavePairPopup({
              nested: true,
              anchor: savePairBtn,
              group: slot,
              onSaved: (name) => {
                slot.loadedTitle = (name || "").trim();
                paintSlots();
              },
            });
          });

          const loadPairBtn = document.createElement("button");
          loadPairBtn.type = "button";
          loadPairBtn.className = "pc-popup-btn";
          loadPairBtn.innerHTML = `${LOAD_ICON_SVG}<span>Load</span>`;
          loadPairBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openLoadPairPopup({
              nested: true,
              anchor: loadPairBtn,
              category: baseShelfName(slot.title),
              onPick: (preset) => {
                const apply = () => {
                  slot.positive = preset.positive || "";
                  slot.negative = preset.negative || "";
                  slot.loadedTitle = (preset.title || "").trim();
                  slot.loadedCategory = (preset.category || "").trim();
                  slot.loadedDescription = (preset.description || "").trim();
                  paintSlots();
                };
                if (slotHasPrompt(slot)) {
                  confirmReplacePair({
                    nested: true,
                    anchor: loadPairBtn,
                    onConfirm: apply,
                  });
                  return;
                }
                apply();
              },
              onAppend: (preset) => {
                slot.positive = joinFields([slot.positive, preset.positive]);
                slot.negative = joinFields([slot.negative, preset.negative]);
                slot.loadedTitle = "";
                slot.loadedCategory = "";
                slot.loadedDescription = "";
                paintSlots();
              },
            });
          });

          const clearPairBtn = document.createElement("button");
          clearPairBtn.type = "button";
          clearPairBtn.className = "pc-popup-btn";
          clearPairBtn.innerHTML = `${CLOSE_ICON_SVG}<span>Clear</span>`;
          clearPairBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            hidePromptTip();
            const hasText = slotHasPrompt(slot) || Boolean((slot.loadedTitle || "").trim());
            if (!hasText) return;
            mgrConfirm({
              anchor: clearPairBtn,
              title: "Clear pair",
              message: "Clear positive / negative for this pair?",
              confirmLabel: "Clear",
              danger: true,
              onConfirm: () => {
                slot.positive = "";
                slot.negative = "";
                slot.loadedTitle = "";
                slot.loadedCategory = "";
                slot.loadedDescription = "";
                paintSlots();
              },
            });
          });

          toolbar.append(savePairBtn, loadPairBtn, clearPairBtn);

          const loadedRow = document.createElement("div");
          loadedRow.className = "pc-loaded-row";
          const loadedName = (slot.loadedTitle || "").trim();
          if (!loadedName) {
            loadedRow.hidden = true;
          } else {
            const loadedLabel = document.createElement("span");
            loadedLabel.className = "pc-loaded-label";
            loadedLabel.textContent = loadedName;
            loadedLabel.title = `Loaded: ${loadedName}`;

            const notesBtn = document.createElement("button");
            notesBtn.type = "button";
            notesBtn.className = "pc-loaded-notes";
            notesBtn.title = "View notes";
            notesBtn.innerHTML = TEXT_ICON_SVG;
            const notes = (slot.loadedDescription || "").trim();
            notesBtn.hidden = !notes;
            bindInfoTip(notesBtn, () => ({
              title: "Notes",
              text: notes,
            }));

            const clearBtn = document.createElement("button");
            clearBtn.type = "button";
            clearBtn.className = "pc-loaded-clear";
            clearBtn.title = "Detach loaded name";
            clearBtn.innerHTML = CLOSE_ICON_SVG;
            clearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              hidePromptTip();
              slot.loadedTitle = "";
              slot.loadedCategory = "";
              slot.loadedDescription = "";
              paintSlots();
            });

            loadedRow.append(loadedLabel, notesBtn, clearBtn);
          }

          const pos = makePromptField("positive", "positive", slot.positive);
          const neg = makePromptField("negative", "negative", slot.negative);
          pos.area.addEventListener("input", () => {
            slot.positive = pos.area.value;
          });
          neg.area.addEventListener("input", () => {
            slot.negative = neg.area.value;
          });

          card.append(head, toolbar, loadedRow, pos.wrap, neg.wrap);
          slotsWrap.appendChild(card);
        });
        reposition();
      }

      paintSlots();

      addSlotBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        mgrInput({
          anchor: addSlotBtn,
          title: "Add pair",
          placeholder: "pair name",
          confirmLabel: "Add",
          validate: (value) => slotTitleError(value, -1),
          onSubmit: (value) => {
            slotState.push({
              title: value.trim(),
              positive: "",
              negative: "",
              enabled: true,
              loadedTitle: "",
              loadedCategory: "",
              loadedDescription: "",
            });
            paintSlots();
            return "";
          },
        });
      });

      const errorEl = document.createElement("div");
      errorEl.className = "pc-popup-error";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "pc-popup-btn primary";
      confirm.textContent = "Save";

      let overwrite = false;
      let picker = null;

      pickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (picker) {
          picker.close();
          picker = null;
          return;
        }
        picker = openNamePicker({
          anchor: pickBtn,
          title: "Folder",
          items: folders,
          current: folder.value.trim(),
          includeUncategorised: true,
          emptyUncategorised: true,
          onPick: (name) => {
            folder.value = name || "";
          },
          onClose: () => {
            picker = null;
          },
        });
      });

      async function submit() {
        const nextName = title.value.trim();
        const nextSlots = slotState
          .map((slot) => ({
            title: (slot.title || "").trim(),
            positive: slot.positive || "",
            negative: slot.negative || "",
            enabled: slot.enabled !== false,
            loadedTitle: (slot.loadedTitle || "").trim(),
            loadedCategory: (slot.loadedCategory || "").trim(),
            loadedDescription: (slot.loadedDescription || "").trim(),
          }))
          .filter((slot) => slot.title && slotHasPrompt(slot));
        if (!nextName) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        if (!nextSlots.length) {
          errorEl.textContent = "Add at least one pair with text";
          return;
        }
        confirm.disabled = true;
        try {
          const result = await updateTemplate({
            id: template.id,
            name: nextName,
            description: desc.value.trim(),
            folder: folder.value.trim(),
            slots: nextSlots,
            overwrite,
          });
          if (result.conflicts?.length) {
            errorEl.textContent = `Already exists: ${nextName}`;
            confirm.textContent = "Overwrite";
            confirm.classList.remove("primary");
            confirm.classList.add("danger");
            overwrite = true;
            return;
          }
          if (!result.ok) {
            errorEl.textContent = result.error || "Save failed";
            return;
          }
          close();
          onSaved?.();
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
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });

      actions.appendChild(confirm);

      const fixed = document.createElement("div");
      fixed.className = "pc-popup-fixed";
      fixed.append(title, folderRow, desc, addSlotBtn);

      const footer = document.createElement("div");
      footer.className = "pc-popup-footer";
      footer.append(errorEl, actions);

      body.append(fixed, slotsWrap, footer);
      requestAnimationFrame(() => title.focus());
    },
  });
}

function paintTemplatesTab(listEl, { templates, folders, showEmpty, query, openMap, reload }) {
  listEl.replaceChildren();
  const q = (query || "").trim();

  const filtered = templates.filter((template) =>
    matchesTemplatePreset(template, query, { emptyFolder: UNCATEGORISED }),
  );

  const grouped = groupByFolder(filtered, "folder");
  if (showEmpty) {
    for (const folder of folders) {
      if ((folder.count || 0) === 0 && !grouped.has(folder.name)) {
        grouped.set(folder.name, []);
      }
    }
  }

  const names = [...grouped.keys()]
    .filter((name) => {
      const items = grouped.get(name) || [];
      if (items.length) return true;
      if (!showEmpty) return false;
      if (name.toLowerCase() === UNCATEGORISED.toLowerCase()) return false;
      return emptyShelfMatchesSearch(name, query);
    })
    .sort((a, b) => {
      const aEmpty = a.toLowerCase() === UNCATEGORISED.toLowerCase();
      const bEmpty = b.toLowerCase() === UNCATEGORISED.toLowerCase();
      if (aEmpty !== bEmpty) return aEmpty ? -1 : 1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

  if (!names.length) {
    const empty = document.createElement("div");
    empty.className = "pc-popup-message";
    empty.textContent = q ? "No templates" : "No saved templates yet.";
    listEl.appendChild(empty);
    return;
  }

  const folderNames = shelfNames(folders);

  for (const folderName of names) {
    const items = grouped.get(folderName) || [];
    listEl.appendChild(
      makeFolderSection({
        title: folderName,
        items,
        expanded: folderExpanded(folderName, { query: q, openMap }),
        canManageFolder: folderName.toLowerCase() !== UNCATEGORISED.toLowerCase(),
        onToggleExpand: (open) => openMap?.set(folderName, open),
        onRenameFolder: (btn) => {
          mgrInput({
            anchor: btn,
            title: "Rename folder",
            placeholder: "folder name",
            initialValue: folderName,
            confirmLabel: "Rename",
            validate: (value) => {
              if (!value.trim()) return "Name is required";
              return "";
            },
            onSubmit: async (value) => {
              const next = value.trim();
              const result = await renameTemplateFolder({ name: folderName, newName: next });
              if (!result.ok) {
                showMgrError(btn, "Rename folder", result.error);
                return;
              }
              if (openMap?.has(folderName)) {
                openMap.set(next, openMap.get(folderName));
                openMap.delete(folderName);
              }
              reload?.();
            },
          });
        },
        onDeleteFolder: (btn) => {
          mgrConfirm({
            anchor: btn,
            title: "Delete folder",
            message: `Delete folder “${folderName}”?\n${items.length} template(s) will move to ${UNCATEGORISED}.`,
            confirmLabel: "Delete",
            danger: true,
            onConfirm: async () => {
              const result = await deleteTemplateFolder(folderName);
              if (!result.ok) {
                showMgrError(btn, "Delete folder", result.error);
                return;
              }
              openMap?.delete(folderName);
              reload?.();
            },
          });
        },
        renderItem: (template) => {
          const slots = template.slots || [];
          const on = slots.filter((slot) => slot?.enabled !== false).length;
          const titles = slots
            .map((slot) => (slot?.title || "").trim())
            .filter(Boolean)
            .join(" · ");
          const meta = titles
            ? `${titles} · ${on}/${slots.length} on`
            : `${on}/${slots.length} slots on`;
          return makeItemRow(template, {
            name: template.name || "Untitled",
            meta,
            onEdit: (btn) =>
              openEditTemplatePopup({
                anchor: btn,
                template,
                folders: folderNames,
                onSaved: () => reload?.(),
              }),
            onDuplicate: (btn) => {
              const base = template.name || "Template";
              const existing = templates.map((item) => item.name || "");
              const nextName = nextDuplicateName(existing, base);
              mgrConfirm({
                anchor: btn,
                title: "Duplicate template",
                message: `Save a copy as “${nextName}”?`,
                confirmLabel: "Duplicate",
                onConfirm: async () => {
                  const result = await saveTemplate({
                    name: nextName,
                    description: template.description || "",
                    folder: template.folder || "",
                    slots: template.slots || [],
                  });
                  if (!result.ok) {
                    showMgrError(btn, "Duplicate", result.error);
                    return;
                  }
                  reload?.();
                },
              });
            },
            onDelete: (btn) => {
              mgrConfirm({
                anchor: btn,
                title: "Delete template",
                message: `Delete “${template.name}”?`,
                confirmLabel: "Delete",
                danger: true,
                onConfirm: async () => {
                  const result = await deleteTemplate(template.id);
                  if (!result.ok) {
                    showMgrError(btn, "Delete", result.error);
                    return;
                  }
                  reload?.();
                },
              });
            },
          });
        },
      }),
    );
  }
}

function paintStacksTab(listEl, { layouts, folders, showEmpty, query, openMap, reload }) {
  listEl.replaceChildren();
  const q = (query || "").trim();

  const filtered = layouts.filter((layout) =>
    matchesLayoutPreset(layout, query, { emptyFolder: UNCATEGORISED }),
  );

  const grouped = groupByFolder(filtered, "folder");
  if (showEmpty) {
    for (const folder of folders) {
      if ((folder.count || 0) === 0 && !grouped.has(folder.name)) {
        grouped.set(folder.name, []);
      }
    }
  }

  const names = [...grouped.keys()]
    .filter((name) => {
      const items = grouped.get(name) || [];
      if (items.length) return true;
      if (!showEmpty) return false;
      if (name.toLowerCase() === UNCATEGORISED.toLowerCase()) return false;
      return emptyShelfMatchesSearch(name, query);
    })
    .sort((a, b) => {
      const aUncat = a.toLowerCase() === UNCATEGORISED.toLowerCase();
      const bUncat = b.toLowerCase() === UNCATEGORISED.toLowerCase();
      if (aUncat !== bUncat) return aUncat ? -1 : 1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

  if (!names.length) {
    const empty = document.createElement("div");
    empty.className = "pc-popup-message";
    empty.textContent = q ? "No stacks" : "No saved stacks yet.";
    listEl.appendChild(empty);
    return;
  }

  const folderNames = shelfNames(folders);

  for (const folderName of names) {
    const items = grouped.get(folderName) || [];
    listEl.appendChild(
      makeFolderSection({
        title: folderName,
        items,
        expanded: folderExpanded(folderName, { query: q, openMap }),
        canManageFolder: folderName.toLowerCase() !== UNCATEGORISED.toLowerCase(),
        onToggleExpand: (open) => openMap?.set(folderName, open),
        onRenameFolder: (btn) => {
          mgrInput({
            anchor: btn,
            title: "Rename folder",
            placeholder: "folder name",
            initialValue: folderName,
            confirmLabel: "Rename",
            validate: (value) => {
              if (!value.trim()) return "Name is required";
              return "";
            },
            onSubmit: async (value) => {
              const next = value.trim();
              const result = await renameLayoutFolder({ name: folderName, newName: next });
              if (!result.ok) {
                mgrConfirm({
                  anchor: btn,
                  title: "Rename folder",
                  message: result.error || "Rename failed",
                  confirmLabel: "OK",
                  showCancel: false,
                  danger: false,
                });
                return;
              }
              if (openMap?.has(folderName)) {
                openMap.set(next, openMap.get(folderName));
                openMap.delete(folderName);
              }
              reload();
            },
          });
        },
        onDeleteFolder: (btn) => {
          mgrConfirm({
            anchor: btn,
            title: "Delete folder",
            message: `Delete folder “${folderName}”?\n${items.length} stack(s) will move to ${UNCATEGORISED}.`,
            confirmLabel: "Delete",
            danger: true,
            onConfirm: async () => {
              const result = await deleteLayoutFolder(folderName);
              if (!result.ok) {
                mgrConfirm({
                  anchor: btn,
                  title: "Delete folder",
                  message: result.error || "Delete failed",
                  confirmLabel: "OK",
                  showCancel: false,
                  danger: false,
                });
                return;
              }
              reload();
            },
          });
        },
        renderItem: (layout) => {
          const slotNames = (layout.slots || []).map((slot) => String(slot || "").trim()).filter(Boolean);
          return makeItemRow(layout, {
            name: layout.name || "Untitled",
            meta: slotNames.join(" · ") || "No fields",
            onEdit: (btn) => {
              openEditLayoutPopup({
                anchor: btn,
                layout,
                folders: folderNames,
                onSaved: reload,
              });
            },
            onDuplicate: async (btn) => {
              const name = nextDuplicateName(
                layouts.map((item) => item.name),
                layout.name || "Untitled",
              );
              const result = await saveLayout({
                name,
                description: layout.description || "",
                slots: layout.slots || [],
                folder: layout.folder || "",
              });
              if (!result.ok) {
                showMgrError(btn, "Duplicate stack", result.error);
                return;
              }
              reload();
            },
            onDelete: (btn) => {
              mgrConfirm({
                anchor: btn,
                title: "Delete stack",
                message: `Delete “${layout.name}”?`,
                confirmLabel: "Delete",
                danger: true,
                onConfirm: async () => {
                  const result = await deleteLayout(layout.id);
                  if (!result.ok) {
                    showMgrError(btn, "Delete stack", result.error);
                    return;
                  }
                  reload();
                },
              });
            },
          });
        },
      }),
    );
  }
}

function paintPromptsTab(listEl, { presets, categories, showEmpty, includeBody, query, openMap, reload }) {
  listEl.replaceChildren();
  const q = (query || "").trim();

  const filtered = presets.filter((preset) =>
    matchesPromptPreset(preset, query, { includeBody }),
  );

  const grouped = groupByFolder(filtered, "category");
  if (showEmpty) {
    for (const category of categories) {
      if ((category.count || 0) === 0 && !grouped.has(category.name)) {
        grouped.set(category.name, []);
      }
    }
  }

  const names = [...grouped.keys()]
    .filter((name) => {
      const items = grouped.get(name) || [];
      if (items.length) return true;
      if (!showEmpty) return false;
      return emptyShelfMatchesSearch(name, query);
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  if (!names.length) {
    const empty = document.createElement("div");
    empty.className = "pc-popup-message";
    empty.textContent = q ? "No prompts" : "No saved prompts yet.";
    listEl.appendChild(empty);
    return;
  }

  const categoryNames = shelfNames(categories);

  for (const categoryName of names) {
    const items = grouped.get(categoryName) || [];
    listEl.appendChild(
      makeFolderSection({
        title: categoryName,
        items,
        expanded: folderExpanded(categoryName, { query: q, openMap }),
        canManageFolder: true,
        onToggleExpand: (open) => openMap?.set(categoryName, open),
        onRenameFolder: (btn) => {
          mgrInput({
            anchor: btn,
            title: "Rename collection",
            placeholder: "collection name",
            initialValue: categoryName,
            confirmLabel: "Rename",
            validate: (value) => {
              if (!value.trim()) return "Name is required";
              return "";
            },
            onSubmit: async (value) => {
              const next = value.trim();
              const result = await renameCategory({ name: categoryName, newName: next });
              if (!result.ok) {
                mgrConfirm({
                  anchor: btn,
                  title: "Rename collection",
                  message: result.error || "Rename failed",
                  confirmLabel: "OK",
                  showCancel: false,
                  danger: false,
                });
                return;
              }
              if (openMap?.has(categoryName)) {
                openMap.set(next, openMap.get(categoryName));
                openMap.delete(categoryName);
              }
              reload();
            },
          });
        },
        onDeleteFolder: (btn) => {
          mgrConfirm({
            anchor: btn,
            title: "Delete collection",
            message: `Delete collection “${categoryName}” and ${items.length} prompt(s)?\nGroups on the node are not renamed.`,
            confirmLabel: "Delete",
            danger: true,
            onConfirm: async () => {
              const result = await deleteCategory(categoryName);
              if (!result.ok) {
                mgrConfirm({
                  anchor: btn,
                  title: "Delete collection",
                  message: result.error || "Delete failed",
                  confirmLabel: "OK",
                  showCancel: false,
                  danger: false,
                });
                return;
              }
              reload();
            },
          });
        },
        renderItem: (preset) =>
          makeItemRow(preset, {
            name: preset.title || "Untitled",
            meta: (preset.description || "").trim() || undefined,
            onEdit: () => {
              openEditPromptPopup({
                preset,
                categories: categoryNames,
                onSaved: reload,
              });
            },
            onDuplicate: async (btn) => {
              const siblings = (presets || []).filter(
                (item) =>
                  (item.category || "").trim().toLowerCase() ===
                  (preset.category || "").trim().toLowerCase(),
              );
              const name = nextDuplicateName(
                siblings.map((item) => item.title),
                preset.title || "Untitled",
              );
              const result = await savePreset({
                category: preset.category || categoryName,
                title: name,
                description: preset.description || "",
                positive: preset.positive || "",
                negative: preset.negative || "",
              });
              if (!result.ok) {
                showMgrError(btn, "Duplicate prompt", result.error);
                return;
              }
              reload();
            },
            onDelete: (btn) => {
              mgrConfirm({
                anchor: btn,
                title: "Delete prompt",
                message: `Delete “${preset.title}”?`,
                confirmLabel: "Delete",
                danger: true,
                onConfirm: async () => {
                  const result = await deletePreset(preset.id);
                  if (!result.ok) {
                    showMgrError(btn, "Delete prompt", result.error);
                    return;
                  }
                  reload();
                },
              });
            },
          }),
      }),
    );
  }
}

export async function openManagerPopup({ anchor }) {
  await ensureUiPrefs();
  const acEnabled = Boolean(getUiPref("promptAutocomplete"));
  return openPopup({
    anchor,
    title: "Library manager",
    width: acEnabled ? 420 : 400,
    onClose: hidePromptTip,
    render(body, { setTitle, reposition }) {
      const tabs = document.createElement("div");
      tabs.className = "pc-mgr-tabs";

      const stacksTab = document.createElement("button");
      stacksTab.type = "button";
      stacksTab.className = "pc-mgr-tab active";
      stacksTab.textContent = "Stacks";

      const promptsTab = document.createElement("button");
      promptsTab.type = "button";
      promptsTab.className = "pc-mgr-tab";
      promptsTab.textContent = "Prompts";

      const templatesTab = document.createElement("button");
      templatesTab.type = "button";
      templatesTab.className = "pc-mgr-tab";
      templatesTab.textContent = "Templates";

      tabs.append(stacksTab, promptsTab, templatesTab);

      let suggestTab = null;
      if (acEnabled) {
        suggestTab = document.createElement("button");
        suggestTab.type = "button";
        suggestTab.className = "pc-mgr-tab";
        suggestTab.textContent = "Suggest";
        suggestTab.title = "Autocomplete dictionary (experimental)";
        tabs.appendChild(suggestTab);
      }

      const search = document.createElement("input");
      search.className = "pc-popup-input";
      search.type = "text";
      search.placeholder = "search";

      const showEmptyPref = Boolean(getUiPref("showEmpty"));
      const searchInPromptsPref = Boolean(getUiPref("searchInPrompts"));

      const emptyRow = document.createElement("div");
      emptyRow.className = "pc-toggle-row";

      const emptyToggle = document.createElement("div");
      emptyToggle.className = "pc-toggle" + (showEmptyPref ? " on" : "");
      emptyToggle.setAttribute("role", "switch");
      emptyToggle.setAttribute("aria-checked", showEmptyPref ? "true" : "false");
      const emptyKnob = document.createElement("div");
      emptyKnob.className = "pc-toggle-knob";
      emptyToggle.appendChild(emptyKnob);

      const emptyLabel = document.createElement("span");
      emptyLabel.textContent = "Show empty";

      emptyRow.append(emptyToggle, emptyLabel);

      const bodyRow = document.createElement("div");
      bodyRow.className = "pc-toggle-row";
      bodyRow.style.display = "none";

      const bodyToggle = document.createElement("div");
      bodyToggle.className = "pc-toggle" + (searchInPromptsPref ? " on" : "");
      bodyToggle.setAttribute("role", "switch");
      bodyToggle.setAttribute("aria-checked", searchInPromptsPref ? "true" : "false");
      const bodyKnob = document.createElement("div");
      bodyKnob.className = "pc-toggle-knob";
      bodyToggle.appendChild(bodyKnob);

      const bodyLabel = document.createElement("span");
      bodyLabel.textContent = "Search in prompts";

      bodyRow.append(bodyToggle, bodyLabel);

      const status = document.createElement("div");
      status.className = "pc-popup-message";
      status.textContent = "Loading…";

      const list = document.createElement("div");
      list.className = "pc-preset-list pc-mgr-list";

      body.append(tabs, search, emptyRow, bodyRow, status, list);

      let mode = "stacks";
      let showEmpty = showEmptyPref;
      let includeBody = searchInPromptsPref;
      let layouts = [];
      let presets = [];
      let templates = [];
      let folders = [];
      let categories = [];
      let templateFolders = [];
      let acPanel = null;
      const stacksOpen = new Map();
      const promptsOpen = new Map();
      const templatesOpen = new Map();

      const titles = {
        stacks: "Library manager · Stacks",
        prompts: "Library manager · Prompts",
        templates: "Library manager · Templates",
        suggest: "Library manager · Suggest",
      };

      function setActiveTab(next) {
        mode = next;
        stacksTab.classList.toggle("active", mode === "stacks");
        promptsTab.classList.toggle("active", mode === "prompts");
        templatesTab.classList.toggle("active", mode === "templates");
        suggestTab?.classList.toggle("active", mode === "suggest");
        setTitle(titles[mode] || "Library manager");

        if (mode === "suggest") {
          // Same content slot as Stacks/Prompts — full replace, not a panel under them.
          search.style.display = "none";
          emptyRow.style.display = "none";
          bodyRow.style.display = "none";
          status.style.display = "none";
          list.classList.add("pc-mgr-list-suggest");
          list.replaceChildren();
          acPanel = mountAutocompletePanel(list, { reposition });
          reposition();
          return;
        }

        acPanel = null;
        list.classList.remove("pc-mgr-list-suggest");
        search.style.display = "";
        emptyRow.style.display = "";
        status.style.display = "none";
        search.placeholder =
          mode === "prompts" ? "name or shelf\\keyword" : "name or folder\\slot";
        bodyRow.style.display = mode === "prompts" ? "" : "none";
        paint();
      }

      function paint() {
        if (mode === "suggest") return;
        if (mode === "stacks") {
          paintStacksTab(list, {
            layouts,
            folders,
            showEmpty,
            query: search.value,
            openMap: stacksOpen,
            reload: loadStacks,
          });
        } else if (mode === "templates") {
          paintTemplatesTab(list, {
            templates,
            folders: templateFolders,
            showEmpty,
            query: search.value,
            openMap: templatesOpen,
            reload: loadTemplates,
          });
        } else {
          paintPromptsTab(list, {
            presets,
            categories,
            showEmpty,
            includeBody,
            query: search.value,
            openMap: promptsOpen,
            reload: loadPrompts,
          });
        }
        reposition();
      }

      async function loadStacks() {
        status.textContent = "Loading…";
        status.style.display = "";
        const [layoutResult, folderResult] = await Promise.all([listLayouts(), listLayoutFolders()]);
        if (!layoutResult.ok) {
          status.textContent = layoutResult.error || "Failed to load stacks";
          return;
        }
        layouts = layoutResult.layouts || [];
        folders = folderResult.folders || [];
        status.style.display = "none";
        paint();
      }

      async function loadPrompts() {
        status.textContent = "Loading…";
        status.style.display = "";
        const [presetResult, categoryResult] = await Promise.all([listPresets(), listCategories()]);
        if (!presetResult.ok) {
          status.textContent = presetResult.error || "Failed to load prompts";
          return;
        }
        presets = presetResult.presets || [];
        categories = categoryResult.categories || [];
        status.style.display = "none";
        paint();
      }

      async function loadTemplates() {
        status.textContent = "Loading…";
        status.style.display = "";
        const [templateResult, folderResult] = await Promise.all([
          listTemplates(),
          listTemplateFolders(),
        ]);
        if (!templateResult.ok) {
          status.textContent = templateResult.error || "Failed to load templates";
          return;
        }
        templates = templateResult.templates || [];
        templateFolders = folderResult.folders || [];
        status.style.display = "none";
        paint();
      }

      stacksTab.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mode === "stacks") return;
        setActiveTab("stacks");
        if (!layouts.length) loadStacks();
        else paint();
      });

      promptsTab.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mode === "prompts") return;
        setActiveTab("prompts");
        if (!presets.length) loadPrompts();
        else paint();
      });

      templatesTab.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mode === "templates") return;
        setActiveTab("templates");
        if (!templates.length) loadTemplates();
        else paint();
      });

      suggestTab?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mode === "suggest") return;
        setActiveTab("suggest");
      });

      search.addEventListener("input", paint);

      emptyToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showEmpty = !showEmpty;
        emptyToggle.classList.toggle("on", showEmpty);
        emptyToggle.setAttribute("aria-checked", showEmpty ? "true" : "false");
        setUiPref("showEmpty", showEmpty);
        paint();
      });

      bodyToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        includeBody = !includeBody;
        bodyToggle.classList.toggle("on", includeBody);
        bodyToggle.setAttribute("aria-checked", includeBody ? "true" : "false");
        setUiPref("searchInPrompts", includeBody);
        paint();
      });

      setTitle("Library manager · Stacks");
      loadStacks();
    },
  });
}
