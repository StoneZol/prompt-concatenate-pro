import { listCategories } from "./api.js";
import { openPopup } from "./popup.js";

/**
 * Name a new group/pair slot: free text + shelves that already have saved pairs.
 */
export function openAddGroupPopup({
  anchor,
  title = "Add group",
  placeholder = "pair name",
  confirmLabel = "Add",
  nested = false,
  existingTitles = [],
  validate,
  onSubmit,
} = {}) {
  const taken = new Set(
    (existingTitles || []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean),
  );

  return openPopup({
    anchor,
    title,
    width: 280,
    nested,
    render(body, { close }) {
      const input = document.createElement("input");
      input.className = "pc-popup-input";
      input.type = "text";
      input.placeholder = placeholder;

      const errorEl = document.createElement("div");
      errorEl.className = "pc-popup-error pc-add-group-error";

      const actions = document.createElement("div");
      actions.className = "pc-popup-actions";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "pc-popup-btn primary";
      confirm.textContent = confirmLabel;
      actions.appendChild(confirm);

      const groupsBlock = document.createElement("div");
      groupsBlock.className = "pc-add-group-block";

      const hint = document.createElement("div");
      hint.className = "pc-add-group-hint";
      hint.textContent = "Groups";

      const list = document.createElement("div");
      list.className = "pc-pick-list pc-add-group-list";

      groupsBlock.append(hint, list);

      let names = [];

      function showError(message) {
        errorEl.textContent = message || "";
        input.classList.toggle("invalid", !!message);
      }

      function submit(raw) {
        const value = String(raw ?? input.value).trim();
        input.value = value;
        const error = validate?.(value);
        if (error) {
          showError(error);
          input.focus();
          return;
        }
        close();
        onSubmit?.(value);
      }

      function paintList() {
        const q = input.value.trim().toLowerCase();
        list.replaceChildren();

        const shown = names.filter((name) => {
          const key = name.toLowerCase();
          if (taken.has(key)) return false;
          if (q && !key.includes(q)) return false;
          return true;
        });

        if (!names.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = "No groups yet";
          list.appendChild(empty);
          return;
        }

        if (!shown.length) {
          const empty = document.createElement("div");
          empty.className = "pc-popup-message";
          empty.textContent = "No matches";
          list.appendChild(empty);
          return;
        }

        for (const name of shown) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pc-pick-item";
          btn.textContent = name;
          btn.title = name;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            submit(name);
          });
          list.appendChild(btn);
        }
      }

      confirm.addEventListener("click", (e) => {
        e.stopPropagation();
        submit();
      });

      input.addEventListener("input", () => {
        if (errorEl.textContent) showError("");
        paintList();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });

      body.append(input, errorEl, actions, groupsBlock);
      requestAnimationFrame(() => input.focus());

      list.replaceChildren();
      const loading = document.createElement("div");
      loading.className = "pc-popup-message";
      loading.textContent = "Loading…";
      list.appendChild(loading);

      listCategories().then((result) => {
        if (!result.ok) {
          list.replaceChildren();
          const err = document.createElement("div");
          err.className = "pc-popup-message";
          err.textContent = result.error || "Failed to load groups";
          list.appendChild(err);
          return;
        }
        // Only shelves that already have at least one saved pair (not empty leftovers).
        names = (result.categories || [])
          .filter((c) => Number(c?.count || 0) > 0)
          .map((c) => String(c?.name || "").trim())
          .filter(Boolean);
        paintList();
      });
    },
  });
}
