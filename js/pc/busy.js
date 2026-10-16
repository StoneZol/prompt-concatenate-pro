/** Small shared busy / progress line for Settings + Suggest. */

export function makeBusyLine({ className = "" } = {}) {
  const el = document.createElement("div");
  el.className = "pc-busy" + (className ? ` ${className}` : "");
  el.hidden = true;

  const head = document.createElement("div");
  head.className = "pc-busy-head";

  const spin = document.createElement("span");
  spin.className = "pc-busy-spinner";
  spin.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "pc-busy-text";

  head.append(spin, text);

  const track = document.createElement("div");
  track.className = "pc-busy-track";
  track.hidden = true;
  const fill = document.createElement("div");
  fill.className = "pc-busy-fill";
  track.appendChild(fill);

  const detail = document.createElement("div");
  detail.className = "pc-busy-detail";
  detail.hidden = true;

  el.append(head, track, detail);

  function setBar(percent) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    track.hidden = false;
    fill.style.width = `${pct}%`;
  }

  return {
    el,
    show(message) {
      el.hidden = false;
      el.classList.remove("is-done", "is-error");
      spin.hidden = false;
      text.textContent = message || "Working…";
      track.hidden = true;
      fill.style.width = "0%";
      detail.hidden = true;
      detail.textContent = "";
    },
    progress({ percent, current, total, label, message, stage, unit, presets } = {}) {
      el.hidden = false;
      el.classList.remove("is-done", "is-error");
      spin.hidden = false;
      const pct =
        percent != null
          ? percent
          : total
            ? Math.round((current / total) * 100)
            : 0;
      if (message) {
        text.textContent = message;
      } else if (stage === "write") {
        // Letter buckets being flushed, not pairs.
        text.textContent = `Writing buckets… ${current || 0}/${total || 0} (${pct}%)`;
      } else if (total != null) {
        text.textContent = `Parsing pairs… ${current || 0}/${total} (${pct}%)`;
      } else {
        text.textContent = `Building dictionary… ${pct}%`;
      }
      setBar(pct);
      if (label) {
        detail.hidden = false;
        detail.textContent =
          stage === "write" && presets != null
            ? `${label} · ${presets} pairs`
            : label;
      }
    },
    done(message) {
      el.hidden = false;
      el.classList.add("is-done");
      el.classList.remove("is-error");
      spin.hidden = true;
      text.textContent = message || "Done";
      setBar(100);
      detail.hidden = true;
      detail.textContent = "";
    },
    error(message) {
      el.hidden = false;
      el.classList.add("is-error");
      el.classList.remove("is-done");
      spin.hidden = true;
      text.textContent = message || "Failed";
      track.hidden = true;
      detail.hidden = true;
      detail.textContent = "";
    },
    hide() {
      el.hidden = true;
      el.classList.remove("is-done", "is-error");
      spin.hidden = false;
      text.textContent = "";
      track.hidden = true;
      fill.style.width = "0%";
      detail.hidden = true;
      detail.textContent = "";
    },
  };
}
