# Prompt Concatenate Pro

**Modular prompts for ComfyUI — stack blocks, pin fields, reuse pairs, ship looks.**

One node replaces the endless scroll of concatenated text widgets. Split your prompt into **groups** (skin, lighting, outfit, background…), toggle and reorder them, and get two clean outputs: **`str_pos`** and **`str_neg`**.

Built-in **SQLite library**: save **layout presets** (slot stacks), save **prompt pairs** per collection, and manage everything from a single **Library manager** — no more copy-paste archaeology.

MIT — see [LICENSE](LICENSE) © StoneZol · [Changelog](changelog/CHANGELOG.md)

![Prompt Concatenate Pro node with groups](docs/screenshots/0.png)

---

## Why Prompt Concatenate Pro?

| Without                                        | With Prompt Concatenate Pro                                  |
| ---------------------------------------------- | -------------------------------------------------- |
| One giant positive string                      | Named blocks you can enable/disable                |
| Re-paste the same skin/lighting every workflow | Save & load pairs from a library                   |
| Rebuild slot lists by hand                     | Save & load full layout presets                    |
| Favorites panel chaos                          | Pin **positive/negative** per group to the sidebar |

---

## Features

- **Group cards** — title, positive, negative, drag reorder, priority, collapse, duplicate, per-group enable toggle
- **Join engine** — merges enabled groups with `, `, skips empty, normalizes commas and spacing
- **Pin to sidebar** — each group's pos/neg appears in ComfyUI Inputs / Favorites (`Group | positive`, `Group | negative`)
- **Duplicate pairs** — copy a group as `Title (2)` while Save/Load still use the base shelf (`Pose`)
- **Loaded pair tracking** — after Load, the card shows **Loaded · name**; **×** detaches the link; Save prefills name, collection, and notes
- **Layout presets (Stacks)** — save the current slot list + order; optional folder; edit slots as comma-separated text in the manager
- **Prompt pairs** — save/load pos+neg per **collection** (e.g. shelf named after the slot)
- **Smart library search** — AND tokens; `shelf\keyword` filters a collection first; optional **Search in prompts** for body text
- **Library manager** — rename, move, delete, edit, and **duplicate** stacks & prompts; prefs (Show empty / Search in prompts / Other collections) persist in SQLite
- **Local SQLite** — `db/presets.sqlite`, auto-created on first use

---

## Install

1. Clone into `ComfyUI/custom_nodes/`:

    ```bash
    git clone https://github.com/StoneZol/prompt-concatenate-pro.git
    ```

2. Restart ComfyUI (or refresh the browser after a hot reload).

3. Add node: **`Prompt Concatenate Pro`** (same folder name in the node picker).

No pip dependencies — Python 3.8+ stdlib + SQLite only.

---

## Quick start

1. Add **Prompt Concatenate Pro** to your graph.
2. **Add group** — name it (`skin`, `lighting`, …), fill positive / negative.
3. Connect **`str_pos`** → CLIP Text Encode (positive), **`str_neg`** as needed.
4. **Save preset** — snapshot your current slot layout (names + order).
5. On a group card: **Save pair** / **Load pair** — store or recall that block's prompts in a collection.
6. **Manage library** — edit, duplicate, move, or delete saved stacks and prompts.

### Save a layout preset

Snapshot the current slots (`Skin · Bg · Light`) into a named stack, optionally in a folder.

![Save preset dialog](docs/screenshots/1.png)

### Save a prompt pair

From a group card, store that block's positive / negative under a collection (defaults to the group title).

![Save pair dialog](docs/screenshots/2.png)

### Load a layout

Search stacks by folder and apply the slot list back onto the node.

![Load preset dialog](docs/screenshots/3.png)

### Load a pair

Browse the current collection (or other collections). Search by name/notes, or use `shelf\keyword` to narrow a collection first. Toggle **Search in prompts** when you need hits inside positive/negative text. Click the document icon to preview before loading.

![Load pair with prompt preview](docs/screenshots/4.png)

![Load pair search](docs/screenshots/1.2.0/1.png)

After load, the group shows which library item is attached — Save will prefill that name and notes; **×** clears the link only.

![Loaded pair chip](docs/screenshots/1.2.0/0.png)

---

## Concepts

### Groups (on the node)

Live editing surface. Each group has `title`, `positive`, `negative`, order, and `enabled`.  
Sidebar labels (`Skin | positive`) are stamped **when the group is created**. Renaming the group on the node is local — it does **not** rewrite those labels and does **not** rename library collections.

### Stacks (layout presets)

Saved from **Save preset** in the node header.  
Stores **slot names + order** only (empty pairs). Optional **folder**; default bucket is **Uncategorised**.

### Prompt pairs

Saved from **Save pair** on a group card.  
Stored in a **collection** (defaults to the group's title). Includes title, notes, positive, negative.

### Collections vs folders

| Term           | Used for                | Table            |
| -------------- | ----------------------- | ---------------- |
| **Folder**     | Layout presets (stacks) | `layout_folders` |
| **Collection** | Prompt pairs            | `categories`     |

Collections are created when you **Save pair**, not when you save a layout preset.

---

## Pinning to the sidebar

Each group exposes two hidden STRING widgets for ComfyUI's native pin UI:

- `Skin | positive`
- `Skin | negative`

Pin them from the node **Inputs** panel or **Favorites**. Edits sync both ways with the group card.

---

## Library manager

**Manage library** (full-width button under Save / Load preset):

- **Stacks** — layout presets by folder; rename folder, move stack, delete, **duplicate** (`Name` → `Name (2)`), edit slots as `Base, Scene, …`
- **Prompts** — pairs by collection; full editor for metadata + prompt text; **duplicate** to fork a version
- **Show empty** — reveal empty folders / collections
- **Search in prompts** — include positive/negative body in search (off by default)
- Search on both tabs (`name or shelf\keyword`); toggle prefs persist in SQLite

![Library manager · Stacks](docs/screenshots/5.png)

![Library manager · Prompts](docs/screenshots/6.png)

![Duplicate in library manager](docs/screenshots/1.2.0/4.png)

Edit a prompt in a centered dialog: name, collection, notes stay fixed; positive / negative scroll independently.

![Edit prompt dialog](docs/screenshots/7.png)

![Edit stack slots](docs/screenshots/1.2.0/2.png)

---

## Join preview (debug)

Optional console logging while tuning join behavior.

In `js/pc/config.json`:

```json
"debug_join": true
```

Or in the browser console:

```js
localStorage.setItem("pc-debug-join", "1"); // on
localStorage.setItem("pc-debug-join", "0"); // off
```

Python also logs joined strings when the node executes (`[PromptConcatenatePro] str_pos …` in the terminal).

Set `"debug_join": false` before release if you don't need it.

---

## Known issues

- **Vue Nodes 2.0** — toggling Vue mode can briefly leave duplicate layout glitches on the canvas; refresh the page to heal. Layout data in the widget is unaffected.
- **Two installs** — ComfyUI loads every folder in `custom_nodes`. If Prompt Concatenate Pro is there twice (for example a git clone **and** a Manager/registry install), you get two nodes, two `presets.sqlite` files, and HTTP routes registered from whichever copy loaded first. Keep a single folder.

---

## File layout

```
prompt-concatenate-pro/
├── nodes.py              # Join logic, PromptCraft node
├── routes.py             # REST API for library
├── db/
│   ├── db.py             # SQLite CRUD
│   └── presets.sqlite    # created at runtime
├── js/
│   ├── prompt_craft.js   # Node UI entry
│   └── pc/               # Dialogs, manager, API client
├── changelog/
│   └── CHANGELOG.md      # Release notes
└── docs/screenshots/     # README images
```

---

## Links

- Repository: https://github.com/StoneZol/prompt-concatenate-pro
- Changelog: [changelog/CHANGELOG.md](changelog/CHANGELOG.md)
- ComfyUI Registry: install via **Manager** → search **Prompt Concatenate Pro**

---

**If Prompt Concatenate Pro saves you time, star the repo — it helps others find it.**
