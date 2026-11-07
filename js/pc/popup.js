import { CLOSE_ICON_SVG } from "./icons.js";

const STYLE_ID = "pc-popup-styles";

const CSS = `
.pc-popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
}

.pc-popup-backdrop.pc-popup-nested {
  z-index: 12100;
}

.pc-popup-root {
  position: fixed;
  z-index: 11000;
  min-width: 240px;
  max-width: min(420px, calc(100vw - 16px));
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-menu-bg, #1e1e1e);
  color: var(--input-text, #ddd);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  font-family: inherit;
  font-size: 12px;
  overflow: hidden;
}

.pc-popup-backdrop > .pc-popup-root {
  position: relative;
  z-index: auto;
  width: min(420px, 100%);
  max-width: min(520px, calc(100vw - 32px));
  height: auto;
  max-height: min(88vh, 760px);
  padding: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}

.pc-popup-nested {
  z-index: 11100;
}

.pc-popup-centered {
  max-width: min(520px, calc(100vw - 16px));
  height: fit-content;
  max-height: 88vh;
  overflow: hidden;
}

.pc-popup-backdrop > .pc-popup-centered {
  width: min(520px, 100%);
  max-width: min(560px, calc(100vw - 32px));
  /* Don't use fit-content here — it grows past max-height and kills scroll. */
  height: auto;
  max-height: min(88vh, 760px);
}

/* List / editor dialogs: stable shell height so tabs don't jump. */
.pc-popup-backdrop > .pc-popup-root:has(.pc-mgr-list),
.pc-popup-backdrop > .pc-popup-root:has(.pc-preset-list),
.pc-popup-backdrop > .pc-popup-root:has(.pc-popup-scroll) {
  height: min(88vh, 720px);
  max-height: min(88vh, 720px);
}

.pc-popup-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 0 10px;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--border-color, #444);
}

.pc-popup-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #999);
  cursor: pointer;
}

.pc-popup-close:hover {
  color: #f88;
  border-color: var(--border-color, #555);
  background: rgba(255, 80, 80, 0.08);
}

.pc-popup-close svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-popup-centered .pc-popup-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pc-popup-backdrop .pc-popup-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  gap: 8px;
}

/* Editors / manager: outer body does not scroll — inner list/scroll does. */
.pc-popup-backdrop .pc-popup-body:has(> .pc-popup-fixed),
.pc-popup-backdrop .pc-popup-body:has(.pc-mgr-list),
.pc-popup-backdrop .pc-popup-body:has(.pc-preset-list) {
  overflow: hidden;
}

.pc-popup-backdrop .pc-popup-body:has(> .pc-popup-fixed) {
  gap: 0;
}

.pc-popup-fixed {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

.pc-popup-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

/* Floating centered editors (non-blocking): cap scroll height. */
.pc-popup-centered .pc-popup-scroll {
  flex: 0 1 auto;
  max-height: min(72vh, 640px);
}

.pc-popup-backdrop .pc-popup-scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
}

.pc-popup-backdrop .pc-mgr-tabs,
.pc-popup-backdrop .pc-toggle-row,
.pc-popup-backdrop .pc-popup-body > .pc-popup-input,
.pc-popup-backdrop .pc-popup-body > .pc-popup-message {
  flex: 0 0 auto;
}

.pc-popup-backdrop .pc-mgr-list,
.pc-popup-backdrop .pc-preset-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.pc-popup-backdrop .pc-mgr-list-suggest.pc-ac-mgr-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.pc-popup-title.pc-popup-drag {
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.pc-popup-title.pc-popup-drag:active {
  cursor: grabbing;
}

.pc-popup-footer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--border-color, #444);
}

.pc-popup-footer .pc-popup-error:empty {
  display: none;
}

.pc-popup-footer .pc-popup-actions {
  align-self: flex-end;
}

.pc-popup-title {
  flex: 0 0 auto;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--descrip-text, #aaa);
  padding: 2px 4px 8px;
  user-select: none;
}

.pc-popup-head .pc-popup-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--input-text, #ddd);
  padding: 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-popup-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
}

.pc-popup-input {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #222);
  color: var(--input-text, #ddd);
  font-family: inherit;
  font-size: 12px;
  outline: none;
}

.pc-popup-input:focus {
  border-color: var(--descrip-text, #888);
}

.pc-popup-input.invalid {
  border-color: #c0392b;
}

.pc-popup-error {
  min-height: 14px;
  padding: 0 2px;
  color: #ff8a80;
  font-size: 11px;
}

.pc-popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.pc-popup-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}

.pc-popup-btn:hover:not(:disabled) {
  filter: brightness(1.15);
}

.pc-popup-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.pc-popup-btn.primary {
  background: #2f2b3d;
  border-color: #6d5aa8;
  color: #e8e4f5;
}

.pc-popup-btn.danger {
  background: #3a2323;
  border-color: #c0392b;
  color: #ff8a80;
}

.pc-popup-message {
  padding: 2px 4px 0;
  line-height: 1.4;
  color: var(--input-text, #ddd);
  white-space: pre-wrap;
}

.pc-save-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #3a3a3a);
}

.pc-save-cat {
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--descrip-text, #aaa);
  user-select: none;
}

.pc-popup-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #222);
  color: var(--input-text, #ddd);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.35;
  resize: vertical;
  outline: none;
}

.pc-popup-textarea:focus {
  border-color: var(--descrip-text, #888);
}

.pc-save-slots {
  padding: 2px 4px 0;
  color: var(--descrip-text, #aaa);
  line-height: 1.4;
}

.pc-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  color: var(--descrip-text, #aaa);
  font-size: 11px;
  user-select: none;
}

.pc-settings-row {
  padding: 4px 2px;
  font-size: 12px;
  color: var(--input-text, #ddd);
}

.pc-settings-row-disabled {
  opacity: 0.55;
}

.pc-settings-section {
  margin: 14px 0 8px;
  padding: 7px 10px 7px 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  border-left-width: 3px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  user-select: none;
  line-height: 1.3;
}

.pc-settings-section:first-child {
  margin-top: 0;
}

.pc-settings-section-node {
  border-color: #6b5a2e;
  border-left-color: #e6b84a;
  background: linear-gradient(90deg, rgba(230, 184, 74, 0.18), rgba(230, 184, 74, 0.04));
  color: #f0d78a;
  text-shadow: 0 0 12px rgba(230, 184, 74, 0.35);
}

.pc-settings-section-saved {
  border-color: #2e4a5c;
  border-left-color: #5eb0e0;
  background: linear-gradient(90deg, rgba(94, 176, 224, 0.16), rgba(94, 176, 224, 0.03));
  color: #9fd4f0;
  text-shadow: 0 0 12px rgba(94, 176, 224, 0.3);
}

.pc-settings-label {
  flex: 1 1 auto;
  line-height: 1.35;
  min-width: 0;
}

.pc-settings-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0 4px;
}

.pc-settings-footer {
  margin-top: 10px;
  padding: 8px 2px 2px;
  border-top: 1px solid var(--border-color, #444);
  color: var(--descrip-text, #888);
  font-size: 11px;
  line-height: 1.45;
}

.pc-busy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 2px 0;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
  font-size: 12px;
  line-height: 1.35;
}

.pc-busy[hidden] {
  display: none !important;
}

.pc-busy-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pc-busy-text {
  flex: 1 1 auto;
  min-width: 0;
}

.pc-busy-spinner {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  border: 2px solid var(--descrip-text, #666);
  border-top-color: #c4b5fd;
  border-radius: 50%;
  animation: pc-busy-spin 0.7s linear infinite;
}

.pc-busy-track {
  height: 4px;
  border-radius: 999px;
  background: #1a1a1e;
  overflow: hidden;
}

.pc-busy-fill {
  height: 100%;
  width: 0%;
  border-radius: inherit;
  background: #8b7ec8;
  transition: width 0.12s linear;
}

.pc-busy-detail {
  font-size: 11px;
  color: var(--descrip-text, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-busy.is-done {
  border-color: #3d5a40;
  background: #243028;
  color: #b8d4be;
}

.pc-busy.is-done .pc-busy-fill {
  background: #6a9b72;
}

.pc-busy.is-error {
  border-color: #6a3030;
  background: #2e2222;
  color: #e0a0a0;
}

@keyframes pc-busy-spin {
  to {
    transform: rotate(360deg);
  }
}

.pc-ac-mgr-list.is-busy {
  position: relative;
  min-height: 140px;
  opacity: 0.45;
  pointer-events: none;
}

.pc-ac-mgr-busy-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 4px 0 8px;
}

.pc-settings-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid #8a6a2a;
  background: #3a3218;
  color: #e6c87a;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  vertical-align: middle;
  text-transform: lowercase;
}

.pc-civitai-overlay,
.pc-civitai-info-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
}

.pc-civitai-info-overlay {
  z-index: 12020;
}

.pc-civitai-modal,
.pc-civitai-info-panel {
  width: min(640px, 100%);
  max-height: min(88vh, 760px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-menu-bg, #1e1e1e);
  color: var(--input-text, #ddd);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.pc-civitai-info-panel {
  width: min(560px, 100%);
  max-height: min(88vh, 780px);
}

.pc-civitai-info-footer {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #444);
}

.pc-civitai-modal-top {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #444);
  background: var(--comfy-menu-bg, #1e1e1e);
  z-index: 1;
}

.pc-civitai-modal-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pc-civitai-modal-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-civitai-modal-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #999);
  cursor: pointer;
}

.pc-civitai-modal-close:hover {
  color: #f88;
  border-color: var(--border-color, #555);
  background: rgba(255, 80, 80, 0.08);
}

.pc-civitai-modal-close svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-civitai-crumbs {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  min-width: 0;
  max-height: none;
  overflow: visible;
}

.pc-civitai-crumb {
  flex: 0 1 auto;
  max-width: 180px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: #9ab4ff;
  font-family: inherit;
  font-size: 12px;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.pc-civitai-crumb.is-current {
  color: var(--input-text, #ddd);
  cursor: default;
}

.pc-civitai-crumb:not(.is-current):hover {
  background: rgba(154, 180, 255, 0.12);
  border-color: rgba(154, 180, 255, 0.35);
  text-decoration: underline;
}

.pc-civitai-crumb-sep {
  flex: 0 0 auto;
  color: var(--descrip-text, #666);
  font-size: 12px;
  user-select: none;
}

.pc-civitai-search {
  width: 100%;
  box-sizing: border-box;
}

.pc-civitai-status {
  margin: 0;
  min-height: 1.2em;
  flex: 0 0 auto;
}

.pc-civitai-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 2px 2px 0;
}

.pc-civitai-search-group {
  flex: 0 0 auto;
  display: block;
  width: 100%;
  margin: 4px 0 0;
  padding: 6px 8px 4px;
  border: none;
  border-bottom: 1px solid var(--border-color, #38383c);
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: #a78bfa;
  font-family: inherit;
  font-size: 11px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  box-sizing: border-box;
}

.pc-civitai-search-group.clickable {
  cursor: pointer;
}

.pc-civitai-search-group.clickable:hover {
  background: rgba(167, 139, 250, 0.1);
}

.pc-civitai-folder {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #444);
  background: rgba(255, 255, 255, 0.03);
  color: var(--input-text, #ddd);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.pc-civitai-folder:hover {
  border-color: #6d5aa8;
  background: rgba(109, 90, 168, 0.12);
}

.pc-civitai-folder-icon {
  flex: 0 0 auto;
}

.pc-civitai-folder-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-civitai-folder-arrow {
  flex: 0 0 auto;
  color: var(--descrip-text, #888);
}

.pc-civitai-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--border-color, #444);
}

.pc-civitai-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #444);
  background: rgba(255, 255, 255, 0.03);
  box-sizing: border-box;
  min-width: 0;
  cursor: pointer;
}

.pc-civitai-row:hover {
  border-color: #6d5aa8;
  background: rgba(109, 90, 168, 0.1);
}

.pc-civitai-titles {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pc-civitai-title-btn {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #c5d4ff;
  line-height: 1.35;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.pc-civitai-title-btn:hover {
  color: #e8eeff;
  text-decoration: underline;
}

.pc-civitai-file {
  font-size: 11px;
  color: var(--descrip-text, #888);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-civitai-base {
  flex: 0 0 auto;
  max-width: 110px;
  font-size: 10px;
  color: var(--descrip-text, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-civitai-preview-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #777);
  cursor: pointer;
}

.pc-civitai-preview-btn svg {
  width: 15px;
  height: 15px;
  display: block;
}

.pc-civitai-preview-btn.has-preview {
  color: #9fd4f0;
}

.pc-civitai-preview-btn.has-preview:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-input-bg, #2a2a2e);
  border-color: var(--border-color, #444);
}

.pc-civitai-info-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  padding: 2px 0;
}

.pc-civitai-tag {
  flex: 0 1 auto;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #4a4a50);
  background: rgba(0, 0, 0, 0.22);
  color: var(--descrip-text, #bbb);
  font-size: 10px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-civitai-cover-tip {
  position: fixed;
  z-index: 12100;
  width: 220px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #555);
  background: var(--comfy-menu-bg, #1e1e1e);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}

.pc-civitai-cover-tip img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 280px;
  object-fit: contain;
  border-radius: 4px;
  background: #111;
}

.pc-civitai-groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pc-civitai-empty-groups {
  font-size: 11px;
  color: var(--descrip-text, #777);
  font-style: italic;
  padding: 2px 0;
}

.pc-civitai-more-groups {
  align-self: flex-start;
  height: 24px;
  margin-top: 2px;
  padding: 0 8px;
  border: 1px dashed var(--border-color, #555);
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #aaa);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.pc-civitai-more-groups:hover {
  color: var(--input-text, #ddd);
  border-color: #6d5aa8;
  background: rgba(109, 90, 168, 0.12);
}

.pc-civitai-group {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #555);
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.4;
}

.pc-civitai-group:hover {
  border-color: #6d5aa8;
}

.pc-civitai-group.selected {
  border-color: #9b87d8;
  background: #2f2b3d;
  color: #e8e4f5;
  box-shadow: inset 0 0 0 1px rgba(155, 135, 216, 0.35);
}

.pc-civitai-group-text {
  flex: 1 1 auto;
  min-width: 0;
  max-height: 3.9em;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.pc-civitai-group-text.is-expanded {
  max-height: none;
  overflow: visible;
}

.pc-civitai-expand {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: -2px -2px 0 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--descrip-text, #999);
  cursor: pointer;
}

.pc-civitai-expand:hover {
  color: var(--input-text, #ddd);
  background: rgba(255, 255, 255, 0.06);
}

.pc-civitai-expand svg {
  width: 14px;
  height: 14px;
  display: block;
  transition: transform 0.12s ease;
}

.pc-civitai-expand.open svg {
  transform: rotate(180deg);
}

.pc-civitai-info-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pc-civitai-info-hero {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.pc-civitai-info-cover {
  width: 148px;
  height: 148px;
  flex: 0 0 auto;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color, #444);
  background: #111;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pc-civitai-info-cover.is-empty {
  font-size: 11px;
  color: var(--descrip-text, #777);
}

.pc-civitai-info-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pc-civitai-info-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}

.pc-civitai-info-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--input-text, #eee);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.pc-civitai-info-line {
  font-size: 11px;
  line-height: 1.35;
  color: var(--descrip-text, #888);
  word-break: break-word;
}

.pc-civitai-info-path {
  word-break: break-all;
}

.pc-civitai-info-link {
  color: #9ab4ff;
  text-decoration: none;
}

.pc-civitai-info-link:hover {
  text-decoration: underline;
  color: #c2d0ff;
}

.pc-civitai-info-section {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.pc-civitai-info-notes-slot:empty {
  display: none;
}

.pc-civitai-info-section-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pc-civitai-info-label {
  flex: 1 1 auto;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--descrip-text, #aaa);
}

.pc-civitai-copy-btn {
  flex: 0 0 auto;
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid var(--border-color, #555);
  border-radius: 6px;
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.pc-civitai-copy-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.pc-civitai-copy-btn:not(:disabled):hover {
  border-color: #6d5aa8;
  color: #e8e4f5;
}

.pc-civitai-copy-btn.copied {
  border-color: #5f9;
  color: #5f9;
}

.pc-civitai-copy-btn svg {
  width: 12px;
  height: 12px;
  display: block;
}

.pc-civitai-info-text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--input-text, #ddd);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border-color, #3a3a3e);
  box-sizing: border-box;
}

.pc-civitai-desc-more {
  align-self: flex-start;
  height: 24px;
  margin-top: 2px;
  padding: 0 8px;
  border: 1px dashed var(--border-color, #555);
  border-radius: 6px;
  background: transparent;
  color: var(--descrip-text, #aaa);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.pc-civitai-desc-more:hover {
  color: var(--input-text, #ddd);
  border-color: #6d5aa8;
  background: rgba(109, 90, 168, 0.12);
}

.pc-mgr-list-suggest {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.pc-ac-mgr-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  width: 100%;
}

.pc-ac-mgr-panel > .pc-ac-mgr-toolbar,
.pc-ac-mgr-panel > .pc-ac-mgr-search,
.pc-ac-mgr-panel > .pc-ac-mgr-add,
.pc-ac-mgr-panel > .pc-ac-mgr-footer {
  flex: 0 0 auto;
  flex-shrink: 0;
}

.pc-ac-mgr-search {
  height: 30px;
  min-height: 30px;
  box-sizing: border-box;
}

/* Side switcher — not a second row of main mgr tabs */
.pc-ac-mgr-tabs {
  flex: 0 0 auto;
  display: inline-flex;
  align-self: flex-start;
  gap: 0;
  margin: 0 0 2px;
  padding: 2px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #222);
}

.pc-ac-mgr-tab {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--descrip-text, #aaa);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}

.pc-ac-mgr-tab.active {
  background: #3a3450;
  color: var(--input-text, #ddd);
}

.pc-ac-mgr-add {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 6px;
}

.pc-ac-mgr-add .pc-popup-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 30px;
  min-height: 30px;
}

.pc-ac-mgr-list {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0;
}

.pc-ac-mgr-footer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #444);
}

.pc-ac-mgr-footer .pc-popup-actions {
  align-self: stretch;
  justify-content: flex-end;
}

.pc-ac-mgr-footer .pc-popup-message {
  margin: 0;
}

.pc-ac-mgr-bucket-body {
  gap: 4px;
  padding-left: 4px;
}

.pc-ac-mgr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.pc-ac-mgr-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--input-text, #ddd);
}

.pc-ac-mgr-row .pc-popup-btn {
  flex: 0 0 auto;
  min-width: 28px;
  padding: 0 8px;
  height: 26px;
}

.pc-ac-replace-list {
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0 4px;
  padding: 2px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.pc-ac-replace-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
}

.pc-ac-replace-shelf {
  font-size: 10px;
  color: var(--descrip-text, #888);
  letter-spacing: 0.02em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-ac-replace-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pc-ac-replace-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--input-text, #ddd);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-info-tip {
  max-width: min(380px, calc(100vw - 16px));
}

.pc-preset-peek {
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

.pc-preset-peek:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-menu-bg, #1e1e1e);
  border-color: var(--border-color, #444);
}

.pc-preset-peek svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-prompt-tip {
  position: fixed;
  z-index: 12000;
  max-width: min(360px, calc(100vw - 16px));
  max-height: min(50vh, 360px);
  overflow: auto;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #555);
  background: #1c1c1f;
  color: var(--input-text, #ddd);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.4;
  pointer-events: auto;
}

.pc-prompt-tip-label {
  font-size: 10px;
  letter-spacing: 0.02em;
  margin-top: 6px;
}

.pc-prompt-tip-label:first-child {
  margin-top: 0;
}

.pc-prompt-tip-pos {
  color: #6bbf7a;
}

.pc-prompt-tip-neg {
  color: #e07070;
}

.pc-prompt-tip-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--input-text, #ddd);
}

.pc-save-folder-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pc-save-folder-row .pc-popup-input {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}

.pc-save-folder-row .pc-popup-btn {
  flex: 0 0 auto;
}

.pc-pick-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.pc-add-group-error:empty {
  display: none;
  min-height: 0;
  padding: 0;
  margin: 0;
}

.pc-add-group-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: -2px;
}

.pc-add-group-hint {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--descrip-text, #999);
  line-height: 1;
  user-select: none;
}

.pc-add-group-list {
  max-height: 180px;
}

.pc-pick-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
}

.pc-pick-item:hover {
  filter: brightness(1.12);
}

.pc-pick-item.selected {
  background: #2f2b3d;
  border-color: #6d5aa8;
  color: #e8e4f5;
}

.pc-preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pc-preset-folder {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pc-preset-folder-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 0 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--input-text, #ddd);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
}

.pc-preset-folder-head:hover {
  background: var(--comfy-input-bg, #2a2a2e);
}

.pc-preset-folder-chevron {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  color: var(--descrip-text, #888);
}

.pc-preset-folder-chevron svg {
  width: 14px;
  height: 14px;
  display: block;
  transition: transform 0.15s ease;
}

.pc-preset-folder.collapsed .pc-preset-folder-chevron svg {
  transform: rotate(-90deg);
}

.pc-preset-folder-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-preset-folder-count {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--descrip-text, #888);
}

.pc-preset-folder-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pc-preset-folder.collapsed .pc-preset-folder-body {
  display: none;
}

.pc-mgr-tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
}

.pc-mgr-tab {
  flex: 1 1 0;
  min-width: 0;
  height: 28px;
  border: 1px solid var(--border-color, #444);
  border-radius: 6px;
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--descrip-text, #aaa);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 6px;
}

.pc-mgr-tab.active {
  color: var(--input-text, #ddd);
  border-color: #6d5aa8;
  background: #2f2b3d;
}

.pc-mgr-list {
  min-height: 120px;
}

.pc-mgr-folder-head {
  cursor: default;
}

.pc-mgr-folder-head:hover {
  background: transparent;
}

.pc-mgr-folder-toggle {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 28px;
  padding: 0 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pc-mgr-folder-toggle:hover {
  background: var(--comfy-input-bg, #2a2a2e);
}

.pc-mgr-folder-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.pc-mgr-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
}

.pc-mgr-item-info {
  flex: 1 1 auto;
  min-width: 0;
}

.pc-mgr-item-name {
  font-size: 12px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-mgr-item-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--descrip-text, #888);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-mgr-item-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
}

.pc-mgr-icon-btn {
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

.pc-mgr-icon-btn:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-menu-bg, #1e1e1e);
  border-color: var(--border-color, #444);
}

.pc-mgr-icon-btn.danger:hover {
  color: #e07070;
  border-color: #7a3a3a;
}

.pc-mgr-icon-btn svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-mgr-prompt-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pc-mgr-prompt-label {
  font-size: 11px;
  letter-spacing: 0.02em;
}

.pc-mgr-prompt-label.positive {
  color: #6bbf7a;
}

.pc-mgr-prompt-label.negative {
  color: #e07070;
}

.pc-mgr-prompt-area {
  min-height: 64px;
  max-height: min(25vh, 240px);
  resize: vertical;
}

.pc-preset-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #444);
  background: var(--comfy-input-bg, #2a2a2e);
  color: var(--input-text, #ddd);
  box-sizing: border-box;
}

.pc-preset-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}

.pc-preset-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc-preset-slots {
  font-size: 11px;
  color: var(--descrip-text, #aaa);
  line-height: 1.35;
}

.pc-preset-desc-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.pc-preset-desc {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--descrip-text, #888);
  line-height: 1.35;
  white-space: pre-wrap;
}

.pc-preset-load,
.pc-preset-append,
.pc-preset-collapse {
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

.pc-preset-load:hover,
.pc-preset-append:hover,
.pc-preset-collapse:hover {
  color: var(--input-text, #ddd);
  background: var(--comfy-menu-bg, #1e1e1e);
  border-color: var(--border-color, #444);
}

.pc-preset-load svg,
.pc-preset-append svg,
.pc-preset-collapse svg {
  width: 14px;
  height: 14px;
  display: block;
}

.pc-preset-collapse svg {
  transition: transform 0.15s ease;
}

.pc-preset-item.desc-collapsed .pc-preset-collapse svg {
  transform: rotate(-90deg);
}
`;

export function injectPopupStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

const popupStack = [];

function clampPopupPosition(el, x, y) {
    const margin = 8;
    const box = el.getBoundingClientRect();
    const maxX = window.innerWidth - box.width - margin;
    const maxY = window.innerHeight - box.height - margin;
    el.style.left = `${Math.max(margin, Math.min(x, maxX))}px`;
    el.style.top = `${Math.max(margin, Math.min(y, maxY))}px`;
}

function placePopup(el, { anchor, position, centered }) {
    const margin = 8;
    const gap = 4;
    let x = position?.x ?? margin;
    let y = position?.y ?? margin;
    let anchorRect = null;
    if (!centered && anchor?.getBoundingClientRect) {
        anchorRect = anchor.getBoundingClientRect();
        y = anchorRect.bottom + gap;
    }

    if (!el.isConnected) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.visibility = "hidden";
        document.body.appendChild(el);
    }

    const box = el.getBoundingClientRect();
    if (centered) {
        x = (window.innerWidth - box.width) / 2;
        const anchorY = window.innerHeight * 0.42;
        y = anchorY - box.height / 2;
    } else if (anchorRect) {
        x =
            anchorRect.left +
            (anchorRect.width - box.width) / 2;
        const below = anchorRect.bottom + gap;
        const above = anchorRect.top - box.height - gap;
        const fitsBelow =
            below + box.height <= window.innerHeight - margin;
        y = !fitsBelow && above >= margin ? above : below;
    }
    clampPopupPosition(el, x, y);
    el.style.visibility = "visible";
}

function bindPopupDrag(root, handle, onMoved) {
    if (!handle) return;
    handle.classList.add("pc-popup-drag");
    handle.title = handle.title || "Drag to move";

    handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        const rect = root.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = rect.left;
        const origY = rect.top;

        function onMove(ev) {
            clampPopupPosition(
                root,
                origX + (ev.clientX - startX),
                origY + (ev.clientY - startY),
            );
            onMoved?.();
        }

        function onUp(ev) {
            handle.releasePointerCapture(ev.pointerId);
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
        }

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
    });
}

/**
 * Modal / floating popup.
 * Default: blocking overlay (dimmed backdrop, close via X or Escape — not outside click).
 * Pass `blocking: false` for the old anchored floating card (outside-click closes).
 * A non-nested open closes the whole stack. Nested opens stack on top.
 *
 * @param {object} opts
 * @param {HTMLElement} [opts.anchor]
 * @param {{x:number,y:number}} [opts.position]
 * @param {string} [opts.title]
 * @param {number} [opts.width]
 * @param {boolean} [opts.nested]
 * @param {boolean} [opts.centered]
 * @param {boolean} [opts.blocking] — default true; backdrop + X, no outside-click close
 * @param {boolean} [opts.draggable] — drag by title (ignored when blocking)
 * @param {(body: HTMLElement, api: { close: () => void, root: HTMLElement, setTitle: (t: string) => void }) => void} opts.render
 * @param {() => void} [opts.onClose]
 */
export function openPopup(opts) {
    injectPopupStyles();
    if (!opts.nested) {
        while (popupStack.length)
            popupStack[popupStack.length - 1].close();
    }

    const blocking = opts.blocking !== false;

    const root = document.createElement("div");
    root.className = "pc-popup-root";
    if (opts.centered || blocking)
        root.classList.add("pc-popup-centered");
    if (opts.width) root.style.width = `${opts.width}px`;
    root.addEventListener("pointerdown", (e) =>
        e.stopPropagation(),
    );
    root.addEventListener(
        "wheel",
        (e) => e.stopPropagation(),
        { passive: true },
    );

    const titleEl = document.createElement("div");
    titleEl.className = "pc-popup-title";
    if (opts.title) titleEl.textContent = opts.title;
    else titleEl.style.display = "none";

    const body = document.createElement("div");
    body.className = "pc-popup-body";

    let backdrop = null;
    let host = root;

    if (blocking) {
        backdrop = document.createElement("div");
        backdrop.className = "pc-popup-backdrop";
        if (opts.nested) backdrop.classList.add("pc-popup-nested");
        backdrop.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
        });
        backdrop.addEventListener(
            "wheel",
            (e) => e.stopPropagation(),
            { passive: true },
        );

        const head = document.createElement("div");
        head.className = "pc-popup-head";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "pc-popup-close";
        closeBtn.title = "Close";
        closeBtn.innerHTML = CLOSE_ICON_SVG;
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            close();
        });

        head.append(titleEl, closeBtn);
        root.append(head, body);
        backdrop.appendChild(root);
        host = backdrop;
    } else {
        if (opts.nested) root.classList.add("pc-popup-nested");
        root.append(titleEl, body);
    }

    let closed = false;
    let userMoved = false;
    const draggable = Boolean(opts.draggable) && !blocking;

    function close() {
        if (closed) return;
        closed = true;
        while (
            popupStack.length &&
            popupStack[popupStack.length - 1] !== api
        ) {
            popupStack[popupStack.length - 1].close();
        }
        const index = popupStack.indexOf(api);
        if (index >= 0) popupStack.splice(index, 1);
        document.removeEventListener(
            "pointerdown",
            onDocDown,
            true,
        );
        document.removeEventListener(
            "keydown",
            onKey,
            true,
        );
        host.remove();
        opts.onClose?.();
    }

    function onDocDown(e) {
        if (blocking) return;
        if (popupStack[popupStack.length - 1] !== api)
            return;
        if (e.target?.closest?.(".pc-prompt-tip")) return;
        if (
            root.contains(e.target) ||
            e.target === opts.anchor
        )
            return;
        const inStack = popupStack.some((item) =>
            item.root.contains(e.target),
        );
        if (inStack) {
            close();
            return;
        }
        if (popupStack[0] && popupStack[0] !== api) {
            popupStack[0].close();
            return;
        }
        close();
    }

    function onKey(e) {
        if (e.key !== "Escape") return;
        if (popupStack[popupStack.length - 1] !== api)
            return;
        e.preventDefault();
        e.stopPropagation();
        close();
    }

    const api = {
        close,
        root,
        reposition() {
            if (closed || !root.isConnected || blocking) return;
            if (userMoved) {
                const rect = root.getBoundingClientRect();
                clampPopupPosition(root, rect.left, rect.top);
                return;
            }
            placePopup(root, opts);
        },
        setTitle(text) {
            titleEl.style.display = text ? "" : "none";
            titleEl.textContent = text || "";
        },
    };

    if (draggable && opts.title) {
        bindPopupDrag(root, titleEl, () => {
            userMoved = true;
        });
    }

    popupStack.push(api);
    document.body.appendChild(host);
    opts.render?.(body, api);
    if (!blocking) placePopup(root, opts);
    if (!blocking) {
        document.addEventListener(
            "pointerdown",
            onDocDown,
            true,
        );
    }
    document.addEventListener("keydown", onKey, true);
    return api;
}

/**
 * Name/value prompt built on openPopup.
 */
export function openInputPopup({
    anchor,
    position,
    title = "Name",
    placeholder = "",
    confirmLabel = "Add",
    initialValue = "",
    validate,
    onSubmit,
    nested = false,
} = {}) {
    return openPopup({
        anchor,
        position,
        title,
        width: 280,
        nested,
        render(body, { close }) {
            const input = document.createElement("input");
            input.className = "pc-popup-input";
            input.type = "text";
            input.placeholder = placeholder;
            input.value = initialValue;

            const errorEl = document.createElement("div");
            errorEl.className = "pc-popup-error";

            const actions = document.createElement("div");
            actions.className = "pc-popup-actions";

            const confirm =
                document.createElement("button");
            confirm.type = "button";
            confirm.className = "pc-popup-btn primary";
            confirm.textContent = confirmLabel;

            function showError(message) {
                errorEl.textContent = message || "";
                input.classList.toggle(
                    "invalid",
                    !!message,
                );
            }

            function submit() {
                const value = input.value.trim();
                const error = validate?.(value);
                if (error) {
                    showError(error);
                    input.focus();
                    return;
                }
                close();
                onSubmit?.(value);
            }

            confirm.addEventListener("click", (e) => {
                e.stopPropagation();
                submit();
            });
            input.addEventListener("input", () => {
                if (errorEl.textContent) showError("");
            });
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                }
            });

            actions.appendChild(confirm);
            body.append(input, errorEl, actions);
            requestAnimationFrame(() => input.focus());
        },
    });
}

/**
 * Confirm / cancel prompt built on openPopup.
 */
export function openConfirmPopup({
    anchor,
    position,
    title = "Confirm",
    message = "",
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    showCancel = true,
    danger = true,
    onConfirm,
    nested = false,
} = {}) {
    return openPopup({
        anchor,
        position,
        title,
        width: 280,
        nested,
        render(body, { close }) {
            const text = document.createElement("div");
            text.className = "pc-popup-message";
            text.textContent = message;

            const actions = document.createElement("div");
            actions.className = "pc-popup-actions";

            const cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "pc-popup-btn";
            cancel.textContent = cancelLabel;
            cancel.addEventListener("click", (e) => {
                e.stopPropagation();
                close();
            });

            const confirm =
                document.createElement("button");
            confirm.type = "button";
            confirm.className = `pc-popup-btn ${danger ? "danger" : "primary"}`;
            confirm.textContent = confirmLabel;
            confirm.addEventListener("click", (e) => {
                e.stopPropagation();
                close();
                onConfirm?.();
            });

            if (showCancel) actions.appendChild(cancel);
            actions.appendChild(confirm);
            body.append(text, actions);
            requestAnimationFrame(() => confirm.focus());
        },
    });
}
