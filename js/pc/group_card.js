import { CHEVRON_ICON_SVG, CLOSE_ICON_SVG, COPY_ICON_SVG, GRIP_ICON_SVG, LOAD_ICON_SVG, SAVE_ICON_SVG, TRASH_ICON_SVG } from "./icons.js";
import { openConfirmPopup } from "./popup.js";

function isEnabled(group) {
  return group.enabled !== false;
}

function makeField(group, key, labelText, { onChange, onPrompt }) {
  const wrap = document.createElement("div");
  wrap.className = "pc-field";

  const label = document.createElement("div");
  label.className = `pc-field-label pc-field-label-${key}`;
  label.textContent = labelText;

  const area = document.createElement("textarea");
  area.className = "pc-textarea";
  area.placeholder = labelText;
  area.value = group[key] || "";
  area.addEventListener("pointerdown", (e) => e.stopPropagation());
  area.addEventListener("input", () => {
    group[key] = area.value;
    onPrompt?.(key, area.value);
    onChange?.();
  });

  wrap.append(label, area);
  return { wrap, area };
}

export function makeGroupCard(group, { index = 0, onChange, onRemove, onPrompt, onRename, onReorder, onDrop, onSavePair, onLoadPair, onDuplicate }) {
  const card = document.createElement("div");
  card.className = "pc-group";
  card.dataset.groupId = group.id;
  card.addEventListener("pointerdown", (e) => e.stopPropagation());

  function applyEnabled() {
    const on = isEnabled(group);
    card.classList.toggle("is-off", !on);
    toggle.className = "pc-toggle" + (on ? " on" : "");
    toggle.title = on ? "Disable pair" : "Enable pair";
  }

  const head = document.createElement("div");
  head.className = "pc-group-head";

  const dragHandle = document.createElement("div");
  dragHandle.className = "pc-drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.innerHTML = GRIP_ICON_SVG;
  dragHandle.draggable = true;
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", group.id);
    card.classList.add("dragging");
  });
  dragHandle.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    card.parentElement?.querySelectorAll(".pc-group").forEach((el) => {
      el.classList.remove("drop-above", "drop-below");
    });
  });

  const priority = document.createElement("input");
  priority.className = "pc-priority";
  priority.type = "number";
  priority.min = "1";
  priority.step = "1";
  priority.title = "Priority";
  priority.value = String(index + 1);
  priority.addEventListener("pointerdown", (e) => e.stopPropagation());

  function commitPriority() {
    const parsed = parseInt(priority.value, 10);
    if (Number.isNaN(parsed)) {
      priority.value = String(index + 1);
      return;
    }
    onReorder?.(group.id, parsed - 1);
  }

  priority.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      priority.blur();
    }
    if (e.key === "Escape") {
      priority.value = String(index + 1);
      priority.blur();
    }
  });
  priority.addEventListener("blur", commitPriority);

  const toggle = document.createElement("div");
  toggle.setAttribute("role", "switch");
  const knob = document.createElement("div");
  knob.className = "pc-toggle-knob";
  toggle.appendChild(knob);
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    group.enabled = !isEnabled(group);
    applyEnabled();
    onChange?.();
  });

  const title = document.createElement("input");
  title.className = "pc-title-input";
  title.type = "text";
  title.placeholder = "title";
  title.value = group.title || "";
  title.addEventListener("pointerdown", (e) => e.stopPropagation());

  function commitTitle() {
    const next = title.value.trim();
    if (next === (group.title || "").trim()) {
      title.value = group.title || "";
      title.classList.remove("invalid");
      return;
    }
    const error = onRename?.(next);
    if (error) {
      title.value = group.title || "";
      title.title = error;
      title.classList.add("invalid");
      setTimeout(() => title.classList.remove("invalid"), 900);
      return;
    }
    title.classList.remove("invalid");
    title.removeAttribute("title");
    group.title = next;
    title.value = next;
    onChange?.();
  }

  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      title.blur();
    }
    if (e.key === "Escape") {
      title.value = group.title || "";
      title.classList.remove("invalid");
      title.blur();
    }
  });
  title.addEventListener("blur", commitTitle);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "pc-copy-btn";
  copyBtn.title = "Duplicate pair";
  copyBtn.innerHTML = COPY_ICON_SVG;
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDuplicate?.();
  });

  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "pc-collapse-btn";
  collapseBtn.innerHTML = CHEVRON_ICON_SVG;

  function applyCollapsed() {
    const collapsed = !!group.collapsed;
    card.classList.toggle("collapsed", collapsed);
    collapseBtn.title = collapsed ? "Expand group" : "Collapse group";
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    group.collapsed = !group.collapsed;
    applyCollapsed();
    onChange?.();
  });

  head.append(dragHandle, priority, toggle, title, copyBtn, collapseBtn);

  const body = document.createElement("div");
  body.className = "pc-group-body";

  const toolbar = document.createElement("div");
  toolbar.className = "pc-group-toolbar";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "pc-remove-btn";
  removeBtn.title = "Remove group";
  removeBtn.innerHTML = TRASH_ICON_SVG;
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const name = (group.title || "").trim() || "this group";
    openConfirmPopup({
      anchor: removeBtn,
      title: "Remove group",
      message: `Delete “${name}”? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      onConfirm: () => onRemove?.(),
    });
  });

  const savePairBtn = document.createElement("button");
  savePairBtn.type = "button";
  savePairBtn.className = "pc-pair-save-btn";
  savePairBtn.title = "Save pair";
  savePairBtn.innerHTML = `${SAVE_ICON_SVG}<span>Save</span>`;
  savePairBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onSavePair?.(savePairBtn);
  });

  const loadPairBtn = document.createElement("button");
  loadPairBtn.type = "button";
  loadPairBtn.className = "pc-pair-load-btn";
  loadPairBtn.title = "Load pair";
  loadPairBtn.innerHTML = `${LOAD_ICON_SVG}<span>Load</span>`;
  loadPairBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onLoadPair?.(loadPairBtn);
  });

  const spacer = document.createElement("div");
  spacer.className = "pc-group-toolbar-spacer";

  toolbar.append(savePairBtn, loadPairBtn, spacer, removeBtn);

  const loadedRow = document.createElement("div");
  loadedRow.className = "pc-loaded-row";

  const loadedLabel = document.createElement("span");
  loadedLabel.className = "pc-loaded-label";

  const clearLoadedBtn = document.createElement("button");
  clearLoadedBtn.type = "button";
  clearLoadedBtn.className = "pc-loaded-clear";
  clearLoadedBtn.title = "Detach loaded name";
  clearLoadedBtn.innerHTML = CLOSE_ICON_SVG;
  clearLoadedBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    group.loadedTitle = "";
    group.loadedCategory = "";
    group.loadedDescription = "";
    paintLoaded();
    onChange?.();
  });

  loadedRow.append(loadedLabel, clearLoadedBtn);

  function paintLoaded() {
    const name = (group.loadedTitle || "").trim();
    if (!name) {
      loadedRow.hidden = true;
      loadedLabel.textContent = "";
      return;
    }
    loadedRow.hidden = false;
    loadedLabel.textContent = name;
    loadedLabel.title = `Loaded: ${name}`;
  }

  const pos = makeField(group, "positive", "positive", { onChange, onPrompt });
  const neg = makeField(group, "negative", "negative", { onChange, onPrompt });

  body.append(toolbar, loadedRow, pos.wrap, neg.wrap);
  card.append(head, body);
  paintLoaded();
  applyCollapsed();
  applyEnabled();

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    card.classList.toggle("drop-above", above);
    card.classList.toggle("drop-below", !above);
  });
  card.addEventListener("dragleave", () => {
    card.classList.remove("drop-above", "drop-below");
  });
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drop-above", "drop-below");
    const fromId = e.dataTransfer.getData("text/plain");
    if (!fromId || fromId === group.id) return;
    const rect = card.getBoundingClientRect();
    const after = e.clientY >= rect.top + rect.height / 2;
    onDrop?.(fromId, group.id, after);
  });

  return {
    el: card,
    setField(key, value) {
      const area = key === "positive" ? pos.area : neg.area;
      if (!area || area.value === value) return;
      area.value = value ?? "";
    },
    setLoadedTitle(value, category = "") {
      group.loadedTitle = (value || "").trim();
      if (arguments.length > 1) group.loadedCategory = (category || "").trim();
      paintLoaded();
    },
  };
}
