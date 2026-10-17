import { openPopup } from "./popup.js";
import { ensureUiPrefs, getUiPref, setUiPref } from "./prefs.js";
import { TEXT_ICON_SVG } from "./icons.js";
import { bindInfoTip, hidePromptTip } from "./preview_tip.js";
import { rebuildAutocomplete } from "./api.js";
import { makeBusyLine } from "./busy.js";

const EMBED_CLIP_META_HELP = {
  title: "Embed prompts in CLIP for PNG meta",
  text:
    "Off (default): wires stay connected — workflows loaded from images keep Prompt Concatenate Pro linked to CLIP.\n\n" +
    "On: before queue, joined text is written into stock CLIP Text Encode fields (as if typed) so Civitai-style readers see prompts. " +
    "The workflow saved in the PNG may show CLIP filled and Concatenate Pro disconnected — re-link after load if needed.",
};

const AUTOCOMPLETE_HELP = {
  title: "Prompt autocomplete",
  text:
    "Experimental. Off by default.\n\n" +
    "When on, typing in positive/negative fields suggests segments from your saved pairs " +
    "and from the autocomplete dictionary (comma / newline separated; weights stripped). " +
    "Dictionaries are stored per side (pos/neg) in letter buckets.\n\n" +
    "Manage the dictionary in Library manager → Suggest. " +
    "Scrollable list at the caret (letter bucket only). Tab accepts a suggestion; " +
    "if nothing matches, Tab saves the typed segment. Esc closes; Enter still inserts a newline.",
};

function makeSettingRow({ label, prefKey, help, badge, onToggle }) {
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

  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = "pc-settings-badge";
    badgeEl.textContent = badge;
    labelEl.appendChild(document.createTextNode(" "));
    labelEl.appendChild(badgeEl);
  }

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "pc-preset-peek pc-settings-info";
  infoBtn.title = "About this setting";
  infoBtn.innerHTML = TEXT_ICON_SVG;
  bindInfoTip(infoBtn, () => help);

  let enabled = on;
  let locked = false;
  toggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (locked) return;
    enabled = !enabled;
    toggle.classList.toggle("on", enabled);
    toggle.setAttribute("aria-checked", enabled ? "true" : "false");
    setUiPref(prefKey, enabled);
    const result = onToggle?.(enabled, {
      setBusy(next) {
        locked = Boolean(next);
        toggle.style.pointerEvents = locked ? "none" : "";
        toggle.style.opacity = locked ? "0.55" : "";
      },
    });
    if (result && typeof result.then === "function") {
      locked = true;
      toggle.style.pointerEvents = "none";
      toggle.style.opacity = "0.55";
      try {
        await result;
      } finally {
        locked = false;
        toggle.style.pointerEvents = "";
        toggle.style.opacity = "";
      }
    }
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
    width: 380,
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

      const acBusy = makeBusyLine({ className: "pc-settings-busy" });
      list.appendChild(
        makeSettingRow({
          label: "Prompt autocomplete",
          prefKey: "promptAutocomplete",
          help: AUTOCOMPLETE_HELP,
          badge: "experimental",
          async onToggle(enabled, { setBusy } = {}) {
            if (!enabled) {
              acBusy.hide();
              return;
            }
            setBusy?.(true);
            acBusy.show("Building dictionary from library…");
            try {
              const result = await rebuildAutocomplete((msg) => {
                if (msg.phase === "start" && !msg.total) {
                  acBusy.progress({
                    current: 0,
                    total: 0,
                    percent: 100,
                    message: "No pairs in library yet",
                  });
                  return;
                }
                acBusy.progress(msg);
              });
              if (!result.ok) {
                acBusy.error(result.error || "Rebuild failed");
                return;
              }
              const n = result.presets ?? result.total ?? 0;
              acBusy.done(
                `Dictionary ready · scanned ${n} pair${n === 1 ? "" : "s"}`,
              );
            } catch (err) {
              acBusy.error(err?.message || "Rebuild failed");
            } finally {
              setBusy?.(false);
            }
          },
        }),
      );
      list.appendChild(acBusy.el);

      const footer = document.createElement("div");
      footer.className = "pc-settings-footer";
      footer.textContent =
        "New experimental or contested features will show up here as they appear.";

      body.append(list, footer);
    },
  });
}
