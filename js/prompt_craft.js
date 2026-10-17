import { app } from "../../../scripts/app.js";
import { loadConfig } from "./pc/config.js";
import { injectStyles } from "./pc/styles.js";
import {
  CLOSE_ICON_SVG,
  LOAD_ICON_SVG,
  PLUS_ICON_SVG,
  RESET_ICON_SVG,
  SAVE_ICON_SVG,
  TEXT_ICON_SVG,
} from "./pc/icons.js";
import { makeGroupCard } from "./pc/group_card.js";
import { openConfirmPopup } from "./pc/popup.js";
import { openAddGroupPopup } from "./pc/add_group.js";
import { openSavePresetsPopup } from "./pc/save_dialog.js";
import { confirmReplaceGroups, openLoadPresetPopup } from "./pc/load_dialog.js";
import { openSaveTemplatePopup } from "./pc/template_save.js";
import { confirmReloadTemplate, openLoadTemplatePopup } from "./pc/template_load.js";
import { mergeTemplateGroups } from "./pc/template_apply.js";
import { openSavePairPopup } from "./pc/pair_save.js";
import { confirmReplacePair, openLoadPairPopup } from "./pc/pair_load.js";
import { openManagerPopup } from "./pc/manager_dialog.js";
import { openSettingsPopup } from "./pc/settings_dialog.js";
import { listLayouts, listPresets, listTemplates } from "./pc/api.js";
import {
  createShadowString,
  hideOnCanvasKeepInPanel,
  isShadowFieldName,
  parseShadowFieldName,
} from "./pc/shadow_fields.js";
import { craftOutput, isJoinDebugEnabled, joinFields } from "./pc/join.js";
import { baseShelfName, nextDuplicateTitle } from "./pc/titles.js";
import { attachPromptMaterializeHooks } from "./pc/metadata.js";
import { ensureUiPrefs } from "./pc/prefs.js";
import { bindInfoTip, hidePromptTip } from "./pc/preview_tip.js";

const config = await loadConfig();
injectStyles(config.style_id);
ensureUiPrefs();

const MIN_NODE_WIDTH = 400;
const SOCKET_ROWS_HEIGHT = 56;
const HEADER_HEIGHT = 156;
const LOADED_CHIP_ROW_HEIGHT = 26;
const CONTAINER_PADDING_V = 10;
const GAP_BETWEEN_SECTIONS = 8;
const GROUP_HEIGHT = 266;
const GROUP_GAP = 8;
const EMPTY_HINT_HEIGHT = 28;
const BOTTOM_SLACK = 12;
const MIN_UI_HEIGHT = HEADER_HEIGHT + EMPTY_HINT_HEIGHT + 24;
const LEFT_PULL = 10;
const KEPT_WIDGETS = new Set(["blocks_data", "prompt_craft_ui"]);

function newGroupId() {
  return `pc_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function normalizeLoadedRef(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = (raw.title || "").trim();
  if (!title) return null;
  return {
    title,
    folder: (raw.folder || "").trim(),
    description: (raw.description || "").trim(),
  };
}

function parseBlocksState(raw) {
  try {
    const data = raw ? JSON.parse(raw) : [];
    if (Array.isArray(data)) {
      return { groups: data, loadedStack: null, loadedTemplate: null };
    }
    if (data && typeof data === "object") {
      return {
        groups: Array.isArray(data.groups) ? data.groups : [],
        loadedStack: normalizeLoadedRef(data.loadedStack),
        loadedTemplate: normalizeLoadedRef(data.loadedTemplate),
      };
    }
  } catch {
    /* ignore */
  }
  return { groups: [], loadedStack: null, loadedTemplate: null };
}

function stampLabels(title) {
  const name = (title || "").trim() || "Group";
  return {
    label_pos: `${name} | positive`,
    label_neg: `${name} | negative`,
  };
}

function groupTitleError(groups, title, exceptId) {
  const name = (title || "").trim();
  if (!name) return "Name is required";
  const key = name.toLowerCase();
  const taken = groups.some(
    (group) => group.id !== exceptId && (group.title || "").trim().toLowerCase() === key,
  );
  if (taken) return "Name already used";
  return "";
}

function hideDataWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  widget.mouse = () => false;
  widget.options = { ...(widget.options || {}), hidden: true };
  widget.type = "";
  const el = widget.element || widget.inputEl || widget.textEl || widget.domElement;
  if (el?.style) el.style.display = "none";
}

app.registerExtension({
  name: config.extension_name,

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== config.node_class) return;

    const required = nodeData.input?.required;
    if (required?.blocks_data) {
      nodeData.input.hidden ??= {};
      nodeData.input.hidden.blocks_data = required.blocks_data;
      delete required.blocks_data;
    }

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
      const node = this;

      if (node.size?.[0]) {
        const defaultHeight =
          SOCKET_ROWS_HEIGHT + HEADER_HEIGHT + GAP_BETWEEN_SECTIONS + CONTAINER_PADDING_V + BOTTOM_SLACK + GROUP_HEIGHT;
        node.setSize([Math.max(node.size[0], MIN_NODE_WIDTH), Math.max(node.size[1] || 0, defaultHeight)]);
      }

      let dataWidget = node.widgets?.find((w) => w.name === "blocks_data");
      if (!dataWidget) {
        dataWidget = node.addWidget("text", "blocks_data", "[]", () => {}, {});
      }
      hideDataWidget(dataWidget);
      dataWidget.type = "";
      attachPromptMaterializeHooks(node, dataWidget);

      const initialState = parseBlocksState(dataWidget?.value);
      let groups = initialState.groups;
      let loadedStack = initialState.loadedStack;
      let loadedTemplate = initialState.loadedTemplate;
      const cards = new Map();
      let uiWidget = null;

      const root = document.createElement("div");
      root.className = "pc-root";
      root.addEventListener("pointerdown", (e) => e.stopPropagation());
      root.addEventListener("wheel", (e) => e.stopPropagation());

      const header = document.createElement("div");
      header.className = "pc-header";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "pc-add-btn";
      addBtn.innerHTML = `${PLUS_ICON_SVG}<span>Add group</span>`;

      function makeLibrarySection(kind, titleText) {
        const section = document.createElement("div");
        section.className = `pc-lib-section pc-lib-section-${kind}`;

        const toolbar = document.createElement("div");
        toolbar.className = "pc-lib-section-toolbar";

        const label = document.createElement("div");
        label.className = "pc-lib-section-label";
        label.textContent = titleText;

        const buttons = document.createElement("div");
        buttons.className = "pc-lib-section-buttons";

        toolbar.append(label, buttons);
        section.append(toolbar);
        return { section, buttons };
      }

      const presetBlock = makeLibrarySection("preset", "Preset");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "pc-save-btn";
      saveBtn.innerHTML = `${SAVE_ICON_SVG}<span>Save</span>`;

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "pc-load-btn";
      loadBtn.innerHTML = `${LOAD_ICON_SVG}<span>Load</span>`;

      presetBlock.buttons.append(saveBtn, loadBtn);

      const loadedStackRow = document.createElement("div");
      loadedStackRow.className = "pc-loaded-row";
      loadedStackRow.hidden = true;

      const loadedStackLabel = document.createElement("span");
      loadedStackLabel.className = "pc-loaded-label pc-loaded-preset";

      const loadedStackNotesBtn = document.createElement("button");
      loadedStackNotesBtn.type = "button";
      loadedStackNotesBtn.className = "pc-loaded-notes";
      loadedStackNotesBtn.title = "View notes";
      loadedStackNotesBtn.innerHTML = TEXT_ICON_SVG;
      loadedStackNotesBtn.hidden = true;
      bindInfoTip(loadedStackNotesBtn, () => ({
        title: "Notes",
        text: (loadedStack?.description || "").trim(),
      }));

      const loadedStackResetBtn = document.createElement("button");
      loadedStackResetBtn.type = "button";
      loadedStackResetBtn.className = "pc-loaded-reset";
      loadedStackResetBtn.title = "Reload last saved preset";
      loadedStackResetBtn.innerHTML = RESET_ICON_SVG;

      const loadedStackClearBtn = document.createElement("button");
      loadedStackClearBtn.type = "button";
      loadedStackClearBtn.className = "pc-loaded-clear";
      loadedStackClearBtn.title = "Detach loaded preset";
      loadedStackClearBtn.innerHTML = CLOSE_ICON_SVG;

      loadedStackRow.append(
        loadedStackLabel,
        loadedStackNotesBtn,
        loadedStackResetBtn,
        loadedStackClearBtn,
      );
      presetBlock.section.appendChild(loadedStackRow);

      const templateBlock = makeLibrarySection("template", "Template");
      const saveTemplateBtn = document.createElement("button");
      saveTemplateBtn.type = "button";
      saveTemplateBtn.className = "pc-template-save-btn";
      saveTemplateBtn.innerHTML = `${SAVE_ICON_SVG}<span>Save</span>`;

      const loadTemplateBtn = document.createElement("button");
      loadTemplateBtn.type = "button";
      loadTemplateBtn.className = "pc-template-load-btn";
      loadTemplateBtn.innerHTML = `${LOAD_ICON_SVG}<span>Load</span>`;

      templateBlock.buttons.append(saveTemplateBtn, loadTemplateBtn);

      const loadedTemplateRow = document.createElement("div");
      loadedTemplateRow.className = "pc-loaded-row";
      loadedTemplateRow.hidden = true;

      const loadedTemplateLabel = document.createElement("span");
      loadedTemplateLabel.className = "pc-loaded-label pc-loaded-template";

      const loadedTemplateNotesBtn = document.createElement("button");
      loadedTemplateNotesBtn.type = "button";
      loadedTemplateNotesBtn.className = "pc-loaded-notes";
      loadedTemplateNotesBtn.title = "View notes";
      loadedTemplateNotesBtn.innerHTML = TEXT_ICON_SVG;
      loadedTemplateNotesBtn.hidden = true;
      bindInfoTip(loadedTemplateNotesBtn, () => ({
        title: "Notes",
        text: (loadedTemplate?.description || "").trim(),
      }));

      const loadedTemplateResetBtn = document.createElement("button");
      loadedTemplateResetBtn.type = "button";
      loadedTemplateResetBtn.className = "pc-loaded-reset";
      loadedTemplateResetBtn.title = "Reload last saved template";
      loadedTemplateResetBtn.innerHTML = RESET_ICON_SVG;

      const loadedTemplateClearBtn = document.createElement("button");
      loadedTemplateClearBtn.type = "button";
      loadedTemplateClearBtn.className = "pc-loaded-clear";
      loadedTemplateClearBtn.title = "Detach loaded template";
      loadedTemplateClearBtn.innerHTML = CLOSE_ICON_SVG;

      loadedTemplateRow.append(
        loadedTemplateLabel,
        loadedTemplateNotesBtn,
        loadedTemplateResetBtn,
        loadedTemplateClearBtn,
      );
      templateBlock.section.appendChild(loadedTemplateRow);

      const managerBtn = document.createElement("button");
      managerBtn.type = "button";
      managerBtn.className = "pc-manage-btn";
      managerBtn.textContent = "Manage library";

      const settingsBtn = document.createElement("button");
      settingsBtn.type = "button";
      settingsBtn.className = "pc-settings-btn";
      settingsBtn.textContent = "Settings";

      const toolsRow = document.createElement("div");
      toolsRow.className = "pc-header-row";
      toolsRow.append(managerBtn, settingsBtn);

      header.append(addBtn, presetBlock.section, templateBlock.section, toolsRow);

      const groupsWrap = document.createElement("div");
      groupsWrap.className = "pc-groups";
      root.append(header, groupsWrap);

      function paintLoadedStack() {
        const name = (loadedStack?.title || "").trim();
        const folder = (loadedStack?.folder || "").trim();
        const notes = (loadedStack?.description || "").trim();
        if (!name) {
          loadedStackRow.hidden = true;
          loadedStackLabel.textContent = "";
          loadedStackNotesBtn.hidden = true;
          return;
        }
        loadedStackRow.hidden = false;
        loadedStackLabel.textContent = folder ? `${name} · ${folder}` : name;
        loadedStackLabel.title = folder ? `Loaded preset: ${name} (${folder})` : `Loaded preset: ${name}`;
        loadedStackNotesBtn.hidden = !notes;
      }

      function paintLoadedTemplate() {
        const name = (loadedTemplate?.title || "").trim();
        const folder = (loadedTemplate?.folder || "").trim();
        const notes = (loadedTemplate?.description || "").trim();
        if (!name) {
          loadedTemplateRow.hidden = true;
          loadedTemplateLabel.textContent = "";
          loadedTemplateNotesBtn.hidden = true;
          return;
        }
        loadedTemplateRow.hidden = false;
        loadedTemplateLabel.textContent = folder ? `${name} · ${folder}` : name;
        loadedTemplateLabel.title = folder
          ? `Loaded template: ${name} (${folder})`
          : `Loaded template: ${name}`;
        loadedTemplateNotesBtn.hidden = !notes;
      }

      function setLoadedStack(next) {
        loadedStack = normalizeLoadedRef(next);
        paintLoadedStack();
      }

      function setLoadedTemplate(next) {
        loadedTemplate = normalizeLoadedRef(next);
        paintLoadedTemplate();
      }

      function clearLoadedStack() {
        if (!loadedStack) return;
        loadedStack = null;
        paintLoadedStack();
      }

      function clearLoadedTemplate() {
        if (!loadedTemplate) return;
        loadedTemplate = null;
        paintLoadedTemplate();
      }

      function persist() {
        if (!dataWidget) return;
        const payload =
          loadedStack || loadedTemplate
            ? {
                groups,
                ...(loadedStack ? { loadedStack } : {}),
                ...(loadedTemplate ? { loadedTemplate } : {}),
              }
            : groups;
        dataWidget.value = JSON.stringify(payload);
        node.setDirtyCanvas(true, true);
        scheduleJoinDebugLog();
      }

      let joinDebugTimer = null;
      function scheduleJoinDebugLog() {
        if (!isJoinDebugEnabled(config)) return;
        clearTimeout(joinDebugTimer);
        joinDebugTimer = setTimeout(() => {
          const { str_pos, str_neg } = craftOutput(groups);
          console.log(`${config.log_prefix} join preview`, {
            str_pos,
            str_neg,
            groups: groups.length,
          });
        }, 300);
      }

      function collectFromShadows() {
        for (const widget of node.widgets || []) {
          const parsed = parseShadowFieldName(widget.name);
          if (!parsed) continue;
          const group = groups.find((g) => g.id === parsed.id);
          if (group) group[parsed.key] = widget.value ?? "";
        }
      }

      function findShadow(name) {
        return node.widgets?.find((w) => w.name === name);
      }

      function bindShadow(widget, group, key) {
        const prev = widget.callback;
        widget.callback = function () {
          prev?.apply(this, arguments);
          const value = widget.value ?? "";
          group[key] = value;
          cards.get(group.id)?.setField(key, value);
          persist();
        };
      }

      function addShadows(group) {
        const labels = {
          pos: group.label_pos || stampLabels(group.title).label_pos,
          neg: group.label_neg || stampLabels(group.title).label_neg,
        };
        const pos = createShadowString(node, `${group.id}_positive`, group.positive, labels.pos);
        const neg = createShadowString(node, `${group.id}_negative`, group.negative, labels.neg);
        bindShadow(pos, group, "positive");
        bindShadow(neg, group, "negative");
        hideOnCanvasKeepInPanel(pos);
        hideOnCanvasKeepInPanel(neg);
      }

      function removeShadows(id) {
        const drop = new Set([`${id}_positive`, `${id}_negative`]);
        const widgets = node.widgets || [];
        for (let i = widgets.length - 1; i >= 0; i--) {
          if (!drop.has(widgets[i].name)) continue;
          widgets[i].onRemove?.();
          widgets.splice(i, 1);
        }
        if (node.inputs) {
          for (let i = node.inputs.length - 1; i >= 0; i--) {
            if (drop.has(node.inputs[i]?.name)) node.removeInput(i);
          }
        }
      }

      function writeShadow(group, key, value) {
        const widget = findShadow(`${group.id}_${key}`);
        if (!widget || widget.value === value) return;
        widget.value = value;
      }

      function syncWidth() {
        const nodeWidth = node.size?.[0] || MIN_NODE_WIDTH;
        root.style.width = `${nodeWidth}px`;
        root.style.maxWidth = `${nodeWidth}px`;
        root.style.marginLeft = `${-LEFT_PULL}px`;
        root.style.marginBottom = "0";
      }

      function isVueNodes() {
        return Boolean(root.closest?.("[data-testid='node-widget']"));
      }

      function hideDuplicateCanvasFields() {
        let host = root.parentElement;
        for (let i = 0; i < 8 && host; i++) {
          const widgets = host.querySelectorAll?.("[data-testid='node-widget'], .lg-node-widget");
          if (widgets?.length) {
            widgets.forEach((el) => {
              if (el.contains(root)) return;
              const label = (el.textContent || "").replace(/\s+/g, " ");
              if (/\| positive|\| negative/.test(label)) {
                el.style.setProperty("display", "none", "important");
                el.style.setProperty("height", "0", "important");
                el.style.setProperty("min-height", "0", "important");
                el.style.setProperty("overflow", "hidden", "important");
                el.style.setProperty("margin", "0", "important");
                el.style.setProperty("padding", "0", "important");
              }
            });
            return;
          }
          host = host.parentElement;
        }
      }

      function fillDom() {
        syncWidth();
        const headerExtra =
          (loadedStack?.title ? LOADED_CHIP_ROW_HEIGHT : 0) +
          (loadedTemplate?.title ? LOADED_CHIP_ROW_HEIGHT : 0);
        const chromeHeight =
          HEADER_HEIGHT + headerExtra + GAP_BETWEEN_SECTIONS + CONTAINER_PADDING_V + BOTTOM_SLACK;
        const bodyH = Math.max((node.size?.[1] || 0) - SOCKET_ROWS_HEIGHT, MIN_UI_HEIGHT);
        const overlay = uiWidget?.element;

        if (isVueNodes()) {
          root.style.height = "100%";
          root.style.maxHeight = "100%";
          root.style.minHeight = "0";
          groupsWrap.style.maxHeight = "";
        } else {
          if (overlay) {
            overlay.style.boxSizing = "border-box";
            overlay.style.height = `${bodyH}px`;
            overlay.style.maxHeight = `${bodyH}px`;
            overlay.style.overflow = "hidden";
          }
          root.style.height = `${bodyH}px`;
          root.style.maxHeight = `${bodyH}px`;
          root.style.minHeight = `${bodyH}px`;
          groupsWrap.style.maxHeight = `${Math.max(bodyH - chromeHeight, 80)}px`;
        }
        groupsWrap.style.overflowY = "auto";
        hideDuplicateCanvasFields();
      }

      function moveGroup(fromIndex, toIndex) {
        const last = groups.length - 1;
        if (fromIndex < 0 || last < 0) return;
        const next = Math.max(0, Math.min(last, toIndex));
        if (fromIndex === next) {
          renderCards();
          return;
        }
        const [moved] = groups.splice(fromIndex, 1);
        groups.splice(next, 0, moved);
        persist();
        renderCards();
        fillDom();
      }

      function reorderGroup(fromId, toIndex) {
        moveGroup(
          groups.findIndex((group) => group.id === fromId),
          toIndex,
        );
      }

      function dropGroup(fromId, toId, after) {
        const from = groups.findIndex((group) => group.id === fromId);
        let to = groups.findIndex((group) => group.id === toId);
        if (from < 0 || to < 0) return;
        if (after) to += 1;
        if (from < to) to -= 1;
        moveGroup(from, to);
      }

      function renderCards() {
        groupsWrap.replaceChildren();
        cards.clear();
        if (groups.length === 0) {
          const empty = document.createElement("div");
          empty.className = "pc-empty";
          empty.textContent = "No groups yet";
          groupsWrap.appendChild(empty);
          return;
        }
        groups.forEach((group, index) => {
          const card = makeGroupCard(group, {
            index,
            onChange: persist,
            onRemove: () => removeGroup(group.id),
            onPrompt: (key, value) => writeShadow(group, key, value),
            onRename: (name) => groupTitleError(groups, name, group.id),
            onReorder: reorderGroup,
            onDrop: dropGroup,
            onSavePair: (anchor) =>
              openSavePairPopup({
                anchor,
                group,
                onSaved: (name) => {
                  card.setLoadedTitle(name, group.loadedCategory);
                  persist();
                },
              }),
            onLoadPair: (anchor) => {
              openLoadPairPopup({
                anchor,
                category: baseShelfName(group.title),
                onPick: (preset) => {
                  const apply = () => {
                    group.positive = preset.positive || "";
                    group.negative = preset.negative || "";
                    group.loadedTitle = (preset.title || "").trim();
                    group.loadedCategory = (preset.category || "").trim();
                    group.loadedDescription = (preset.description || "").trim();
                    card.setField("positive", group.positive);
                    card.setField("negative", group.negative);
                    card.setLoadedTitle(group.loadedTitle, group.loadedCategory);
                    writeShadow(group, "positive", group.positive);
                    writeShadow(group, "negative", group.negative);
                    persist();
                  };
                  if ((group.positive || "").trim() || (group.negative || "").trim()) {
                    confirmReplacePair({ anchor, onConfirm: apply });
                    return;
                  }
                  apply();
                },
                onAppend: (preset) => {
                  group.positive = joinFields([group.positive, preset.positive]);
                  group.negative = joinFields([group.negative, preset.negative]);
                  // Cell is a mix — clear Loaded chip so Save isn't tied to one pair.
                  group.loadedTitle = "";
                  group.loadedCategory = "";
                  group.loadedDescription = "";
                  card.setField("positive", group.positive);
                  card.setField("negative", group.negative);
                  card.setLoadedTitle("");
                  writeShadow(group, "positive", group.positive);
                  writeShadow(group, "negative", group.negative);
                  persist();
                },
              });
            },
            onReloadLoaded: async (anchor) => {
              const title = (group.loadedTitle || "").trim();
              const category = (group.loadedCategory || "").trim();
              if (!title) return;
              const result = await listPresets({ category });
              if (!result.ok) {
                openConfirmPopup({
                  anchor,
                  title: "Reload pair",
                  message: result.error || "Failed to load prompts",
                  confirmLabel: "OK",
                  showCancel: false,
                  danger: false,
                });
                return;
              }
              const key = title.toLowerCase();
              const preset = (result.presets || []).find(
                (item) => (item.title || "").trim().toLowerCase() === key,
              );
              if (!preset) {
                openConfirmPopup({
                  anchor,
                  title: "Reload pair",
                  message: "Saved pair not found. It may have been renamed or deleted.",
                  confirmLabel: "OK",
                  showCancel: false,
                  danger: false,
                });
                return;
              }
              group.positive = preset.positive || "";
              group.negative = preset.negative || "";
              group.loadedTitle = (preset.title || "").trim();
              group.loadedCategory = (preset.category || "").trim();
              group.loadedDescription = (preset.description || "").trim();
              card.setField("positive", group.positive);
              card.setField("negative", group.negative);
              card.setLoadedTitle(group.loadedTitle, group.loadedCategory);
              writeShadow(group, "positive", group.positive);
              writeShadow(group, "negative", group.negative);
              persist();
            },
            onDuplicate: () => duplicateGroup(group),
          });
          cards.set(group.id, card);
          groupsWrap.appendChild(card.el);
        });
      }

      function rebuildShadows() {
        collectFromShadows();
        const widgets = node.widgets || [];
        for (let i = widgets.length - 1; i >= 0; i--) {
          if (KEPT_WIDGETS.has(widgets[i].name) || !isShadowFieldName(widgets[i].name)) continue;
          widgets[i].onRemove?.();
          widgets.splice(i, 1);
        }
        for (const group of groups) addShadows(group);
        hideDataWidget(dataWidget);
      }

      function addGroup(title) {
        const error = groupTitleError(groups, title);
        if (error) return error;
        const name = title.trim();
        const group = {
          id: newGroupId(),
          title: name,
          positive: "",
          negative: "",
          enabled: true,
          ...stampLabels(name),
        };
        groups.push(group);
        // Stack structure drifted; template chip can stay (merge is by name).
        clearLoadedStack();
        persist();
        addShadows(group);
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
        return "";
      }

      function duplicateGroup(source) {
        collectFromShadows();
        const name = nextDuplicateTitle(groups, source.title);
        const group = {
          id: newGroupId(),
          title: name,
          positive: source.positive || "",
          negative: source.negative || "",
          loadedTitle: (source.loadedTitle || "").trim(),
          loadedCategory: (source.loadedCategory || "").trim(),
          loadedDescription: (source.loadedDescription || "").trim(),
          enabled: source.enabled !== false,
          collapsed: false,
          ...stampLabels(name),
        };
        const index = groups.findIndex((item) => item.id === source.id);
        if (index < 0) groups.push(group);
        else groups.splice(index + 1, 0, group);
        clearLoadedStack();
        persist();
        addShadows(group);
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
      }

      function removeGroup(id) {
        collectFromShadows();
        groups = groups.filter((g) => g.id !== id);
        clearLoadedStack();
        persist();
        removeShadows(id);
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
      }

      function rebuildFromGroups(nextGroups) {
        const ids = groups.map((group) => group.id);
        groups = nextGroups;
        for (const id of ids) removeShadows(id);
        for (const group of groups) addShadows(group);
        persist();
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
      }

      function applyTemplate(template) {
        collectFromShadows();
        const next = mergeTemplateGroups(groups, template.slots || [], {
          newGroupId,
          stampLabels,
        });
        setLoadedTemplate({
          title: template.name,
          folder: template.folder,
          description: template.description,
        });
        rebuildFromGroups(next);
      }

      function applyLayout(layout) {
        const next = [];
        for (const slot of layout.slots || []) {
          const name = (slot || "").trim();
          if (!name) continue;
          next.push({
            id: newGroupId(),
            title: name,
            positive: "",
            negative: "",
            enabled: true,
            ...stampLabels(name),
          });
        }
        setLoadedStack({
          title: layout.name,
          folder: layout.folder,
          description: layout.description,
        });
        clearLoadedTemplate();
        rebuildFromGroups(next);
      }

      async function reloadLoadedStack(anchor) {
        const title = (loadedStack?.title || "").trim();
        const folder = (loadedStack?.folder || "").trim();
        if (!title) return;
        const result = await listLayouts();
        if (!result.ok) {
          openConfirmPopup({
            anchor,
            title: "Reload preset",
            message: result.error || "Failed to load presets",
            confirmLabel: "OK",
            showCancel: false,
            danger: false,
          });
          return;
        }
        const key = title.toLowerCase();
        const folderKey = folder.toLowerCase();
        const layout = (result.layouts || []).find((item) => {
          if ((item.name || "").trim().toLowerCase() !== key) return false;
          return (item.folder || "").trim().toLowerCase() === folderKey;
        });
        if (!layout) {
          openConfirmPopup({
            anchor,
            title: "Reload preset",
            message: "Saved preset not found. It may have been renamed or deleted.",
            confirmLabel: "OK",
            showCancel: false,
            danger: false,
          });
          return;
        }
        applyLayout(layout);
      }

      async function reloadLoadedTemplate(anchor) {
        const title = (loadedTemplate?.title || "").trim();
        const folder = (loadedTemplate?.folder || "").trim();
        if (!title) return;
        const result = await listTemplates();
        if (!result.ok) {
          openConfirmPopup({
            anchor,
            title: "Reload template",
            message: result.error || "Failed to load templates",
            confirmLabel: "OK",
            showCancel: false,
            danger: false,
          });
          return;
        }
        const key = title.toLowerCase();
        const folderKey = folder.toLowerCase();
        const template = (result.templates || []).find((item) => {
          if ((item.name || "").trim().toLowerCase() !== key) return false;
          return (item.folder || "").trim().toLowerCase() === folderKey;
        });
        if (!template) {
          openConfirmPopup({
            anchor,
            title: "Reload template",
            message: "Saved template not found. It may have been renamed or deleted.",
            confirmLabel: "OK",
            showCancel: false,
            danger: false,
          });
          return;
        }
        applyTemplate(template);
      }

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAddGroupPopup({
          anchor: addBtn,
          existingTitles: groups.map((g) => g.title),
          validate: (value) => groupTitleError(groups, value),
          onSubmit: (value) => addGroup(value),
        });
      });

      loadedStackClearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePromptTip();
        clearLoadedStack();
        persist();
        fillDom();
      });

      loadedStackResetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePromptTip();
        openConfirmPopup({
          anchor: loadedStackResetBtn,
          title: "Reload preset",
          message: "Replace current groups with the saved preset? All prompts in this node will be cleared.",
          confirmLabel: "Reload",
          cancelLabel: "Cancel",
          danger: true,
          onConfirm: () => reloadLoadedStack(loadedStackResetBtn),
        });
      });

      loadedTemplateClearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePromptTip();
        clearLoadedTemplate();
        persist();
        fillDom();
      });

      loadedTemplateResetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePromptTip();
        confirmReloadTemplate({
          anchor: loadedTemplateResetBtn,
          onConfirm: () => reloadLoadedTemplate(loadedTemplateResetBtn),
        });
      });

      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSavePresetsPopup({
          anchor: saveBtn,
          groups,
          loadedStack,
          onSaved: (saved) => {
            setLoadedStack(saved);
            persist();
            fillDom();
          },
        });
      });

      loadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLoadPresetPopup({
          anchor: loadBtn,
          onPick: (layout) => {
            if (groups.length) {
              confirmReplaceGroups({
                anchor: loadBtn,
                onConfirm: () => applyLayout(layout),
              });
              return;
            }
            applyLayout(layout);
          },
        });
      });

      saveTemplateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSaveTemplatePopup({
          anchor: saveTemplateBtn,
          groups,
          loadedTemplate,
          onSaved: (saved) => {
            setLoadedTemplate(saved);
            persist();
            fillDom();
          },
        });
      });

      loadTemplateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLoadTemplatePopup({
          anchor: loadTemplateBtn,
          onPick: (template) => applyTemplate(template),
        });
      });

      managerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openManagerPopup({ anchor: managerBtn });
      });

      settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSettingsPopup({ anchor: settingsBtn });
      });

      const onResize = node.onResize;
      node.onResize = function () {
        const result = onResize ? onResize.apply(this, arguments) : undefined;
        hideDataWidget(dataWidget);
        for (const w of node.widgets || []) {
          if (isShadowFieldName(w.name)) hideOnCanvasKeepInPanel(w);
        }
        fillDom();
        return result;
      };

      const onConfigure = node.onConfigure;
      node.onConfigure = function () {
        const result = onConfigure ? onConfigure.apply(this, arguments) : undefined;
        const w = node.widgets?.find((x) => x.name === "blocks_data");
        hideDataWidget(w);
        const state = parseBlocksState(w?.value);
        groups = state.groups;
        loadedStack = state.loadedStack;
        loadedTemplate = state.loadedTemplate;
        paintLoadedStack();
        paintLoadedTemplate();
        rebuildShadows();
        renderCards();
        fillDom();
        return result;
      };

      uiWidget = node.addDOMWidget("prompt_craft_ui", "div", root, {
        serialize: false,
        hideOnZoom: false,
      });
      if (uiWidget) {
        uiWidget.serialize = false;
        uiWidget.options = {
          ...(uiWidget.options || {}),
          serialize: false,
          hideInPanel: true,
          getMinHeight: () => MIN_UI_HEIGHT,
          afterResize: () => fillDom(),
        };
        uiWidget.computeSize = (width) => [width || MIN_NODE_WIDTH, MIN_UI_HEIGHT];
        uiWidget.computeLayoutSize = () => ({
          minHeight: MIN_UI_HEIGHT,
          minWidth: 0,
        });
      }

      function scanAndHideBlocksData() {
        hideDataWidget(dataWidget);
        const el = dataWidget?.element || dataWidget?.inputEl || dataWidget?.textEl || dataWidget?.domElement;
        if (el?.style) el.style.display = "none";
        let parent = root.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
          parent.querySelectorAll?.("input, textarea").forEach((elm) => {
            if (root.contains(elm)) return;
            const val = elm.value;
            if (
              typeof val === "string" &&
              val.includes('"label_pos"') &&
              (val.trim().startsWith("[") || val.trim().startsWith("{"))
            ) {
              const wrap = elm.closest?.("[data-testid='node-widget'], .lg-node-widget, label, .comfy-widget-row") || elm;
              wrap.style.display = "none";
            }
          });
          parent = parent.parentElement;
        }
      }

      paintLoadedStack();
      paintLoadedTemplate();
      renderCards();
      if (groups.length) rebuildShadows();
      fillDom();
      setTimeout(() => {
        scanAndHideBlocksData();
        fillDom();
      }, 0);
      [50, 150, 400, 1000].forEach((delay) =>
        setTimeout(() => {
          scanAndHideBlocksData();
          hideDuplicateCanvasFields();
        }, delay),
      );

      return r;
    };
  },
});
