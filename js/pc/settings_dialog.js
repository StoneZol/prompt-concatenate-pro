import { openPopup } from "./popup.js";
import { ensureUiPrefs, getUiPref, setUiPref } from "./prefs.js";
import { TEXT_ICON_SVG } from "./icons.js";
import { bindInfoTip, hidePromptTip } from "./preview_tip.js";

const EMBED_CLIP_META_HELP = {
  title: "Embed prompts in CLIP for PNG meta",
  text:
    "Off (default): wires stay connected — workflows loaded from images keep Prompt Concatenate Pro linked to CLIP.\n\n" +
    "On: before queue, joined text is written into stock CLIP Text Encode fields (as if typed) so Civitai-style readers see prompts. " +
    "The workflow saved in the PNG may show CLIP filled and Concatenate Pro disconnected — re-link after load if needed.",
};

function makeSettingRow({ label, prefKey, help }) {
  const row = document.createElement("div");
  row.className = "pc-toggle-row pc-settings-row";

  const toggle = document.createElement("div");
  const on = Boolean(getUiPref(prefKey));
  toggle.className = "pc-toggle" + (on ? " on" : "");
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", on ? "true" : "false");
  toggle.title = label;

  const knob = document.createElement("div");
  knob.className = "pc-toggle-knob";
  toggle.appendChild(knob);

  const labelEl = document.createElement("div");
  labelEl.className = "pc-settings-label";
  labelEl.textContent = label;

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "pc-preset-peek pc-settings-info";
  infoBtn.title = "About this setting";
  infoBtn.innerHTML = TEXT_ICON_SVG;
  bindInfoTip(infoBtn, () => help);

  let enabled = on;
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    enabled = !enabled;
    toggle.classList.toggle("on", enabled);
    toggle.setAttribute("aria-checked", enabled ? "true" : "false");
    setUiPref(prefKey, enabled);
  });

  row.append(toggle, labelEl, infoBtn);
  return row;
}

/**
 * Node settings: toggles with info tips (same peek pattern as Load pair).
 */
export async function openSettingsPopup({ anchor } = {}) {
  await ensureUiPrefs();

  openPopup({
    title: "Settings",
    anchor,
    width: 360,
    onClose: hidePromptTip,
    render(body) {
      const list = document.createElement("div");
      list.className = "pc-settings-list";
      list.appendChild(
        makeSettingRow({
          label: "Embed prompts in CLIP for PNG meta",
          prefKey: "embedClipMeta",
          help: EMBED_CLIP_META_HELP,
        }),
      );

      const footer = document.createElement("div");
      footer.className = "pc-settings-footer";
      footer.textContent =
        "New experimental or contested features will show up here as they appear.";

      body.append(list, footer);
    },
  });
}
