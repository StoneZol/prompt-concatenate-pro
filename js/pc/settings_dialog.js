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
    "if nothing matches (or only longer hits like “sweet dreams” for typed “sweet”), " +
    "an Add row at the bottom saves the typed segment with Tab. Esc closes; Enter still inserts a newline.",
};

const EXTERNAL_PROMPT_HELP = {
  title: "External prompt",
  text:
    "Off by default.\n\n" +
    "When on, the node gets an External pair in the group list and two STRING inputs " +
    "(external_pos / external_neg). Wire any prompts into them — External can be reordered " +
    "and enabled/disabled like other pairs, but has no Save / Load.\n\n" +
    "Layout presets store External’s position (special id). If this toggle is off when you " +
    "load a preset, that slot is skipped.",
};

const EXTERNAL_DEBUG_HELP = {
  title: "Write external debug snapshot",
  text:
    "Debug only. Requires External prompt.\n\n" +
    "When on, after each run the External card’s info tip shows the text that arrived on " +
    "the inputs. Snapshots are kept in memory for the session tip — avoid relying on them " +
    "in saved workflows.\n\n" +
    "Past generations can still stick in workflow / PNG meta if other tools serialize node " +
    "state. Keep this off for normal work; turn on only while debugging wires.",
};

const SKIP_PAIR_REPLACE_HELP = {
  title: "Skip pair overwrite confirms",
  text:
    "Off by default.\n\n" +
    "When on, skips “Replace current prompts?” on Load pair and “Clear positive / negative?” on Clear. " +
    "Applies on the node and in Edit template.\n\n" +
    "Does not affect Delete group, preset/template replace, or Suggest rename.",
};

function makeSettingRow({
  label,
  prefKey,
  help,
  badge,
  disabled = false,
  onToggle,
  getEnabled,
  setEnabledVisual,
}) {
  const row = document.createElement("div");
  row.className = "pc-toggle-row pc-settings-row";

  const toggle = document.createElement("div");
  const on = Boolean(getEnabled ? getEnabled() : getUiPref(prefKey));
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
  let isDisabled = Boolean(disabled);

  function applyDisabled() {
    row.classList.toggle("pc-settings-row-disabled", isDisabled);
    toggle.style.pointerEvents = isDisabled || locked ? "none" : "";
    toggle.style.opacity = isDisabled ? "0.4" : locked ? "0.55" : "";
    toggle.setAttribute("aria-disabled", isDisabled ? "true" : "false");
  }

  function paintEnabled(next) {
    enabled = Boolean(next);
    toggle.classList.toggle("on", enabled);
    toggle.setAttribute("aria-checked", enabled ? "true" : "false");
  }

  toggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (locked || isDisabled) return;
    enabled = !enabled;
    paintEnabled(enabled);
    if (prefKey) setUiPref(prefKey, enabled);
    const result = onToggle?.(enabled, {
      setBusy(next) {
        locked = Boolean(next);
        applyDisabled();
      },
    });
    if (result && typeof result.then === "function") {
      locked = true;
      applyDisabled();
      try {
        await result;
      } finally {
        locked = false;
        applyDisabled();
      }
    }
  });

  applyDisabled();
  row.append(toggle, labelEl, infoBtn);

  setEnabledVisual?.(paintEnabled);

  return {
    el: row,
    setDisabled(next) {
      isDisabled = Boolean(next);
      applyDisabled();
    },
    setOn(next) {
      paintEnabled(next);
    },
    isOn: () => enabled,
  };
}

/**
 * Node settings: toggles with info tips (same peek pattern as Load pair).
 */
export async function openSettingsPopup({ anchor, onExternalPromptChange } = {}) {
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
        }).el,
      );

      list.appendChild(
        makeSettingRow({
          label: "Skip pair overwrite confirms",
          prefKey: "skipPairReplaceConfirm",
          help: SKIP_PAIR_REPLACE_HELP,
        }).el,
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
        }).el,
      );
      list.appendChild(acBusy.el);

      const featureOn = Boolean(getUiPref("externalPrompt"));
      let debugRow = null;

      const externalRow = makeSettingRow({
        label: "External prompt",
        prefKey: "externalPrompt",
        help: EXTERNAL_PROMPT_HELP,
        onToggle(enabled) {
          if (!enabled) {
            setUiPref("externalDebugSnapshot", false);
            debugRow?.setOn(false);
          }
          debugRow?.setDisabled(!enabled);
          onExternalPromptChange?.(enabled);
        },
      });
      list.appendChild(externalRow.el);

      debugRow = makeSettingRow({
        label: "Write external debug snapshot",
        prefKey: "externalDebugSnapshot",
        help: EXTERNAL_DEBUG_HELP,
        badge: "debug",
        disabled: !featureOn,
        getEnabled: () =>
          featureOn && Boolean(getUiPref("externalDebugSnapshot")),
      });
      // Sync visual with coerced state when feature was off.
      if (!featureOn && getUiPref("externalDebugSnapshot")) {
        setUiPref("externalDebugSnapshot", false);
        debugRow.setOn(false);
      }
      list.appendChild(debugRow.el);

      const footer = document.createElement("div");
      footer.className = "pc-settings-footer";
      footer.textContent =
        "New experimental or contested features will show up here as they appear.";

      body.append(list, footer);
    },
  });
}
