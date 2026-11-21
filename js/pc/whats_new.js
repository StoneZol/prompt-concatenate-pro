import { fetchWhatsNew } from "./api.js";
import { openPopup } from "./popup.js";
import { ensureUiPrefs, getUiPref, setUiPref } from "./prefs.js";

let checked = false;
let open = false;

function markSeen(version) {
  const ver = String(version || "").trim();
  if (!ver) return;
  if (getUiPref("lastSeenChangelog") === ver) return;
  setUiPref("lastSeenChangelog", ver);
}

function sectionHasContent(section) {
  return (section?.items || []).some(
    (item) =>
      (item?.type === "bullet" && item.text) ||
      (item?.type === "image" && item.url),
  );
}

/**
 * Once per Comfy session: if package version ≠ lastSeenChangelog, show short notes.
 */
export async function maybeShowWhatsNew() {
  if (checked || open) return;
  checked = true;

  try {
    await ensureUiPrefs();
    const data = await fetchWhatsNew();
    if (!data?.ok) return;

    const version = String(data.version || "").trim();
    if (!version) return;
    if (getUiPref("lastSeenChangelog") === version) return;

    const sections = Array.isArray(data.sections) ? data.sections : [];
    const hasContent = sections.some(sectionHasContent) || Boolean(data.note);
    if (!hasContent) {
      markSeen(version);
      return;
    }

    const name = String(data.name || "Prompt Concatenate Pro").trim();
    open = true;
    openPopup({
      centered: true,
      width: 560,
      title: `${name} · What's new · ${version}`,
      onClose: () => {
        open = false;
        markSeen(version);
      },
      render(body, { close }) {
        const scroll = document.createElement("div");
        scroll.className = "pc-whats-new";

        for (const section of sections) {
          const items = section?.items || [];
          if (!sectionHasContent(section) && !section?.title) continue;

          const block = document.createElement("div");
          block.className = "pc-whats-new-section";

          if (section.title) {
            const head = document.createElement("div");
            head.className = "pc-whats-new-heading";
            head.textContent = section.title;
            block.appendChild(head);
          }

          let list = null;
          const flushList = () => {
            if (!list) return;
            block.appendChild(list);
            list = null;
          };

          for (const item of items) {
            if (item?.type === "bullet" && item.text) {
              if (!list) {
                list = document.createElement("ul");
                list.className = "pc-whats-new-list";
              }
              const li = document.createElement("li");
              li.textContent = item.text;
              list.appendChild(li);
              continue;
            }
            if (item?.type === "image" && item.url) {
              flushList();
              const figure = document.createElement("figure");
              figure.className = "pc-whats-new-figure";
              const img = document.createElement("img");
              img.className = "pc-whats-new-img";
              img.src = item.url;
              img.alt = item.alt || "";
              img.loading = "lazy";
              figure.appendChild(img);
              if (item.alt) {
                const cap = document.createElement("figcaption");
                cap.className = "pc-whats-new-cap";
                cap.textContent = item.alt;
                figure.appendChild(cap);
              }
              block.appendChild(figure);
            }
          }
          flushList();
          scroll.appendChild(block);
        }

        const note = String(data.note || "").trim();
        if (note) {
          const noteEl = document.createElement("div");
          noteEl.className = "pc-whats-new-note";
          noteEl.textContent = note;
          scroll.appendChild(noteEl);
        }

        const actions = document.createElement("div");
        actions.className = "pc-popup-actions pc-whats-new-actions";

        const full = document.createElement("a");
        full.className = "pc-popup-btn";
        full.href = data.changelogUrl || "#";
        full.target = "_blank";
        full.rel = "noopener noreferrer";
        full.textContent = "Full changelog";
        full.addEventListener("click", (e) => e.stopPropagation());

        const gotIt = document.createElement("button");
        gotIt.type = "button";
        gotIt.className = "pc-popup-btn primary";
        gotIt.textContent = "Got it";
        gotIt.addEventListener("click", (e) => {
          e.stopPropagation();
          close();
        });

        actions.append(full, gotIt);
        body.append(scroll, actions);
      },
    });
  } catch {
    /* never block the node on changelog */
  }
}
