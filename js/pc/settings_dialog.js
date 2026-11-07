import { openPopup } from "./popup.js";
import { ensureUiPrefs, getUiPref, setUiPref } from "./prefs.js";
import { TEXT_ICON_SVG } from "./icons.js";
import { bindInfoTip, hidePromptTip } from "./preview_tip.js";
import { rebuildAutocomplete } from "./api.js";
import { makeBusyLine } from "./busy.js";

const EMBED_CLIP_META_HELP = {
  title: "Embed prompts in CLIP for PNG meta",
  text:
    "Per node — stored with this node in the workflow.\n\n" +
    "Off (default): wires stay connected — workflows loaded from images keep Prompt Concatenate Pro linked to CLIP.\n\n" +
    "On: before queue, joined text is written into stock CLIP Text Encode fields (as if typed) so Civitai-style readers see prompts. " +
    "The workflow saved in the PNG may show CLIP filled and Concatenate Pro disconnected — re-link after load if needed.",
};

const AUTOCOMPLETE_HELP = {
  title: "Prompt autocomplete",
  text:
    "Off by default. Saved in SQLite (all nodes).\n\n" +
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
    "Per node — the External pair lives on this node (position saved in presets/workflows).\n\n" +
    "When on, this node gets an External pair and two STRING inputs " +
    "(external_pos / external_neg). Wire any prompts into them — External can be reordered " +
    "and enabled/disabled like other pairs, but has no Save / Load.\n\n" +
    "Wired values show in the Comfy console print on run.",
};

const SKIP_PAIR_REPLACE_HELP = {
  title: "Skip pair overwrite confirms",
  text:
    "Off by default. Saved in SQLite (all nodes).\n\n" +
    "When on, skips “Replace current prompts?” on Load pair and “Clear positive / negative?” on Clear. " +
    "Applies on the node and in Edit template.\n\n" +
    "Does not affect Delete group, preset/template replace, or Suggest rename.",
};

function makeSectionLabel(text, variant = "node") {
  const el = document.createElement("div");
  el.className = `pc-settings-section pc-settings-section-${variant}`;
  el.textContent = text;
  return el;
}

function makeSettingRow({
  label,
  help,
  badge,
  disabled = false,
  onToggle,
  getEnabled,
  /** If set, writes SQLite pref. Otherwise caller handles state in onToggle only. */
  prefKey,
}) {
  const row = document.createElement("div");
  row.className = "pc-toggle-row pc-settings-row";

  const toggle = document.createElement("div");
  const on = Boolean(getEnabled ? getEnabled() : prefKey ? getUiPref(prefKey) : false);
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
 * Node settings: per-node toggles + global SQLite toggles.
 * @param {object} [nodeSettings]
 * @param {() => boolean} nodeSettings.getEmbedClipMeta
 * @param {(v: boolean) => void} nodeSettings.setEmbedClipMeta
 * @param {() => boolean} nodeSettings.getExternalPrompt
 * @param {(v: boolean) => void} nodeSettings.setExternalPrompt
 */
export async function openSettingsPopup({ anchor, nodeSettings } = {}) {
  await ensureUiPrefs();

  openPopup({
    title: "Settings",
    anchor,
    width: 380,
    onClose: hidePromptTip,
    render(body) {
      const list = document.createElement("div");
      list.className = "pc-settings-list";

      list.appendChild(makeSectionLabel("This node", "node"));
      list.appendChild(
        makeSettingRow({
          label: "Embed prompts in CLIP for PNG meta",
          help: EMBED_CLIP_META_HELP,
          getEnabled: () => Boolean(nodeSettings?.getEmbedClipMeta?.()),
          onToggle(enabled) {
            nodeSettings?.setEmbedClipMeta?.(enabled);
          },
        }).el,
      );
      list.appendChild(
        makeSettingRow({
          label: "External prompt",
          help: EXTERNAL_PROMPT_HELP,
          getEnabled: () => Boolean(nodeSettings?.getExternalPrompt?.()),
          onToggle(enabled) {
            nodeSettings?.setExternalPrompt?.(enabled);
          },
        }).el,
      );

      list.appendChild(makeSectionLabel("Saved · SQLite", "saved"));
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

      const footer = document.createElement("div");
      footer.className = "pc-settings-footer";
      footer.textContent =
        "This node settings travel with the workflow. Saved settings apply to all Prompt Concatenate Pro nodes.";

      body.append(list, footer);
    },
  });
}
