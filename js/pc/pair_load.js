import {
    CHEVRON_ICON_SVG,
    LOAD_ICON_SVG,
    PLUS_ICON_SVG,
    TEXT_ICON_SVG,
} from "./icons.js";
import { openConfirmPopup, openPopup } from "./popup.js";
import { listPresets } from "./api.js";
import {
    bindPromptTip,
    hidePromptTip,
} from "./preview_tip.js";
import { makePairPreviewBtn, presetPreviewUrl } from "./pair_preview.js";
import {
    getUiPref,
    setUiPref,
    ensureUiPrefs,
} from "./prefs.js";
import {
    fillWithQueryHighlight,
    matchesPromptPreset,
    parseSearchQuery,
} from "./search.js";
import {
    isInShelfTree,
    makeShelfCrumbs,
    makeShelfFolderRow,
    normalizeShelfPath,
    shelfChildren,
    shelfLeaf,
    shelfSegments,
} from "./shelf_paths.js";

function shelfCounts(presets) {
    const counts = new Map();
    for (const preset of presets) {
        const name = normalizeShelfPath(preset.category);
        if (!name) continue;
        const key = name.toLowerCase();
        const entry = counts.get(key) || { name, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
    }
    return [...counts.values()];
}

const DESC_PREVIEW_CHARS = 60;

function makePromptCard(preset, { onLoad, onAppend, query = "" }) {
    const card = document.createElement("div");
    card.className = "pc-preset-item";

    const head = document.createElement("div");
    head.className = "pc-preset-head";

    const name = document.createElement("div");
    name.className = "pc-preset-name";
    fillWithQueryHighlight(name, preset.title || "Untitled", query);

    const coverBtn = makePairPreviewBtn(
        () => (preset.hasPreview ? presetPreviewUrl(preset, preset.updated_at || "") : ""),
        { className: "pc-pair-preview-btn" },
    );
    coverBtn.hidden = !preset.hasPreview;

    const peekBtn = document.createElement("button");
    peekBtn.type = "button";
    peekBtn.className = "pc-preset-peek";
    peekBtn.title = "Preview information";
    peekBtn.innerHTML = TEXT_ICON_SVG;
    bindPromptTip(peekBtn, () => ({
        positive: preset.positive,
        negative: preset.negative,
    }));

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "pc-preset-load";
    loadBtn.title = "Replace with this pair";
    loadBtn.innerHTML = LOAD_ICON_SVG;
    loadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePromptTip();
        onLoad?.(preset);
    });

    const appendBtn = document.createElement("button");
    appendBtn.type = "button";
    appendBtn.className = "pc-preset-append";
    appendBtn.title = "Append to current prompts";
    appendBtn.innerHTML = PLUS_ICON_SVG;
    appendBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePromptTip();
        onAppend?.(preset);
    });

    head.append(coverBtn, name, peekBtn, loadBtn, appendBtn);
    card.appendChild(head);

    const description = (preset.description || "").trim();
    if (!description) return card;

    const descRow = document.createElement("div");
    descRow.className = "pc-preset-desc-row";

    const desc = document.createElement("div");
    desc.className = "pc-preset-desc";

    const long = description.length > DESC_PREVIEW_CHARS;
    const short = long
        ? `${description.slice(0, DESC_PREVIEW_CHARS).trimEnd()}…`
        : description;
    desc.textContent = short;
    descRow.appendChild(desc);

    if (long) {
        card.classList.add("desc-long", "desc-collapsed");
        const collapseBtn =
            document.createElement("button");
        collapseBtn.type = "button";
        collapseBtn.className = "pc-preset-collapse";
        collapseBtn.innerHTML = CHEVRON_ICON_SVG;

        function applyCollapsed() {
            const collapsed = card.classList.contains(
                "desc-collapsed",
            );
            desc.textContent = collapsed
                ? short
                : description;
            collapseBtn.title = collapsed
                ? "Expand notes"
                : "Collapse notes";
            collapseBtn.setAttribute(
                "aria-expanded",
                collapsed ? "false" : "true",
            );
        }

        collapseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            card.classList.toggle("desc-collapsed");
            applyCollapsed();
        });

        descRow.appendChild(collapseBtn);
        applyCollapsed();
    }

    card.appendChild(descRow);
    return card;
}

function makeFolder({
    title,
    presets,
    expanded,
    onLoad,
    onAppend,
    children = [],
    count,
    tooltip,
    query = "",
}) {
    const folder = document.createElement("div");
    folder.className = "pc-preset-folder";
    if (!expanded) folder.classList.add("collapsed");

    const head = document.createElement("button");
    head.type = "button";
    head.className = "pc-preset-folder-head";

    const chevron = document.createElement("span");
    chevron.className = "pc-preset-folder-chevron";
    chevron.innerHTML = CHEVRON_ICON_SVG;

    const label = document.createElement("span");
    label.className = "pc-preset-folder-name";
    fillWithQueryHighlight(label, title, query);
    if (tooltip) label.title = tooltip;

    const countEl = document.createElement("span");
    countEl.className = "pc-preset-folder-count";
    countEl.textContent = String(count ?? presets.length);

    head.append(chevron, label, countEl);
    head.title = expanded
        ? "Collapse folder"
        : "Expand folder";
    head.setAttribute(
        "aria-expanded",
        expanded ? "true" : "false",
    );

    const body = document.createElement("div");
    body.className = "pc-preset-folder-body";
    for (const child of children) {
        body.appendChild(child);
    }
    for (const preset of presets) {
        body.appendChild(
            makePromptCard(preset, { onLoad, onAppend, query }),
        );
    }

    head.addEventListener("click", (e) => {
        e.stopPropagation();
        const collapsed =
            folder.classList.toggle("collapsed");
        head.title = collapsed
            ? "Expand folder"
            : "Collapse folder";
        head.setAttribute(
            "aria-expanded",
            collapsed ? "false" : "true",
        );
    });

    folder.append(head, body);
    return folder;
}

function buildCategoryTree(presets) {
    const root = { path: "", items: [], children: new Map() };
    for (const preset of presets) {
        const path =
            normalizeShelfPath(preset.category) || "Uncategorised";
        let node = root;
        for (const segment of shelfSegments(path)) {
            const key = segment.toLowerCase();
            if (!node.children.has(key)) {
                node.children.set(key, {
                    path: node.path ? `${node.path}/${segment}` : segment,
                    items: [],
                    children: new Map(),
                });
            }
            node = node.children.get(key);
        }
        node.items.push(preset);
    }
    return root;
}

function treeTotal(node) {
    return (
        node.items.length +
        [...node.children.values()].reduce((sum, child) => sum + treeTotal(child), 0)
    );
}

function categoryRank(name, priorityNames) {
    const key = String(name || "").toLowerCase();
    const exact = priorityNames.findIndex((p) => p === key);
    if (exact !== -1) return exact;
    const nested = priorityNames.findIndex(
        (p) => key && (p === key || p.startsWith(key + "/") || key.startsWith(p + "/")),
    );
    return nested === -1 ? priorityNames.length : nested;
}

function paintList(
    list,
    presets,
    {
        query,
        others,
        currentCategory,
        loadedCategory,
        onLoad,
        onAppend,
        includeBody,
        quietEmpty = false,
    },
) {
    hidePromptTip();
    const q = (query || "").trim().toLowerCase();
    const matched = presets.filter((preset) =>
        matchesPromptPreset(preset, query, { includeBody }),
    );
    list.replaceChildren();
    if (!matched.length) {
        if (quietEmpty) return;
        const empty = document.createElement("div");
        empty.className = "pc-popup-message";
        empty.textContent = q
            ? "No prompts"
            : others
              ? "No saved prompts yet."
              : "No prompts in this collection.";
        list.appendChild(empty);
        return;
    }

    if (!others) {
        for (const preset of matched) {
            list.appendChild(
                makePromptCard(preset, {
                    onLoad,
                    onAppend,
                    query: q,
                }),
            );
        }
        return;
    }

    // Priority: 1) category of what's loaded in the slot, 2) slot's own shelf.
    const priorityNames = [];
    const loaded = normalizeShelfPath(loadedCategory).toLowerCase();
    const shelf = normalizeShelfPath(currentCategory).toLowerCase();
    if (loaded) priorityNames.push(loaded);
    if (shelf && shelf !== loaded) priorityNames.push(shelf);

    const root = buildCategoryTree(matched);
    const sorted = (node) =>
        [...node.children.values()].sort((a, b) => {
            const rankDiff =
                categoryRank(a.path, priorityNames) -
                categoryRank(b.path, priorityNames);
            if (rankDiff !== 0) return rankDiff;
            return shelfLeaf(a.path).localeCompare(shelfLeaf(b.path), undefined, {
                sensitivity: "base",
            });
        });

    const shouldExpand = (path) => {
        if (q) return true;
        const key = path.toLowerCase();
        return priorityNames.some(
            (p) => p === key || p.startsWith(key + "/") || key.startsWith(p + "/"),
        );
    };

    const renderNode = (node) => {
        const isUncat = node.path.toLowerCase() === "uncategorised";
        return makeFolder({
            title: isUncat ? node.path : shelfLeaf(node.path),
            tooltip: isUncat ? undefined : node.path,
            query: q,
            presets: node.items,
            count: treeTotal(node),
            children: sorted(node).map(renderNode),
            expanded: shouldExpand(node.path),
            onLoad,
            onAppend,
        });
    };

    for (const node of sorted(root)) {
        list.appendChild(renderNode(node));
    }
}

export async function openLoadPairPopup({
    anchor,
    category,
    loadedCategory = "",
    onPick,
    onAppend,
    nested = false,
}) {
    const shelf = normalizeShelfPath(category);
    const loadedShelf = normalizeShelfPath(loadedCategory);
    if (!shelf) {
        openConfirmPopup({
            nested,
            anchor,
            title: "Load pair",
            message: "Name the pair first.",
            confirmLabel: "OK",
            showCancel: false,
            danger: false,
        });
        return;
    }
    await ensureUiPrefs();
    return openPopup({
        nested,
        anchor,
        title: shelf ? `Load pair · ${shelf}` : "Load pair",
        width: 680,
        onClose: hidePromptTip,
        render(body, { close, reposition }) {
            const status = document.createElement("div");
            status.className = "pc-popup-message";
            status.textContent = "Loading…";
            body.appendChild(status);

            let own = [];
            let all = null;
            // If the slot already holds a pair from another collection, open Other collections.
            const loadedElsewhere =
                Boolean(loadedShelf) && !isInShelfTree(loadedShelf, shelf);
            let root = shelf;
            let path = loadedShelf && !loadedElsewhere ? loadedShelf : shelf;

            const nav = document.createElement("div");
            nav.className = "pc-load-shelf-nav";
            let others = Boolean(
                getUiPref("otherCollections"),
            ) || loadedElsewhere;
            let includeBody = Boolean(
                getUiPref("searchInPrompts"),
            );

            const search = document.createElement("input");
            search.className = "pc-popup-input";
            search.type = "text";
            search.placeholder = "name or shelf\\keyword";

            const extra = document.createElement("div");
            extra.className = "pc-toggle-row";

            const toggle = document.createElement("div");
            toggle.className =
                "pc-toggle" + (others ? " on" : "");
            toggle.setAttribute("role", "switch");
            toggle.setAttribute(
                "aria-checked",
                others ? "true" : "false",
            );
            const knob = document.createElement("div");
            knob.className = "pc-toggle-knob";
            toggle.appendChild(knob);

            const extraLabel =
                document.createElement("span");
            extraLabel.textContent = "Other collections";

            extra.append(toggle, extraLabel);

            const bodyRow = document.createElement("div");
            bodyRow.className = "pc-toggle-row";

            const bodyToggle =
                document.createElement("div");
            bodyToggle.className =
                "pc-toggle" + (includeBody ? " on" : "");
            bodyToggle.setAttribute("role", "switch");
            bodyToggle.setAttribute(
                "aria-checked",
                includeBody ? "true" : "false",
            );
            const bodyKnob = document.createElement("div");
            bodyKnob.className = "pc-toggle-knob";
            bodyToggle.appendChild(bodyKnob);

            const bodyLabel =
                document.createElement("span");
            bodyLabel.textContent = "Search in prompts";

            bodyRow.append(bodyToggle, bodyLabel);

            const list = document.createElement("div");
            list.className = "pc-preset-list";

            const handleLoad = (picked) => {
                close();
                onPick?.(picked);
            };

            const handleAppend = (picked) => {
                close();
                onAppend?.(picked);
            };

            function currentItems() {
                return others && all ? all : own;
            }

            function paint() {
                nav.replaceChildren();
                const browsing = !others && !search.value.trim();
                if (!browsing) {
                    paintList(list, currentItems(), {
                        query: search.value,
                        others: true,
                        currentCategory: path,
                        loadedCategory: loadedShelf,
                        onLoad: handleLoad,
                        onAppend: handleAppend,
                        includeBody,
                    });
                    reposition();
                    return;
                }

                const children = shelfChildren(shelfCounts(own), path);
                const atRoot = path.toLowerCase() === root.toLowerCase();
                if (!atRoot || children.length) {
                    nav.appendChild(
                        makeShelfCrumbs({
                            path,
                            root,
                            onNavigate: (target) => {
                                path = target;
                                paint();
                            },
                        }),
                    );
                }
                for (const child of children) {
                    nav.appendChild(
                        makeShelfFolderRow({
                            leaf: child.leaf,
                            total: child.total,
                            title: child.path,
                            onOpen: () => {
                                path = child.path;
                                paint();
                            },
                        }),
                    );
                }
                const key = path.toLowerCase();
                const here = own.filter(
                    (preset) =>
                        normalizeShelfPath(preset.category).toLowerCase() === key,
                );
                paintList(list, here, {
                    query: "",
                    others: false,
                    currentCategory: path,
                    loadedCategory: loadedShelf,
                    onLoad: handleLoad,
                    onAppend: handleAppend,
                    includeBody,
                    quietEmpty: children.length > 0,
                });
                reposition();
            }

            async function enableOthers({
                persist = true,
            } = {}) {
                if (!all) {
                    extraLabel.textContent = "Loading…";
                    const result = await listPresets();
                    if (!result.ok) {
                        extraLabel.textContent =
                            "Other collections";
                        throw new Error(
                            result.error ||
                                "Failed to load prompts",
                        );
                    }
                    all = result.presets || [];
                }
                others = true;
                toggle.classList.add("on");
                toggle.setAttribute("aria-checked", "true");
                extraLabel.textContent =
                    "Other collections";
                if (persist)
                    setUiPref("otherCollections", true);
                paint();
            }

            toggle.addEventListener("click", (e) => {
                e.stopPropagation();
                if (others) {
                    others = false;
                    toggle.classList.remove("on");
                    toggle.setAttribute(
                        "aria-checked",
                        "false",
                    );
                    setUiPref("otherCollections", false);
                    paint();
                    return;
                }
                enableOthers().catch((err) => {
                    status.textContent =
                        err?.message ||
                        "Failed to load prompts";
                    if (!status.isConnected)
                        body.prepend(status);
                    reposition();
                });
            });

            bodyToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                includeBody = !includeBody;
                bodyToggle.classList.toggle(
                    "on",
                    includeBody,
                );
                bodyToggle.setAttribute(
                    "aria-checked",
                    includeBody ? "true" : "false",
                );
                setUiPref("searchInPrompts", includeBody);
                paint();
            });

            search.addEventListener("input", () => {
                const { hasShelfFilter } = parseSearchQuery(
                    search.value,
                );
                if (hasShelfFilter && !others) {
                    enableOthers({ persist: false }).catch(
                        (err) => {
                            status.textContent =
                                err?.message ||
                                "Failed to load prompts";
                            if (!status.isConnected)
                                body.prepend(status);
                            reposition();
                        },
                    );
                    return;
                }
                paint();
            });

            listPresets({ category: shelf, recursive: true })
                .then(async (result) => {
                    if (!result.ok) {
                        status.textContent =
                            result.error ||
                            "Failed to load prompts";
                        reposition();
                        return;
                    }
                    own = result.presets || [];
                    if (
                        own.length &&
                        !own.some((preset) => isInShelfTree(preset.category, root))
                    ) {
                        root = normalizeShelfPath(own[0].category);
                        path = root;
                    }
                    status.remove();
                    body.append(
                        search,
                        extra,
                        bodyRow,
                        nav,
                        list,
                    );
                    if (others) {
                        try {
                            await enableOthers({
                                persist: false,
                            });
                        } catch (err) {
                            others = false;
                            toggle.classList.remove("on");
                            toggle.setAttribute(
                                "aria-checked",
                                "false",
                            );
                            status.textContent =
                                err?.message ||
                                "Failed to load prompts";
                            body.prepend(status);
                            paint();
                        }
                    } else {
                        paint();
                    }
                    requestAnimationFrame(() =>
                        search.focus(),
                    );
                })
                .catch((err) => {
                    status.textContent =
                        err?.message ||
                        "Failed to load prompts";
                    reposition();
                });
        },
    });
}

export function confirmReplacePair({ anchor, onConfirm, nested = false }) {
    if (getUiPref("skipPairReplaceConfirm")) {
        onConfirm?.();
        return;
    }
    openConfirmPopup({
        nested,
        anchor,
        title: "Load pair",
        message: "Replace current prompts with this pair?",
        confirmLabel: "Replace",
        cancelLabel: "Cancel",
        danger: true,
        onConfirm,
    });
}

export function confirmClearPair({ anchor, onConfirm, nested = false }) {
    if (getUiPref("skipPairReplaceConfirm")) {
        onConfirm?.();
        return;
    }
    openConfirmPopup({
        nested,
        anchor,
        title: "Clear pair",
        message: "Clear positive / negative for this pair?",
        confirmLabel: "Clear",
        cancelLabel: "Cancel",
        danger: true,
        onConfirm,
    });
}
