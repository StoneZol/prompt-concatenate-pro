const CSS = `
.pc-root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  padding: 4px 2px 6px;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.pc-header {
  flex: 0 0 auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pc-header-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pc-title-input,
.pc-textarea {
  box-sizing: border-box;
  width: 100%;
  color: var(--input-text, #ddd);
  background: var(--comfy-input-bg, #222);
  border: 1px solid var(--border-color, #444);
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
}

.pc-title-input {
  height: 28px;
  padding: 0 8px;
  outline: none;
}

.pc-title-input:focus,
.pc-textarea:focus {
  border-color: var(--descrip-text, #888);
}

.pc-title-input.invalid {
  border-color: #c0392b;
}

.pc-add-btn,
.pc-save-btn,
.pc-load-btn,
.pc-manage-btn {
  flex: 1 1 0;
  flex-shrink: 0;
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  white-space: nowrap;
  box-sizing: border-box;
  line-height: 1;
}

.pc-add-btn {
  height: 34px;
  min-height: 34px;
  border: 1px solid #6d5aa8;
  background: #2f2b3d;
  color: #e8e4f5;
}

.pc-save-btn,
.pc-load-btn {
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
}

.pc-manage-btn {
  width: 100%;
  height: 26px;
  min-height: 26px;
  padding: 0 14px;
  border: 1px solid #5a5080;
  background: #2f2b3d;
  color: #e0dce8;
  font-size: 13px;
  letter-spacing: 0.01em;
}

.pc-add-btn:hover,
.pc-save-btn:hover,
.pc-load-btn:hover,
.pc-manage-btn:hover {
  filter: brightness(1.15);
}

.pc-add-btn svg,
.pc-save-btn svg,
.pc-load-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pc-groups::-webkit-scrollbar {
  width: 8px;
}

.pc-groups::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.pc-empty {
  color: var(--descrip-text, #888);
  font-size: 11px;
  padding: 8px 2px;
}

.pc-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #3a3a3a);
  background: color-mix(in srgb, var(--comfy-menu-bg, #1e1e1e) 88%, #000);
}

.pc-group-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}

.pc-group-toolbar-spacer {
  flex: 1 1 auto;
  min-width: 0;
}

.pc-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pc-group-head .pc-title-input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.pc-drag-handle {
  flex: 0 0 16px;
  width: 16px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #777;
  cursor: grab;
  user-select: none;
}

.pc-drag-handle:active {
  cursor: grabbing;
}

.pc-drag-handle svg {
  width: 10px;
  height: 14px;
  fill: currentColor;
}

.pc-priority {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid var(--border-color, #444);
  border-radius: 4px;
  background: var(--comfy-input-bg, #1c1c1f);
  color: #999;
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  outline: none;
}

.pc-priority:focus {
  border-color: #6d5aa8;
  color: var(--input-text, #ddd);
}

.pc-priority::-webkit-outer-spin-button,
.pc-priority::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.pc-priority[type="number"] {
  -moz-appearance: textfield;
}

.pc-toggle {
  position: relative;
  flex: 0 0 30px;
  width: 30px;
  height: 16px;
  border-radius: 999px;
  background: #46464c;
  cursor: pointer;
  transition: background 0.15s ease;
}

.pc-toggle.on {
  background: #a78bfa;
}

.pc-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e8e8ea;
  transition: left 0.15s ease;
  pointer-events: none;
}

.pc-toggle.on .pc-toggle-knob {
  left: 16px;
}

.pc-group.is-off {
  opacity: 0.45;
}

.pc-group.dragging {
  opacity: 0.4;
}

.pc-group.drop-above {
  border-top: 2px solid #a78bfa;
}

.pc-group.drop-below {
  border-bottom: 2px solid #a78bfa;
}

.pc-group-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pc-group.collapsed .pc-group-body {
  display: none;
}

.pc-collapse-btn,
.pc-copy-btn {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #888);
  cursor: pointer;
  padding: 0;
}

.pc-collapse-btn:hover,
.pc-copy-btn:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-input-bg, #2a2a2e);
  border-color: var(--border-color, #444);
}

.pc-collapse-btn svg,
.pc-copy-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-collapse-btn svg {
  transition: transform 0.15s ease;
}

.pc-group.collapsed .pc-collapse-btn svg {
  transform: rotate(-90deg);
}

.pc-remove-btn {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #888);
  cursor: pointer;
  padding: 0;
}

.pc-remove-btn:hover {
  color: #ff8a80;
  background: #3a2323;
  border-color: #c0392b;
}

.pc-remove-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-pair-save-btn,
.pc-pair-load-btn {
  flex: 0 0 auto;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  background: transparent;
  color: var(--descrip-text, #888);
  cursor: pointer;
}

.pc-pair-save-btn:hover,
.pc-pair-load-btn:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-input-bg, #2a2a2e);
  border-color: var(--border-color, #444);
}

.pc-pair-save-btn svg,
.pc-pair-load-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pc-field-label {
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--descrip-text, #888);
  user-select: none;
}

.pc-field-label-positive {
  color: #6bbf7a;
}

.pc-field-label-negative {
  color: #e07070;
}

.pc-loaded-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 0 2px;
  color: var(--descrip-text, #aaa);
  font-size: 11px;
}

.pc-loaded-row[hidden] {
  display: none !important;
}

.pc-loaded-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-loaded-label::before {
  content: "Loaded · ";
  color: var(--descrip-text, #777);
}

.pc-loaded-clear {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #888);
  cursor: pointer;
}

.pc-loaded-clear:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-input-bg, #2a2a2e);
  border-color: var(--border-color, #444);
}

.pc-loaded-clear svg {
  width: 12px;
  height: 12px;
  display: block;
}

.pc-textarea {
  min-height: 72px;
  padding: 6px 8px;
  resize: vertical;
  line-height: 1.35;
  outline: none;
}

.lg-node [data-testid="node-widget"]:has([name="blocks_data"]),
.lg-node-widget:has([name="blocks_data"]),
[data-testid="node-widget"]:has([name="blocks_data"]),
[data-testid="node-widget"]:has([name^="pc_"][name$="_positive"]),
[data-testid="node-widget"]:has([name^="pc_"][name$="_negative"]),
.lg-node-widget:has([name^="pc_"][name$="_positive"]),
.lg-node-widget:has([name^="pc_"][name$="_negative"]) {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}
`;

export function injectStyles(styleId) {
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = CSS;
    document.head.appendChild(style);
}
