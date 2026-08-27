import { app } from "../../../scripts/app.js";
import { loadConfig } from "./pc/config.js";
import { injectStyles } from "./pc/styles.js";
import { PLUS_ICON_SVG, SAVE_ICON_SVG, LOAD_ICON_SVG } from "./pc/icons.js";
import { makeGroupCard } from "./pc/group_card.js";
import { openInputPopup } from "./pc/popup.js";
import { openSavePresetsPopup } from "./pc/save_dialog.js";
import { confirmReplaceGroups, openLoadPresetPopup } from "./pc/load_dialog.js";
import { openSavePairPopup } from "./pc/pair_save.js";
import { confirmReplacePair, openLoadPairPopup } from "./pc/pair_load.js";
import { openManagerPopup } from "./pc/manager_dialog.js";
import {
  createShadowString,
  hideOnCanvasKeepInPanel,
  isShadowFieldName,
  parseShadowFieldName,
} from "./pc/shadow_fields.js";
import { craftOutput, isJoinDebugEnabled } from "./pc/join.js";
import { baseShelfName, nextDuplicateTitle } from "./pc/titles.js";

const config = await loadConfig();
injectStyles(config.style_id);

const MIN_NODE_WIDTH = 400;
const SOCKET_ROWS_HEIGHT = 56;
const HEADER_HEIGHT = 112;
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

function parseGroups(raw) {
  try {
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
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

      let groups = parseGroups(dataWidget?.value);
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

      const libraryRow = document.createElement("div");
      libraryRow.className = "pc-header-row";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "pc-save-btn";
      saveBtn.innerHTML = `${SAVE_ICON_SVG}<span>Save preset</span>`;

      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.className = "pc-load-btn";
      loadBtn.innerHTML = `${LOAD_ICON_SVG}<span>Load preset</span>`;

      libraryRow.append(saveBtn, loadBtn);

      const managerBtn = document.createElement("button");
      managerBtn.type = "button";
      managerBtn.className = "pc-manage-btn";
      managerBtn.textContent = "Manage library";

      header.append(addBtn, libraryRow, managerBtn);

      const groupsWrap = document.createElement("div");
      groupsWrap.className = "pc-groups";
      root.append(header, groupsWrap);

      function persist() {
        if (!dataWidget) return;
        dataWidget.value = JSON.stringify(groups);
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
        const chromeHeight = HEADER_HEIGHT + GAP_BETWEEN_SECTIONS + CONTAINER_PADDING_V + BOTTOM_SLACK;
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
              });
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
        persist();
        addShadows(group);
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
      }

      function removeGroup(id) {
        collectFromShadows();
        groups = groups.filter((g) => g.id !== id);
        persist();
        removeShadows(id);
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
      }

      function applyLayout(layout) {
        const ids = groups.map((group) => group.id);
        groups = [];
        for (const id of ids) removeShadows(id);
        for (const slot of layout.slots || []) {
          const name = (slot || "").trim();
          if (!name) continue;
          groups.push({
            id: newGroupId(),
            title: name,
            positive: "",
            negative: "",
            enabled: true,
            ...stampLabels(name),
          });
        }
        persist();
        for (const group of groups) addShadows(group);
        renderCards();
        fillDom();
        hideDataWidget(dataWidget);
      }

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openInputPopup({
          anchor: addBtn,
          title: "Add group",
          placeholder: "pair name",
          confirmLabel: "Add",
          validate: (value) => groupTitleError(groups, value),
          onSubmit: (value) => addGroup(value),
        });
      });

      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openSavePresetsPopup({ anchor: saveBtn, groups });
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

      managerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openManagerPopup({ anchor: managerBtn });
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
        groups = parseGroups(w?.value);
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
              val.trim().startsWith("[") &&
              val.includes('"label_pos"')
            ) {
              const wrap = elm.closest?.("[data-testid='node-widget'], .lg-node-widget, label, .comfy-widget-row") || elm;
              wrap.style.display = "none";
            }
          });
          parent = parent.parentElement;
        }
      }

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
