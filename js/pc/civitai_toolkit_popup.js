/** Toolkit Local Manager–style info popup (same UX as Ultimate LoRA Loader `?`). */

const STYLE_ID = "pc-civitai-toolkit-popup-styles";

const CSS = `
.pc-toolkit-popup {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
}
.pc-toolkit-popup .popup-content {
  background: var(--comfy-menu-bg, #2a2a2e);
  padding: 0;
  border-radius: 8px;
  max-width: 800px;
  width: 95%;
  border: 1px solid var(--border-color, #444);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}
.pc-toolkit-popup .popup-header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color, #444);
}
.pc-toolkit-popup .popup-header h2 {
  margin: 0;
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-color, #ddd);
  font-size: 1.15em;
}
.pc-toolkit-popup .popup-close {
  font-size: 28px;
  cursor: pointer;
  color: var(--fg-color, #ddd);
  margin-left: 15px;
  line-height: 1;
}
.pc-toolkit-popup .popup-close:hover { color: #f44; }
.pc-toolkit-popup .popup-body {
  overflow-y: auto;
  word-break: break-word;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--fg-color, #ddd);
}
.pc-toolkit-popup .model-description-content {
  font-size: 13px;
  background: rgba(0, 0, 0, 0.2);
  padding: 12px;
  border-radius: 5px;
}
.pc-toolkit-popup .model-description-content.version-desc {
  background: rgba(80, 80, 0, 0.2);
}
.pc-toolkit-popup .model-description-content img {
  max-width: 100%;
  height: auto;
  border-radius: 5px;
  margin-top: 10px;
}
.pc-toolkit-popup .info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.pc-toolkit-popup .info-item {
  background: var(--comfy-box-bg, #1c1c1f);
  padding: 8px;
  border-radius: 5px;
  font-size: 0.9em;
}
.pc-toolkit-popup .info-item strong {
  color: var(--desc-text-color, #999);
  margin-right: 8px;
}
.pc-toolkit-popup .info-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pc-toolkit-popup .section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pc-toolkit-popup h4 { margin: 0; }
.pc-toolkit-popup .detail-tags,
.pc-toolkit-popup .triggers-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pc-toolkit-popup .detail-tag {
  background: var(--comfy-input-bg, #333);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
}
.pc-toolkit-popup .trigger-word {
  background: var(--comfy-input-bg, #333);
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--border-color, #444);
  cursor: pointer;
  user-select: none;
}
.pc-toolkit-popup .trigger-word:hover {
  border-color: var(--accent-color, #a78bfa);
  color: var(--accent-color, #a78bfa);
}
.pc-toolkit-popup .trigger-word.copied {
  border-color: #5f9;
  color: #5f9;
}
.pc-toolkit-popup .copy-btn,
.pc-toolkit-popup .copy-all-btn {
  background: var(--comfy-input-bg, #333);
  border: 1px solid var(--border-color, #444);
  color: var(--input-text-color, #ddd);
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
}
.pc-toolkit-popup .copy-btn:hover,
.pc-toolkit-popup .copy-all-btn:hover {
  border-color: var(--accent-color, #a78bfa);
  color: var(--accent-color, #a78bfa);
}
.pc-toolkit-popup .copy-btn.copied,
.pc-toolkit-popup .copy-all-btn.copied {
  border-color: #5f9;
  color: #5f9;
}
.pc-toolkit-popup .description-details summary {
  cursor: pointer;
  font-weight: bold;
  font-size: 1.1em;
}
.pc-toolkit-popup .hash-section {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--comfy-box-bg, #1c1c1f);
  padding: 10px;
  border-radius: 5px;
}
.pc-toolkit-popup .hash-section strong { flex-shrink: 0; }
.pc-toolkit-popup .hash-code {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseHtml(htmlString) {
  return new DOMParser().parseFromString(String(htmlString || ""), "text/html").body
    .innerHTML;
}

function copyToClipboard(text, targetElement) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = targetElement.innerHTML;
    targetElement.innerHTML = "Copied!";
    targetElement.classList.add("copied");
    setTimeout(() => {
      targetElement.innerHTML = originalText;
      targetElement.classList.remove("copied");
    }, 1500);
  }).catch((err) => console.error("[PromptConcatenatePro] copy failed:", err));
}

/** Open Toolkit-style detail popup for an already-fetched model row. */
export function openToolkitModelInfo(model, title) {
  injectStyles();
  document.querySelector(".pc-toolkit-popup")?.remove();

  const data = model || {};
  const heading = title || data.civitai_model_name || data.filename || "LoRA";

  const versionDescriptionHTML = data.version_description
    ? parseHtml(data.version_description)
    : "";
  const modelDescriptionHTML = data.model_description
    ? parseHtml(data.model_description)
    : "<em>No description available.</em>";

  const triggersHTML =
    data.trained_words && data.trained_words.length > 0
      ? data.trained_words
          .map(
            (tag) =>
              `<code class="trigger-word" title="Click to copy">${escapeHtml(tag)}</code>`,
          )
          .join("")
      : "<em>None specified</em>";

  const copyAllTriggersBtn =
    data.trained_words && data.trained_words.length > 0
      ? `<button class="copy-all-btn" data-text="${escapeHtml(data.trained_words.join(", "))}">Copy All</button>`
      : "";

  const tagsHTML =
    data.tags && data.tags.length > 0
      ? `<div class="detail-tags">${data.tags
          .map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "<em>No tags found.</em>";

  const ratingText =
    data.civitai_stats?.rating !== undefined
      ? `${data.civitai_stats.rating.toFixed(1)} (${data.civitai_stats.ratingCount})`
      : `👍 ${data.civitai_stats?.thumbsUpCount || 0}`;

  const popup = document.createElement("div");
  popup.className = "pc-toolkit-popup";
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <h2>${escapeHtml(heading)}</h2>
        <span class="popup-close" title="Close">&times;</span>
      </div>
      <div class="popup-body">
        <div class="info-grid">
          <div class="info-item"><strong>Civitai Name:</strong> <span>${escapeHtml(data.civitai_model_name || "N/A")}</span></div>
          <div class="info-item"><strong>Version:</strong> <span>${escapeHtml(data.version_name || "N/A")}</span></div>
          <div class="info-item"><strong>Base Model:</strong> <span>${escapeHtml(data.base_model || "N/A")}</span></div>
          <div class="info-item"><strong>Downloads:</strong> <span>${escapeHtml(data.civitai_stats?.downloadCount || 0)}</span></div>
          <div class="info-item"><strong>Rating:</strong> <span>${escapeHtml(ratingText)}</span></div>
        </div>
        <div class="info-section">
          <h4>Tags</h4>
          ${tagsHTML}
        </div>
        <div class="info-section">
          <div class="section-header">
            <h4>Trigger Words</h4>
            ${copyAllTriggersBtn}
          </div>
          <div class="triggers-container">${triggersHTML}</div>
        </div>
        ${
          versionDescriptionHTML
            ? `<div class="info-section">
                <h4>Version Description</h4>
                <div class="model-description-content version-desc">${versionDescriptionHTML}</div>
              </div>`
            : ""
        }
        <div class="info-section">
          <details class="description-details" open>
            <summary>Model Description</summary>
            <div class="model-description-content">${modelDescriptionHTML}</div>
          </details>
        </div>
        <div class="info-section hash-section">
          <strong>Hash:</strong>
          <code class="hash-code">${escapeHtml(data.hash || "N/A")}</code>
          <button class="copy-btn" data-text="${escapeHtml(data.hash || "")}">Copy</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(popup);

  const close = () => popup.remove();
  popup.querySelector(".popup-close").onclick = close;
  popup.onclick = (e) => {
    if (e.target === popup) close();
  };
  popup.querySelector(".popup-content")?.addEventListener("pointerdown", (e) =>
    e.stopPropagation(),
  );

  popup.querySelectorAll(".trigger-word").forEach((el) => {
    el.onclick = () => copyToClipboard(el.textContent, el);
  });
  const copyAllBtn = popup.querySelector(".copy-all-btn");
  if (copyAllBtn) {
    copyAllBtn.onclick = (e) =>
      copyToClipboard(e.currentTarget.dataset.text, e.currentTarget);
  }
  const copyHashBtn = popup.querySelector(".hash-section .copy-btn");
  if (copyHashBtn) {
    copyHashBtn.onclick = (e) =>
      copyToClipboard(e.currentTarget.dataset.text, e.currentTarget);
  }
}
