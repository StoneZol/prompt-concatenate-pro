import { openPopup } from "./popup.js";
import { ensureUiPrefs, getUiPref, setUiPref } from "./prefs.js";

/**
 * Node settings: PNG CLIP meta materialize toggle (SQLite pref).
 */
export async function openSettingsPopup({ anchor } = {}) {
  await ensureUiPrefs();

  openPopup({
    title: "Settings",
    anchor,
    width: 360,
    render(body) {
      const row = document.createElement("div");
      row.className = "pc-toggle-row pc-settings-row";

      const toggle = document.createElement("div");
      const on = Boolean(getUiPref("embedClipMeta"));
      toggle.className = "pc-toggle" + (on ? " on" : "");
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", on ? "true" : "false");
      toggle.title = "Write joined prompts into CLIP text for PNG metadata";

      const knob = document.createElement("div");
      knob.className = "pc-toggle-knob";
      toggle.appendChild(knob);

      const label = document.createElement("div");
      label.className = "pc-settings-label";
      label.textContent = "Embed prompts in CLIP for PNG meta";

      row.append(toggle, label);

      const hint = document.createElement("div");
      hint.className = "pc-settings-hint";
      hint.textContent =
        "Off (default): wires stay connected — workflows loaded from images keep Prompt Concatenate Pro linked to CLIP.\n\n" +
        "On: before queue, joined text is written into stock CLIP Text Encode fields (as if typed) so Civitai-style readers see prompts. " +
        "The workflow saved in the PNG may show CLIP filled and Concatenate Pro disconnected — re-link after load if needed.";

      let enabled = on;
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        enabled = !enabled;
        toggle.classList.toggle("on", enabled);
        toggle.setAttribute("aria-checked", enabled ? "true" : "false");
        setUiPref("embedClipMeta", enabled);
      });

      body.append(row, hint);
    },
  });
}
