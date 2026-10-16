import { autocompleteAction, autocompleteLookup } from "./api.js";
import { getUiPref } from "./prefs.js";

const DEBOUNCE_MS = 70;
const MAX_ITEMS = 50;
const POPUP_MAX_HEIGHT = 240;
/** Same floor as backend segment ingest. */
const MIN_SAVE_LEN = 2;

let activePopup = null;
let debounceTimer = null;

function normalizeSide(side) {
    if (
        side === "negative" ||
        side === "neg" ||
        side === "str_neg"
    )
        return "neg";
    return "pos";
}

/** Current segment being typed: from last comma/newline to caret. */
export function currentSegment(value, caret) {
    const text = value || "";
    const pos = Math.max(
        0,
        Math.min(caret ?? text.length, text.length),
    );
    let start = 0;
    for (let i = pos - 1; i >= 0; i -= 1) {
        const ch = text[i];
        if (ch === "," || ch === "\n") {
            start = i + 1;
            break;
        }
    }
    return {
        start,
        end: pos,
        raw: text.slice(start, pos),
        prefix: text.slice(start, pos).replace(/^\s+/, ""),
    };
}

function dismissPopup() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    if (!activePopup) return;
    activePopup.abort?.abort();
    activePopup.root?.remove();
    activePopup = null;
}

function ensurePopupRoot() {
    if (activePopup?.root?.isConnected)
        return activePopup.root;
    const root = document.createElement("div");
    root.className = "pc-ac-popup";
    document.body.appendChild(root);
    return root;
}

function caretViewportRect(textarea, caretIndex) {
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const props = [
        "direction",
        "boxSizing",
        "width",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "fontStyle",
        "letterSpacing",
        "textTransform",
        "textAlign",
        "lineHeight",
        "wordWrap",
        "wordBreak",
        "overflowWrap",
        "tabSize",
    ];
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.overflow = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.top = "0";
    mirror.style.left = "-9999px";
    for (const prop of props) {
        mirror.style[prop] = style[prop];
    }
    // Wrap like the textarea content box (exclude scrollbar gutter).
    mirror.style.width = `${textarea.clientWidth}px`;

    mirror.textContent = textarea.value.slice(
        0,
        caretIndex,
    );
    const marker = document.createElement("span");
    // Trailing char keeps offset for empty end-of-line.
    marker.textContent =
        textarea.value.slice(caretIndex, caretIndex + 1) ||
        "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const taRect = textarea.getBoundingClientRect();
    let lineHeight = parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        lineHeight =
            marker.offsetHeight ||
            parseFloat(style.fontSize) * 1.35 ||
            16;
    }

    const top =
        taRect.top +
        marker.offsetTop -
        textarea.scrollTop +
        parseFloat(style.borderTopWidth || "0");
    const left =
        taRect.left +
        marker.offsetLeft -
        textarea.scrollLeft +
        parseFloat(style.borderLeftWidth || "0");
    mirror.remove();
    return { top, left, lineHeight };
}

function placePopup(state) {
    const { root, textarea, segment } = state;
    const caret = caretViewportRect(textarea, segment.end);
    const width = Math.min(
        340,
        Math.max(
            220,
            Math.floor(textarea.clientWidth * 0.72),
        ),
    );
    root.style.width = `${width}px`;
    root.style.maxHeight = `${POPUP_MAX_HEIGHT}px`;

    const pad = 8;
    const gap = 20;
    const actualHeight = Math.min(
        POPUP_MAX_HEIGHT,
        root.scrollHeight ||
            root.getBoundingClientRect().height ||
            POPUP_MAX_HEIGHT,
    );

    // Sit clearly under the current line so the typed segment stays visible.
    const below =
        caret.top + Math.max(caret.lineHeight, 18) + gap;
    const roomBelow = window.innerHeight - pad - below;
    const preferAbove =
        roomBelow < Math.min(actualHeight, 160) &&
        caret.top - pad > roomBelow;

    const top = preferAbove
        ? Math.max(pad, caret.top - actualHeight - gap)
        : Math.max(pad, below);

    // Follow the caret; only clamp so the list stays on screen.
    let left = caret.left;
    left = Math.min(left, window.innerWidth - width - pad);
    left = Math.max(pad, left);

    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
}

function applyCompletion(textarea, segment, text) {
    const value = textarea.value || "";
    const before = value.slice(0, segment.start);
    const after = value.slice(segment.end);
    const leading = (value
        .slice(segment.start, segment.end)
        .match(/^\s*/) || [""])[0];
    const next = `${before}${leading}${text}${after}`;
    const caret = (before + leading + text).length;
    textarea.value = next;
    textarea.selectionStart = caret;
    textarea.selectionEnd = caret;
    textarea.dispatchEvent(
        new Event("input", { bubbles: true }),
    );
}

function makeCreateItem(prefix) {
    return { kind: "create", text: prefix };
}

function isCreateItem(item) {
    return item?.kind === "create";
}

async function saveSegmentToLib(side, text) {
    const result = await autocompleteAction({
        action: "add",
        side: normalizeSide(side),
        text,
    });
    return Boolean(result?.ok);
}

function renderItems(state) {
    const { root, items, selected, onPick } = state;
    root.replaceChildren();
    items.forEach((item, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const selectedCls = index === selected ? " selected" : "";
        if (isCreateItem(item)) {
            btn.className = "pc-ac-item pc-ac-item-create" + selectedCls;
            const main = document.createElement("div");
            main.className = "pc-ac-item-main";
            main.textContent = item.text;
            const hint = document.createElement("div");
            hint.className = "pc-ac-item-hint";
            hint.textContent = "Tab to save";
            btn.append(main, hint);
            btn.title = `Save “${item.text}” to dictionary`;
        } else {
            btn.className = "pc-ac-item" + selectedCls;
            btn.textContent = item.text;
            btn.title = item.text;
        }
        btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onPick(item);
        });
        root.appendChild(btn);
    });
    const selectedEl = root.children[selected];
    if (selectedEl?.scrollIntoView) {
        selectedEl.scrollIntoView({ block: "nearest" });
    }
}

async function showSuggestions(textarea, side, segment) {
    const prefix = segment.prefix;
    if (!prefix || prefix.length < 1) {
        dismissPopup();
        return;
    }

    const abort = new AbortController();
    const reuse =
        activePopup?.textarea === textarea &&
        activePopup?.root?.isConnected;
    if (activePopup && !reuse) {
        activePopup.abort?.abort();
        activePopup.root?.remove();
        activePopup = null;
    } else if (activePopup) {
        activePopup.abort?.abort();
    }

    const root = ensurePopupRoot();
    const prevSelectedKey =
        reuse && activePopup.items?.[activePopup.selected]
            ? `${activePopup.items[activePopup.selected].kind || "match"}:${activePopup.items[activePopup.selected].text}`
            : null;

    const state = {
        root,
        textarea,
        side,
        segment,
        items: reuse ? activePopup.items : [],
        selected: reuse ? activePopup.selected : 0,
        abort,
        async onPick(item) {
            if (isCreateItem(item)) {
                const ok = await saveSegmentToLib(side, item.text);
                if (!ok) return;
                dismissPopup();
                textarea.focus();
                return;
            }
            applyCompletion(textarea, segment, item.text);
            dismissPopup();
            textarea.focus();
        },
    };
    activePopup = state;
    placePopup(state);

    try {
        const result = await autocompleteLookup(
            normalizeSide(side),
            prefix,
            MAX_ITEMS,
        );
        if (activePopup !== state || abort.signal.aborted)
            return;
        const needle = prefix.toLowerCase();
        const raw = result.items || [];
        const hasExact = raw.some(
            (row) => String(row.text || "").toLowerCase() === needle,
        );
        const matches = raw
            .filter(
                (row) =>
                    String(row.text || "").toLowerCase() !==
                    needle,
            )
            .slice(0, MAX_ITEMS)
            .map((row) => ({ kind: "match", text: row.text }));

        if (matches.length) {
            state.items = matches;
        } else if (hasExact) {
            // Already in the dictionary — nothing to suggest or save.
            dismissPopup();
            return;
        } else if (prefix.trim().length >= MIN_SAVE_LEN) {
            // Nothing in the letter bucket — offer to save the typed segment.
            state.items = [makeCreateItem(prefix.trim())];
        } else {
            dismissPopup();
            return;
        }

        if (prevSelectedKey) {
            const keep = state.items.findIndex(
                (row) =>
                    `${row.kind || "match"}:${row.text}` ===
                    prevSelectedKey,
            );
            state.selected = keep >= 0 ? keep : 0;
        } else {
            state.selected = 0;
        }
        renderItems(state);
        placePopup(state);
    } catch {
        if (activePopup === state) dismissPopup();
    }
}

function scheduleSuggest(textarea, side) {
    if (!getUiPref("promptAutocomplete")) {
        dismissPopup();
        return;
    }
    const segment = currentSegment(
        textarea.value,
        textarea.selectionStart,
    );
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        showSuggestions(textarea, side, segment);
    }, DEBOUNCE_MS);
}

function stopKey(e) {
    e.preventDefault();
    e.stopPropagation();
}

/**
 * Bind VS Code-style autocomplete to a positive/negative textarea.
 */
export function bindPromptAutocomplete(textarea, side) {
    if (!textarea || textarea.dataset.pcAcBound) return;
    textarea.dataset.pcAcBound = "1";

    textarea.addEventListener("input", () =>
        scheduleSuggest(textarea, side),
    );
    textarea.addEventListener("click", () => {
        if (getUiPref("promptAutocomplete"))
            scheduleSuggest(textarea, side);
    });
    textarea.addEventListener("blur", () => {
        setTimeout(() => {
            if (document.activeElement !== textarea)
                dismissPopup();
        }, 120);
    });

    // Capture so Comfy/LiteGraph hotkeys don't steal Tab / arrows.
    textarea.addEventListener(
        "keydown",
        (e) => {
            if (!getUiPref("promptAutocomplete")) return;
            const popup = activePopup;
            if (
                !popup?.items?.length ||
                popup.textarea !== textarea
            ) {
                if (e.key === "Escape") dismissPopup();
                return;
            }

            if (e.key === "ArrowDown") {
                stopKey(e);
                popup.selected =
                    (popup.selected + 1) %
                    popup.items.length;
                renderItems(popup);
                return;
            }
            if (e.key === "ArrowUp") {
                stopKey(e);
                popup.selected =
                    (popup.selected -
                        1 +
                        popup.items.length) %
                    popup.items.length;
                renderItems(popup);
                return;
            }
            if (e.key === "Tab") {
                stopKey(e);
                const item = popup.items[popup.selected];
                if (item) popup.onPick(item);
                return;
            }
            if (e.key === "Escape") {
                stopKey(e);
                dismissPopup();
            }
        },
        true,
    );
}

export function isAutocompleteEnabled() {
    return Boolean(getUiPref("promptAutocomplete"));
}
