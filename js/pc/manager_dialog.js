import { CHEVRON_ICON_SVG, EDIT_ICON_SVG, TRASH_ICON_SVG } from "./icons.js";
import { openConfirmPopup, openInputPopup, openPopup } from "./popup.js";
import { hidePromptTip } from "./preview_tip.js";
import {
  deleteCategory,
  deleteLayout,
  deleteLayoutFolder,
  deletePreset,
  listCategories,
  listLayoutFolders,
  listLayouts,
  listPresets,
  renameCategory,
  renameLayoutFolder,
  updateLayout,
  updatePreset,
  shelfNames,
} from "./api.js";
import { emptyShelfMatchesSearch, matchesLayoutPreset, matchesPromptPreset } from "./search.js";
import { getUiPref, setUiPref, ensureUiPrefs } from "./prefs.js";

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

function makeItemRow(item, { name, meta, onEdit, onDelete }) {
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
  actions.append(
    makeIconBtn("pc-mgr-icon-btn", "Edit", EDIT_ICON_SVG, onEdit),
    makeIconBtn("pc-mgr-icon-btn danger", "Delete", TRASH_ICON_SVG, onDelete),
  );

  row.append(info, actions);
  return row;
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

      const desc = document.createElement("textarea");
      desc.className = "pc-popup-textarea";
      desc.placeholder = "description (optional)";
      desc.rows = 3;
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

      async function submit() {
        const nextName = title.value.trim();
        if (!nextName) {
          errorEl.textContent = "Name is required";
          title.focus();
          return;
        }
        confirm.disabled = true;
        try {
          const result = await updateLayout({
            id: layout.id,
            name: nextName,
            description: desc.value.trim(),
            folder: folder.value.trim(),
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
      body.append(title, folderRow, desc, errorEl, actions);
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
      desc.placeholder = "description (optional)";
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
                    mgrConfirm({
                      anchor: btn,
                      title: "Delete stack",
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
                    mgrConfirm({
                      anchor: btn,
                      title: "Delete prompt",
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
          }),
      }),
    );
  }
}

export async function openManagerPopup({ anchor }) {
  await ensureUiPrefs();
  return openPopup({
    anchor,
    title: "Library manager",
    width: 360,
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

      tabs.append(stacksTab, promptsTab);

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
      let folders = [];
      let categories = [];
      const stacksOpen = new Map();
      const promptsOpen = new Map();

      function setActiveTab(next) {
        mode = next;
        stacksTab.classList.toggle("active", mode === "stacks");
        promptsTab.classList.toggle("active", mode === "prompts");
        setTitle(mode === "stacks" ? "Library manager · Stacks" : "Library manager · Prompts");
        search.placeholder =
          mode === "stacks" ? "name or folder\\slot" : "name or shelf\\keyword";
        bodyRow.style.display = mode === "prompts" ? "" : "none";
        paint();
      }

      function paint() {
        if (mode === "stacks") {
          paintStacksTab(list, {
            layouts,
            folders,
            showEmpty,
            query: search.value,
            openMap: stacksOpen,
            reload: loadStacks,
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
