"""SQLite library: layout presets (empty slots) and category shelves."""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
from typing import Dict, List, Optional, Tuple

_lock = threading.Lock()

UNCATEGORISED_NAME = "Uncategorised"


def _db_dir() -> str:
    directory = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(directory, exist_ok=True)
    return directory


def _db_path() -> str:
    return os.path.join(_db_dir(), "presets.sqlite")


def _previews_dir() -> str:
    path = os.path.join(_db_dir(), "previews")
    os.makedirs(path, exist_ok=True)
    return path


_PREVIEW_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
_PREVIEW_MAX_BYTES = 2 * 1024 * 1024
_FS_BAD = re.compile(r'[<>:"|?*\x00-\x1f]')
_FS_SEG_MAX = 80


def _normalize_preview_ext(ext: str = ".jpg") -> str:
    ext = (ext or ".jpg").lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ext not in _PREVIEW_EXTS:
        return ".jpg"
    return ext


def _safe_fs_segment(raw: str) -> str:
    text = _FS_BAD.sub("_", str(raw or "").strip()).strip(" .")
    text = text.replace("\\", "_").replace("/", "_")
    if not text:
        return "_"
    if len(text) > _FS_SEG_MAX:
        text = text[:_FS_SEG_MAX].rstrip(" .") or "_"
    return text


def _preview_rel_for_pair(category: str, title: str, ext: str = ".jpg") -> str:
    """Disk key: previews/{shelf}/{…}/{pairTitle}.jpg — mirrors library path."""
    ext = _normalize_preview_ext(ext)
    shelf = _normalize_shelf_path(category)
    parts = [_safe_fs_segment(part) for part in shelf.split(SHELF_SEP) if part.strip()]
    leaf = _safe_fs_segment(title)
    parts.append(leaf)
    return "previews/" + "/".join(parts) + ext


def _preview_rel_for_id(preset_id: int, ext: str = ".jpg") -> str:
    """Legacy id-based file (kept for old rows until rewrite/relocate)."""
    return f"previews/{int(preset_id)}{_normalize_preview_ext(ext)}"


def _preview_abs(rel: str) -> Optional[str]:
    raw = (rel or "").strip().replace("\\", "/")
    if not raw or ".." in raw.split("/"):
        return None
    if not raw.startswith("previews/"):
        return None
    root = os.path.realpath(_previews_dir())
    candidate = os.path.realpath(os.path.join(_db_dir(), raw))
    try:
        if os.path.commonpath([root, candidate]) != root:
            return None
    except ValueError:
        return None
    return candidate


def _unlink_preview_file(rel: str) -> None:
    path = _preview_abs(rel)
    if not path:
        return
    try:
        if os.path.isfile(path):
            os.remove(path)
        # Drop empty parent dirs under previews/.
        parent = os.path.dirname(path)
        root = os.path.realpath(_previews_dir())
        while parent and os.path.commonpath([root, parent]) == root and parent != root:
            try:
                os.rmdir(parent)
            except OSError:
                break
            parent = os.path.dirname(parent)
    except OSError:
        pass


def _relocate_preview_file(old_rel: str, new_rel: str) -> str:
    """Move preview on disk when pair/shelf is renamed. Returns rel that should be stored."""
    new_rel = (new_rel or "").strip().replace("\\", "/")
    old_rel = (old_rel or "").strip().replace("\\", "/")
    if not new_rel:
        return ""
    if old_rel == new_rel:
        path = _preview_abs(new_rel)
        return new_rel if path and os.path.isfile(path) else old_rel
    new_abs = _preview_abs(new_rel)
    if not new_abs:
        return old_rel
    old_abs = _preview_abs(old_rel) if old_rel else None
    if old_abs and os.path.isfile(old_abs):
        os.makedirs(os.path.dirname(new_abs), exist_ok=True)
        if os.path.realpath(old_abs) != os.path.realpath(new_abs):
            try:
                os.replace(old_abs, new_abs)
            except OSError:
                import shutil

                shutil.move(old_abs, new_abs)
            _unlink_preview_file(old_rel)  # cleans empty dirs; file already moved
            # If replace left nothing at old path, unlink is no-op for file.
        return new_rel
    if os.path.isfile(new_abs):
        return new_rel
    return old_rel


def _ext_from_mime(mime: str) -> str:
    key = (mime or "").strip().lower()
    if key in ("image/jpeg", "image/jpg"):
        return ".jpg"
    if key == "image/png":
        return ".png"
    if key == "image/webp":
        return ".webp"
    if key == "image/gif":
        return ".gif"
    return ".jpg"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    _migrate(conn)
    conn.commit()
    return conn


def _table_columns(conn: sqlite3.Connection, table: str) -> set:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(name)
        );

        CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
            title TEXT NOT NULL COLLATE NOCASE,
            description TEXT NOT NULL DEFAULT '',
            positive TEXT NOT NULL DEFAULT '',
            negative TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(category_id, title)
        );

        CREATE TABLE IF NOT EXISTS layout_folders (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(name)
        );

        CREATE TABLE IF NOT EXISTS layouts (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            description TEXT NOT NULL DEFAULT '',
            slots TEXT NOT NULL,
            folder_id INTEGER REFERENCES layout_folders(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(name)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS template_folders (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(name)
        );

        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE,
            description TEXT NOT NULL DEFAULT '',
            slots TEXT NOT NULL,
            folder_id INTEGER REFERENCES template_folders(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(name)
        );
        """
    )
    if _table_columns(conn, "layouts") and "folder_id" not in _table_columns(conn, "layouts"):
        conn.execute(
            "ALTER TABLE layouts ADD COLUMN folder_id INTEGER REFERENCES layout_folders(id) ON DELETE SET NULL"
        )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_layouts_folder_id ON layouts(folder_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_layouts_name ON layouts(name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_presets_category_id ON presets(category_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_templates_folder_id ON templates(folder_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name)")
    if _table_columns(conn, "presets") and "preview_path" not in _table_columns(conn, "presets"):
        conn.execute(
            "ALTER TABLE presets ADD COLUMN preview_path TEXT NOT NULL DEFAULT ''"
        )
    _migrate_category_paths(conn)
    _migrate_folder_paths(conn)
    _migrate_name_paths(conn)
    _migrate_scoped_item_names(conn)


SHELF_SEP = "/"
LEGACY_SHELF_SEP = "|"
_CATEGORY_PATHS_FLAG = "migration_category_paths_v1"
_FOLDER_PATHS_FLAG = "migration_folder_paths_v1"
_NAME_PATHS_FLAG = "migration_name_paths_v1"
_SCOPED_NAMES_FLAG = "migration_scoped_item_names_v1"


def _escape_slash_names(conn: sqlite3.Connection, table: str) -> None:
    rows = conn.execute(
        f"SELECT id, name FROM {table} WHERE instr(name, ?) > 0", (SHELF_SEP,)
    ).fetchall()
    for row in rows:
        base = (row["name"] or "").replace(SHELF_SEP, LEGACY_SHELF_SEP)
        candidate = base
        suffix = 2
        while conn.execute(
            f"SELECT 1 FROM {table} WHERE name = ? COLLATE NOCASE AND id != ?",
            (candidate, int(row["id"])),
        ).fetchone():
            candidate = f"{base} ({suffix})"
            suffix += 1
        conn.execute(
            f"UPDATE {table} SET name = ? WHERE id = ?",
            (candidate, int(row["id"])),
        )


def _migrate_category_paths(conn: sqlite3.Connection) -> None:
    """One-time: `/` becomes the path separator, so legacy names with `/` turn into `|`."""
    done = conn.execute(
        "SELECT 1 FROM settings WHERE key = ?", (_CATEGORY_PATHS_FLAG,)
    ).fetchone()
    if done:
        return

    _escape_slash_names(conn, "categories")

    for row in conn.execute("SELECT id, slots FROM templates").fetchall():
        try:
            slots = json.loads(row["slots"] or "[]")
        except Exception:
            continue
        if not isinstance(slots, list):
            continue
        changed = False
        for slot in slots:
            if not isinstance(slot, dict):
                continue
            loaded = slot.get("loadedCategory")
            if isinstance(loaded, str) and SHELF_SEP in loaded:
                slot["loadedCategory"] = loaded.replace(SHELF_SEP, LEGACY_SHELF_SEP)
                changed = True
        if changed:
            conn.execute(
                "UPDATE templates SET slots = ? WHERE id = ?",
                (json.dumps(slots, ensure_ascii=False), int(row["id"])),
            )

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (_CATEGORY_PATHS_FLAG, "1"),
    )


def _migrate_folder_paths(conn: sqlite3.Connection) -> None:
    """One-time: escape `/` in preset/template folder names before nested paths land."""
    done = conn.execute(
        "SELECT 1 FROM settings WHERE key = ?", (_FOLDER_PATHS_FLAG,)
    ).fetchone()
    if done:
        return
    _escape_slash_names(conn, "layout_folders")
    _escape_slash_names(conn, "template_folders")
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (_FOLDER_PATHS_FLAG, "1"),
    )


def _unique_title_in_category(
    conn: sqlite3.Connection, category_id: int, title: str, except_id: int
) -> str:
    candidate = title
    suffix = 2
    while conn.execute(
        """
        SELECT 1 FROM presets
        WHERE category_id = ? AND title = ? COLLATE NOCASE AND id != ?
        """,
        (category_id, candidate, except_id),
    ).fetchone():
        candidate = f"{title} ({suffix})"
        suffix += 1
    return candidate


def _unique_global_name(
    conn: sqlite3.Connection, table: str, title: str, except_id: int
) -> str:
    candidate = title
    suffix = 2
    while conn.execute(
        f"SELECT 1 FROM {table} WHERE name = ? COLLATE NOCASE AND id != ?",
        (candidate, except_id),
    ).fetchone():
        candidate = f"{title} ({suffix})"
        suffix += 1
    return candidate


def _migrate_name_paths(conn: sqlite3.Connection) -> None:
    """One-time: `folder + name/with/slash` → nested folder path + leaf name."""
    done = conn.execute(
        "SELECT 1 FROM settings WHERE key = ?", (_NAME_PATHS_FLAG,)
    ).fetchone()
    if done:
        return

    for row in conn.execute(
        """
        SELECT presets.id, presets.title, presets.category_id, categories.name AS category
        FROM presets
        JOIN categories ON categories.id = presets.category_id
        WHERE instr(presets.title, ?) > 0
        """,
        (SHELF_SEP,),
    ).fetchall():
        shelf, leaf = _split_path_name(row["category"] or "", row["title"] or "")
        if not leaf or leaf == (row["title"] or ""):
            continue
        category_id, _created = _get_or_create_category(conn, shelf)
        leaf = _unique_title_in_category(conn, category_id, leaf, int(row["id"]))
        conn.execute(
            "UPDATE presets SET category_id = ?, title = ? WHERE id = ?",
            (category_id, leaf, int(row["id"])),
        )

    for row in conn.execute(
        """
        SELECT layouts.id, layouts.name, layout_folders.name AS folder
        FROM layouts
        LEFT JOIN layout_folders ON layout_folders.id = layouts.folder_id
        WHERE instr(layouts.name, ?) > 0
        """,
        (SHELF_SEP,),
    ).fetchall():
        folder, leaf = _split_path_name(row["folder"] or "", row["name"] or "")
        if not leaf or leaf == (row["name"] or ""):
            continue
        folder_id = _get_or_create_folder(conn, folder)
        leaf = _unique_global_name(conn, "layouts", leaf, int(row["id"]))
        conn.execute(
            "UPDATE layouts SET folder_id = ?, name = ? WHERE id = ?",
            (folder_id, leaf, int(row["id"])),
        )

    for row in conn.execute(
        """
        SELECT templates.id, templates.name, template_folders.name AS folder
        FROM templates
        LEFT JOIN template_folders ON template_folders.id = templates.folder_id
        WHERE instr(templates.name, ?) > 0
        """,
        (SHELF_SEP,),
    ).fetchall():
        folder, leaf = _split_path_name(row["folder"] or "", row["name"] or "")
        if not leaf or leaf == (row["name"] or ""):
            continue
        folder_id = _get_or_create_template_folder(conn, folder)
        leaf = _unique_global_name(conn, "templates", leaf, int(row["id"]))
        conn.execute(
            "UPDATE templates SET folder_id = ?, name = ? WHERE id = ?",
            (folder_id, leaf, int(row["id"])),
        )

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (_NAME_PATHS_FLAG, "1"),
    )


def _migrate_scoped_item_names(conn: sqlite3.Connection) -> None:
    """Templates / presets: uniqueness is folder + name (like pairs), not global name."""
    done = conn.execute(
        "SELECT 1 FROM settings WHERE key = ?", (_SCOPED_NAMES_FLAG,)
    ).fetchone()
    if done:
        return

    def rebuild(table: str, folders_table: str) -> None:
        conn.executescript(
            f"""
            CREATE TABLE {table}__scoped (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL COLLATE NOCASE,
                description TEXT NOT NULL DEFAULT '',
                slots TEXT NOT NULL,
                folder_id INTEGER REFERENCES {folders_table}(id) ON DELETE SET NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO {table}__scoped (id, name, description, slots, folder_id, created_at, updated_at)
            SELECT id, name, description, slots, folder_id, created_at, updated_at FROM {table};
            DROP TABLE {table};
            ALTER TABLE {table}__scoped RENAME TO {table};
            CREATE INDEX IF NOT EXISTS idx_{table}_folder_id ON {table}(folder_id);
            CREATE INDEX IF NOT EXISTS idx_{table}_name ON {table}(name);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_name_uncat
                ON {table}(name COLLATE NOCASE) WHERE folder_id IS NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_folder_name
                ON {table}(folder_id, name COLLATE NOCASE) WHERE folder_id IS NOT NULL;
            """
        )

    rebuild("templates", "template_folders")
    rebuild("layouts", "layout_folders")
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (_SCOPED_NAMES_FLAG, "1"),
    )


def _find_named_in_folder(
    conn: sqlite3.Connection,
    table: str,
    name: str,
    folder_id: Optional[int],
    except_id: Optional[int] = None,
) -> Optional[sqlite3.Row]:
    if folder_id is None:
        sql = f"SELECT id FROM {table} WHERE folder_id IS NULL AND name = ? COLLATE NOCASE"
        params: List = [name]
    else:
        sql = f"SELECT id FROM {table} WHERE folder_id = ? AND name = ? COLLATE NOCASE"
        params = [int(folder_id), name]
    if except_id is not None:
        sql += " AND id != ?"
        params.append(int(except_id))
    return conn.execute(sql, params).fetchone()


def _normalize_shelf_path(name: str) -> str:
    parts = [part.strip() for part in (name or "").split(SHELF_SEP)]
    return SHELF_SEP.join(part for part in parts if part)


def _split_path_name(folder: str, name: str) -> Tuple[str, str]:
    """`Scene` + `Walk/Night` → (`Scene/Walk`, `Night`). Leaves spaces inside segments alone."""
    shelf = _normalize_shelf_path(folder)
    raw = (name or "").strip()
    if SHELF_SEP not in raw:
        return shelf, raw
    parts = [part.strip() for part in raw.split(SHELF_SEP) if part.strip()]
    if not parts:
        return shelf, ""
    if len(parts) == 1:
        return shelf, parts[0]
    prefix = SHELF_SEP.join(parts[:-1])
    leaf = parts[-1]
    combined = _normalize_shelf_path(f"{shelf}{SHELF_SEP}{prefix}" if shelf else prefix)
    return combined, leaf


def _in_shelf_tree(name: str, root: str) -> bool:
    key = (name or "").casefold()
    base = (root or "").casefold()
    return key == base or key.startswith(base + SHELF_SEP)


def _resolve_category_name(conn: sqlite3.Connection, name: str) -> str:
    """Exact collection name; falls back to the pre-path `|` spelling for old workflows."""
    row = conn.execute(
        "SELECT name FROM categories WHERE name = ? COLLATE NOCASE", (name,)
    ).fetchone()
    if row:
        return row["name"]
    if SHELF_SEP in name:
        legacy = name.replace(SHELF_SEP, LEGACY_SHELF_SEP)
        row = conn.execute(
            "SELECT name FROM categories WHERE name = ? COLLATE NOCASE", (legacy,)
        ).fetchone()
        if row:
            return row["name"]
    return name


def init_db() -> None:
    with _lock:
        conn = _connect()
        conn.close()


def _get_or_create_category(conn: sqlite3.Connection, name: str) -> Tuple[int, bool]:
    shelf = _normalize_shelf_path(name)
    row = conn.execute(
        "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
        (shelf,),
    ).fetchone()
    if row:
        return int(row["id"]), False
    cur = conn.execute("INSERT INTO categories (name) VALUES (?)", (shelf,))
    return int(cur.lastrowid), True


def _normalize_folder_name(name: str) -> str:
    return _normalize_shelf_path(name)


def _is_uncategorised(name: str) -> bool:
    return not name or name.casefold() == UNCATEGORISED_NAME.casefold()


def _get_or_create_folder(conn: sqlite3.Connection, name: str) -> Optional[int]:
    title = _normalize_folder_name(name)
    if _is_uncategorised(title):
        return None
    row = conn.execute(
        "SELECT id FROM layout_folders WHERE name = ? COLLATE NOCASE",
        (title,),
    ).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute("INSERT INTO layout_folders (name) VALUES (?)", (title,))
    return int(cur.lastrowid)


def _parse_slots(raw) -> List[str]:
    if isinstance(raw, list):
        data = raw
    else:
        try:
            data = json.loads(raw or "[]")
        except Exception:
            return []
    slots = []
    seen = set()
    for item in data if isinstance(data, list) else []:
        name = str(item).strip()
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        slots.append(name)
    return slots


def _layout_row(row: sqlite3.Row) -> Dict:
    folder = row["folder"] if "folder" in row.keys() else None
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "description": row["description"] or "",
        "slots": _parse_slots(row["slots"]),
        "folder": folder or "",
    }


def save_layout(
    name: str,
    description: str,
    slots: List,
    overwrite: bool = False,
    folder: str = "",
) -> Dict:
    folder_path, title = _split_path_name(folder, name)
    slot_names = _parse_slots(slots)
    if not title:
        return {"ok": False, "error": "Name is required"}
    if not slot_names:
        return {"ok": False, "error": "Add a group first"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            folder_id = _get_or_create_folder(conn, folder_path)
            folder_name = ""
            if folder_id:
                folder_row = conn.execute(
                    "SELECT name FROM layout_folders WHERE id = ?",
                    (folder_id,),
                ).fetchone()
                folder_name = folder_row["name"] if folder_row else folder_path

            existing = _find_named_in_folder(conn, "layouts", title, folder_id)
            if existing and not overwrite:
                conn.rollback()
                return {
                    "ok": False,
                    "conflicts": [{"name": title, "folder": folder_name or UNCATEGORISED_NAME}],
                }

            payload = json.dumps(slot_names, ensure_ascii=False)
            note = (description or "").strip()
            if existing:
                conn.execute(
                    """
                    UPDATE layouts
                    SET description = ?, slots = ?, folder_id = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (note, payload, folder_id, int(existing["id"])),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO layouts (name, description, slots, folder_id)
                    VALUES (?, ?, ?, ?)
                    """,
                    (title, note, payload, folder_id),
                )
            conn.commit()
            return {
                "ok": True,
                "name": title,
                "slots": slot_names,
                "folder": folder_name,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def list_layouts() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    layouts.id,
                    layouts.name,
                    layouts.description,
                    layouts.slots,
                    layout_folders.name AS folder
                FROM layouts
                LEFT JOIN layout_folders ON layout_folders.id = layouts.folder_id
                ORDER BY
                    CASE WHEN layout_folders.name IS NULL THEN 0 ELSE 1 END,
                    layout_folders.name COLLATE NOCASE,
                    layouts.name COLLATE NOCASE
                """
            ).fetchall()
            return {"ok": True, "layouts": [_layout_row(row) for row in rows]}
        finally:
            conn.close()


def _preset_has_preview(rel: str) -> bool:
    path = _preview_abs(rel)
    return bool(path and os.path.isfile(path))


def _preset_row(row: sqlite3.Row) -> Dict:
    keys = row.keys()
    preview = ""
    if "preview_path" in keys:
        preview = (row["preview_path"] or "").strip()
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "description": row["description"] or "",
        "positive": row["positive"] or "",
        "negative": row["negative"] or "",
        "category": row["category"] or "",
        "previewPath": preview,
        "hasPreview": _preset_has_preview(preview),
    }


def save_preset(
    category: str,
    title: str,
    description: str = "",
    positive: str = "",
    negative: str = "",
    overwrite: bool = False,
) -> Dict:
    shelf, name = _split_path_name(category, title)
    pos = positive or ""
    neg = negative or ""
    if not shelf:
        return {"ok": False, "error": "Name the pair first"}
    if not name:
        return {"ok": False, "error": "Name is required"}
    if not pos.strip() and not neg.strip():
        return {"ok": False, "error": "Write a prompt first"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            category_id, _created = _get_or_create_category(conn, shelf)
            existing = conn.execute(
                """
                SELECT id FROM presets
                WHERE category_id = ? AND title = ? COLLATE NOCASE
                """,
                (category_id, name),
            ).fetchone()
            if existing and not overwrite:
                conn.rollback()
                return {"ok": False, "conflicts": [{"name": name, "category": shelf}]}

            note = (description or "").strip()
            if existing:
                preset_id = int(existing["id"])
                conn.execute(
                    """
                    UPDATE presets
                    SET description = ?, positive = ?, negative = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (note, pos, neg, preset_id),
                )
            else:
                cur = conn.execute(
                    """
                    INSERT INTO presets (category_id, title, description, positive, negative)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (category_id, name, note, pos, neg),
                )
                preset_id = int(cur.lastrowid)
            preview_row = conn.execute(
                "SELECT preview_path FROM presets WHERE id = ?",
                (preset_id,),
            ).fetchone()
            preview_path = (preview_row["preview_path"] or "").strip() if preview_row else ""
            conn.commit()
            result = {
                "ok": True,
                "id": preset_id,
                "title": name,
                "category": shelf,
                "previewPath": preview_path,
                "hasPreview": _preset_has_preview(preview_path),
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    _safe_ingest_pair(pos, neg)
    return result


def list_presets(category: str = "", recursive: bool = False) -> Dict:
    shelf = _normalize_shelf_path(category)
    with _lock:
        conn = _connect()
        try:
            if shelf:
                shelf = _resolve_category_name(conn, shelf)
            if shelf and recursive:
                rows = conn.execute(
                    """
                    SELECT
                        presets.id,
                        presets.title,
                        presets.description,
                        presets.positive,
                        presets.negative,
                        presets.preview_path,
                        categories.name AS category
                    FROM presets
                    JOIN categories ON categories.id = presets.category_id
                    ORDER BY categories.name COLLATE NOCASE, presets.title COLLATE NOCASE
                    """
                ).fetchall()
                rows = [row for row in rows if _in_shelf_tree(row["category"], shelf)]
            elif shelf:
                rows = conn.execute(
                    """
                    SELECT
                        presets.id,
                        presets.title,
                        presets.description,
                        presets.positive,
                        presets.negative,
                        presets.preview_path,
                        categories.name AS category
                    FROM presets
                    JOIN categories ON categories.id = presets.category_id
                    WHERE categories.name = ? COLLATE NOCASE
                    ORDER BY presets.title COLLATE NOCASE
                    """,
                    (shelf,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT
                        presets.id,
                        presets.title,
                        presets.description,
                        presets.positive,
                        presets.negative,
                        presets.preview_path,
                        categories.name AS category
                    FROM presets
                    JOIN categories ON categories.id = presets.category_id
                    ORDER BY categories.name COLLATE NOCASE, presets.title COLLATE NOCASE
                    """
                ).fetchall()
            return {"ok": True, "presets": [_preset_row(row) for row in rows]}
        finally:
            conn.close()


def list_categories() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    categories.name AS name,
                    COUNT(presets.id) AS count
                FROM categories
                LEFT JOIN presets ON presets.category_id = categories.id
                GROUP BY categories.id
                ORDER BY categories.name COLLATE NOCASE
                """
            ).fetchall()
            return {
                "ok": True,
                "categories": [
                    {"name": row["name"], "count": int(row["count"] or 0)} for row in rows
                ],
            }
        finally:
            conn.close()


def list_layout_folders() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    layout_folders.name AS name,
                    COUNT(layouts.id) AS count
                FROM layout_folders
                LEFT JOIN layouts ON layouts.folder_id = layout_folders.id
                GROUP BY layout_folders.id
                ORDER BY layout_folders.name COLLATE NOCASE
                """
            ).fetchall()
            return {
                "ok": True,
                "folders": [
                    {"name": row["name"], "count": int(row["count"] or 0)} for row in rows
                ],
                "uncategorised": UNCATEGORISED_NAME,
            }
        finally:
            conn.close()


def update_layout(
    layout_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    folder: Optional[str] = None,
    slots: Optional[List] = None,
    overwrite: bool = False,
) -> Dict:
    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute("SELECT * FROM layouts WHERE id = ?", (int(layout_id),)).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}

            current_folder = ""
            if row["folder_id"]:
                folder_row = conn.execute(
                    "SELECT name FROM layout_folders WHERE id = ?",
                    (int(row["folder_id"]),),
                ).fetchone()
                current_folder = folder_row["name"] if folder_row else ""
            base_folder = current_folder if folder is None else folder
            base_name = row["name"] if name is None else (name or "").strip()
            if name is not None or folder is not None:
                next_folder, next_name = _split_path_name(base_folder, base_name)
            else:
                next_folder, next_name = current_folder, row["name"]
            next_desc = row["description"] if description is None else (description or "").strip()
            next_folder_id = row["folder_id"]
            next_slots = _parse_slots(row["slots"]) if slots is None else _parse_slots(slots)
            if not next_name:
                conn.rollback()
                return {"ok": False, "error": "Name is required"}
            if slots is not None and not next_slots:
                conn.rollback()
                return {"ok": False, "error": "Add at least one slot"}

            if name is not None or folder is not None:
                next_folder_id = _get_or_create_folder(conn, next_folder)

            existing = _find_named_in_folder(
                conn, "layouts", next_name, next_folder_id, except_id=int(layout_id)
            )
            if existing and not overwrite:
                conn.rollback()
                return {
                    "ok": False,
                    "conflicts": [
                        {"name": next_name, "folder": next_folder or UNCATEGORISED_NAME}
                    ],
                }
            if existing and overwrite:
                conn.execute("DELETE FROM layouts WHERE id = ?", (int(existing["id"]),))

            conn.execute(
                """
                UPDATE layouts
                SET name = ?, description = ?, folder_id = ?, slots = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (next_name, next_desc, next_folder_id, json.dumps(next_slots), int(layout_id)),
            )
            conn.commit()
            return {
                "ok": True,
                "id": int(layout_id),
                "name": next_name,
                "folder": next_folder,
                "slots": next_slots,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_layout(layout_id: int) -> Dict:
    with _lock:
        conn = _connect()
        try:
            cur = conn.execute("DELETE FROM layouts WHERE id = ?", (int(layout_id),))
            conn.commit()
            if cur.rowcount == 0:
                return {"ok": False, "error": "Not found"}
            return {"ok": True}
        finally:
            conn.close()


def _rename_folder_tree(table: str, name: str, new_name: str) -> Dict:
    old = _normalize_folder_name(name)
    new = _normalize_folder_name(new_name)
    if _is_uncategorised(old):
        return {"ok": False, "error": "Cannot rename Uncategorised"}
    if not new or _is_uncategorised(new):
        return {"ok": False, "error": "Invalid name"}
    if old == new:
        return {"ok": True, "name": new}
    if old.casefold() != new.casefold() and _in_shelf_tree(new, old):
        return {"ok": False, "error": "Cannot move a folder into itself"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            rows = conn.execute(f"SELECT id, name FROM {table}").fetchall()
            moving = [row for row in rows if _in_shelf_tree(row["name"], old)]
            if not moving:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            moving_ids = {int(row["id"]) for row in moving}
            others = {
                (row["name"] or "").casefold()
                for row in rows
                if int(row["id"]) not in moving_ids
            }
            renames = [
                (int(row["id"]), new + (row["name"] or "")[len(old):]) for row in moving
            ]
            conflicts = [
                {"name": target} for _id, target in renames if target.casefold() in others
            ]
            if conflicts:
                conn.rollback()
                return {"ok": False, "conflicts": conflicts}
            for folder_id, target in renames:
                conn.execute(
                    f"UPDATE {table} SET name = ? WHERE id = ?",
                    (target, folder_id),
                )
            conn.commit()
            return {"ok": True, "name": new}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def _delete_folder_tree(table: str, item_table: str, name: str) -> Dict:
    """Delete folder branch; items move to Uncategorised (folder_id NULL)."""
    title = _normalize_folder_name(name)
    if _is_uncategorised(title):
        return {"ok": False, "error": "Cannot delete Uncategorised"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            rows = conn.execute(f"SELECT id, name FROM {table}").fetchall()
            ids = [int(row["id"]) for row in rows if _in_shelf_tree(row["name"], title)]
            if not ids:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            count = 0
            for folder_id in ids:
                items = conn.execute(
                    f"SELECT id, name FROM {item_table} WHERE folder_id = ?",
                    (folder_id,),
                ).fetchall()
                for item in items:
                    leaf = item["name"] or ""
                    # Avoid UNIQUE clash with an already-uncategorised item of the same name.
                    if _find_named_in_folder(
                        conn, item_table, leaf, None, except_id=int(item["id"])
                    ):
                        candidate = leaf
                        suffix = 2
                        while _find_named_in_folder(
                            conn, item_table, candidate, None, except_id=int(item["id"])
                        ):
                            candidate = f"{leaf} ({suffix})"
                            suffix += 1
                        conn.execute(
                            f"UPDATE {item_table} SET name = ? WHERE id = ?",
                            (candidate, int(item["id"])),
                        )
                    count += 1
                conn.execute(f"DELETE FROM {table} WHERE id = ?", (folder_id,))
            conn.commit()
            return {"ok": True, "moved": int(count)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def rename_layout_folder(name: str, new_name: str) -> Dict:
    return _rename_folder_tree("layout_folders", name, new_name)


def delete_layout_folder(name: str) -> Dict:
    return _delete_folder_tree("layout_folders", "layouts", name)


def _get_or_create_template_folder(conn: sqlite3.Connection, name: str) -> Optional[int]:
    title = _normalize_folder_name(name)
    if _is_uncategorised(title):
        return None
    row = conn.execute(
        "SELECT id FROM template_folders WHERE name = ? COLLATE NOCASE",
        (title,),
    ).fetchone()
    if row:
        return int(row["id"])
    cur = conn.execute("INSERT INTO template_folders (name) VALUES (?)", (title,))
    return int(cur.lastrowid)


def _parse_template_slots(raw) -> List[Dict]:
    if isinstance(raw, list):
        data = raw
    else:
        try:
            data = json.loads(raw or "[]")
        except Exception:
            return []
    slots: List[Dict] = []
    seen = set()
    for item in data if isinstance(data, list) else []:
        if isinstance(item, str):
            title = item.strip()
            positive = ""
            negative = ""
            enabled = True
            loaded_title = ""
            loaded_category = ""
            loaded_description = ""
        elif isinstance(item, dict):
            title = str(item.get("title") or "").strip()
            positive = str(item.get("positive") or "")
            negative = str(item.get("negative") or "")
            enabled = item.get("enabled", True) is not False
            loaded_title = str(item.get("loadedTitle") or "").strip()
            loaded_category = str(item.get("loadedCategory") or "").strip()
            loaded_description = str(item.get("loadedDescription") or "").strip()
        else:
            continue
        key = title.lower()
        if not title or key in seen:
            continue
        # Empty pairs are planning placeholders — not part of a template pack.
        if not positive.strip() and not negative.strip():
            continue
        seen.add(key)
        slots.append(
            {
                "title": title,
                "positive": positive,
                "negative": negative,
                "enabled": enabled,
                "loadedTitle": loaded_title,
                "loadedCategory": loaded_category,
                "loadedDescription": loaded_description,
            }
        )
    return slots


def _template_row(row: sqlite3.Row) -> Dict:
    folder = row["folder"] if "folder" in row.keys() else None
    return {
        "id": int(row["id"]),
        "name": row["name"],
        "description": row["description"] or "",
        "slots": _parse_template_slots(row["slots"]),
        "folder": folder or "",
    }


def _ingest_template_slots(slots: List[Dict]) -> None:
    for slot in slots:
        if slot.get("enabled") is False:
            continue
        _safe_ingest_pair(slot.get("positive") or "", slot.get("negative") or "")


def save_template(
    name: str,
    description: str,
    slots: List,
    overwrite: bool = False,
    folder: str = "",
) -> Dict:
    folder_path, title = _split_path_name(folder, name)
    slot_rows = _parse_template_slots(slots)
    if not title:
        return {"ok": False, "error": "Name is required"}
    if not slot_rows:
        return {"ok": False, "error": "Add at least one pair with text"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            folder_id = _get_or_create_template_folder(conn, folder_path)
            folder_name = ""
            if folder_id:
                folder_row = conn.execute(
                    "SELECT name FROM template_folders WHERE id = ?",
                    (folder_id,),
                ).fetchone()
                folder_name = folder_row["name"] if folder_row else folder_path

            existing = _find_named_in_folder(conn, "templates", title, folder_id)
            if existing and not overwrite:
                conn.rollback()
                return {
                    "ok": False,
                    "conflicts": [{"name": title, "folder": folder_name or UNCATEGORISED_NAME}],
                }

            payload = json.dumps(slot_rows, ensure_ascii=False)
            note = (description or "").strip()
            if existing:
                conn.execute(
                    """
                    UPDATE templates
                    SET description = ?, slots = ?, folder_id = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (note, payload, folder_id, int(existing["id"])),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO templates (name, description, slots, folder_id)
                    VALUES (?, ?, ?, ?)
                    """,
                    (title, note, payload, folder_id),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    _ingest_template_slots(slot_rows)
    return {
        "ok": True,
        "name": title,
        "slots": slot_rows,
        "folder": folder_name,
        "description": note,
    }


def list_templates() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    templates.id,
                    templates.name,
                    templates.description,
                    templates.slots,
                    template_folders.name AS folder
                FROM templates
                LEFT JOIN template_folders ON template_folders.id = templates.folder_id
                ORDER BY
                    CASE WHEN template_folders.name IS NULL THEN 0 ELSE 1 END,
                    template_folders.name COLLATE NOCASE,
                    templates.name COLLATE NOCASE
                """
            ).fetchall()
            return {"ok": True, "templates": [_template_row(row) for row in rows]}
        finally:
            conn.close()


def list_template_folders() -> Dict:
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    template_folders.name AS name,
                    COUNT(templates.id) AS count
                FROM template_folders
                LEFT JOIN templates ON templates.folder_id = template_folders.id
                GROUP BY template_folders.id
                ORDER BY template_folders.name COLLATE NOCASE
                """
            ).fetchall()
            return {
                "ok": True,
                "folders": [
                    {"name": row["name"], "count": int(row["count"] or 0)} for row in rows
                ],
                "uncategorised": UNCATEGORISED_NAME,
            }
        finally:
            conn.close()


def update_template(
    template_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    folder: Optional[str] = None,
    slots: Optional[List] = None,
    overwrite: bool = False,
) -> Dict:
    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT * FROM templates WHERE id = ?",
                (int(template_id),),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}

            current_folder = ""
            if row["folder_id"]:
                folder_row = conn.execute(
                    "SELECT name FROM template_folders WHERE id = ?",
                    (int(row["folder_id"]),),
                ).fetchone()
                current_folder = folder_row["name"] if folder_row else ""
            base_folder = current_folder if folder is None else folder
            base_name = row["name"] if name is None else (name or "").strip()
            if name is not None or folder is not None:
                next_folder, next_name = _split_path_name(base_folder, base_name)
            else:
                next_folder, next_name = current_folder, row["name"]
            next_desc = row["description"] if description is None else (description or "").strip()
            next_folder_id = row["folder_id"]
            next_slots = (
                _parse_template_slots(row["slots"])
                if slots is None
                else _parse_template_slots(slots)
            )
            if not next_name:
                conn.rollback()
                return {"ok": False, "error": "Name is required"}
            if slots is not None and not next_slots:
                conn.rollback()
                return {"ok": False, "error": "Add at least one slot"}

            if name is not None or folder is not None:
                next_folder_id = _get_or_create_template_folder(conn, next_folder)

            existing = _find_named_in_folder(
                conn, "templates", next_name, next_folder_id, except_id=int(template_id)
            )
            if existing and not overwrite:
                conn.rollback()
                return {
                    "ok": False,
                    "conflicts": [
                        {"name": next_name, "folder": next_folder or UNCATEGORISED_NAME}
                    ],
                }
            if existing and overwrite:
                conn.execute("DELETE FROM templates WHERE id = ?", (int(existing["id"]),))

            conn.execute(
                """
                UPDATE templates
                SET name = ?, description = ?, folder_id = ?, slots = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    next_name,
                    next_desc,
                    next_folder_id,
                    json.dumps(next_slots, ensure_ascii=False),
                    int(template_id),
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    if slots is not None:
        _ingest_template_slots(next_slots)
    return {
        "ok": True,
        "id": int(template_id),
        "name": next_name,
        "folder": next_folder,
        "slots": next_slots,
        "description": next_desc,
    }


def delete_template(template_id: int) -> Dict:
    with _lock:
        conn = _connect()
        try:
            cur = conn.execute("DELETE FROM templates WHERE id = ?", (int(template_id),))
            conn.commit()
            if cur.rowcount == 0:
                return {"ok": False, "error": "Not found"}
            return {"ok": True}
        finally:
            conn.close()


def rename_template_folder(name: str, new_name: str) -> Dict:
    return _rename_folder_tree("template_folders", name, new_name)


def delete_template_folder(name: str) -> Dict:
    return _delete_folder_tree("template_folders", "templates", name)


def update_preset(
    preset_id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    positive: Optional[str] = None,
    negative: Optional[str] = None,
    overwrite: bool = False,
) -> Dict:
    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                """
                SELECT presets.*, categories.name AS category
                FROM presets
                JOIN categories ON categories.id = presets.category_id
                WHERE presets.id = ?
                """,
                (int(preset_id),),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}

            next_desc = row["description"] if description is None else (description or "").strip()
            next_pos = row["positive"] if positive is None else (positive or "")
            next_neg = row["negative"] if negative is None else (negative or "")
            category_id = int(row["category_id"])
            shelf = row["category"]
            base_shelf = shelf if category is None else category
            base_title = row["title"] if title is None else (title or "").strip()
            if title is not None or category is not None:
                shelf, next_title = _split_path_name(base_shelf, base_title)
            else:
                next_title = row["title"]
            if not next_title:
                conn.rollback()
                return {"ok": False, "error": "Name is required"}
            if not next_pos.strip() and not next_neg.strip():
                conn.rollback()
                return {"ok": False, "error": "Write a prompt first"}

            if title is not None or category is not None:
                if not shelf:
                    conn.rollback()
                    return {"ok": False, "error": "Collection is required"}
                category_id, _created = _get_or_create_category(conn, shelf)

            if (
                next_title.casefold() != (row["title"] or "").casefold()
            ) or (category_id != int(row["category_id"])):
                existing = conn.execute(
                    """
                    SELECT id FROM presets
                    WHERE category_id = ? AND title = ? COLLATE NOCASE AND id != ?
                    """,
                    (category_id, next_title, int(preset_id)),
                ).fetchone()
                if existing and not overwrite:
                    conn.rollback()
                    return {"ok": False, "conflicts": [{"name": next_title, "category": shelf}]}
                if existing and overwrite:
                    old_preview = conn.execute(
                        "SELECT preview_path FROM presets WHERE id = ?",
                        (int(existing["id"]),),
                    ).fetchone()
                    conn.execute("DELETE FROM presets WHERE id = ?", (int(existing["id"]),))
                    if old_preview:
                        _unlink_preview_file(old_preview["preview_path"] or "")

            preview_row = conn.execute(
                "SELECT preview_path FROM presets WHERE id = ?",
                (int(preset_id),),
            ).fetchone()
            old_preview = (preview_row["preview_path"] or "").strip() if preview_row else ""
            next_preview = old_preview
            if old_preview:
                ext = os.path.splitext(old_preview)[1] or ".jpg"
                want = _preview_rel_for_pair(shelf, next_title, ext)
                if want != old_preview:
                    next_preview = _relocate_preview_file(old_preview, want) or want

            conn.execute(
                """
                UPDATE presets
                SET category_id = ?, title = ?, description = ?, positive = ?, negative = ?,
                    preview_path = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    category_id,
                    next_title,
                    next_desc,
                    next_pos,
                    next_neg,
                    next_preview,
                    int(preset_id),
                ),
            )
            conn.commit()
            result = {
                "ok": True,
                "id": int(preset_id),
                "title": next_title,
                "category": shelf,
                "previewPath": next_preview,
                "hasPreview": _preset_has_preview(next_preview),
            }
            saved_pos = next_pos
            saved_neg = next_neg
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    _safe_ingest_pair(saved_pos, saved_neg)
    return result


def delete_preset(preset_id: int) -> Dict:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT preview_path FROM presets WHERE id = ?",
                (int(preset_id),),
            ).fetchone()
            if not row:
                return {"ok": False, "error": "Not found"}
            preview_path = row["preview_path"] or ""
            cur = conn.execute("DELETE FROM presets WHERE id = ?", (int(preset_id),))
            conn.commit()
            if cur.rowcount == 0:
                return {"ok": False, "error": "Not found"}
            _unlink_preview_file(preview_path)
            return {"ok": True}
        finally:
            conn.close()


def set_preset_preview(preset_id: int, data: bytes, mime: str = "image/jpeg") -> Dict:
    raw = data or b""
    if not raw:
        return {"ok": False, "error": "Empty image"}
    if len(raw) > _PREVIEW_MAX_BYTES:
        return {"ok": False, "error": "Image too large (max 2MB)"}
    ext = _ext_from_mime(mime)

    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                """
                SELECT presets.preview_path, presets.title, categories.name AS category
                FROM presets
                JOIN categories ON categories.id = presets.category_id
                WHERE presets.id = ?
                """,
                (int(preset_id),),
            ).fetchone()
            if not row:
                return {"ok": False, "error": "Not found"}
            old_rel = (row["preview_path"] or "").strip()
            rel = _preview_rel_for_pair(row["category"] or "", row["title"] or "", ext)
            abs_path = _preview_abs(rel)
            if not abs_path:
                return {"ok": False, "error": "Invalid preview path"}
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            with open(abs_path, "wb") as handle:
                handle.write(raw)
            if old_rel and old_rel != rel:
                _unlink_preview_file(old_rel)
            conn.execute(
                """
                UPDATE presets
                SET preview_path = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (rel, int(preset_id)),
            )
            conn.commit()
            key_shelf = _normalize_shelf_path(row["category"] or "")
            key_title = (row["title"] or "").strip()
            preview_key = (
                f"{key_shelf}{SHELF_SEP}{key_title}" if key_shelf and key_title else key_title or key_shelf
            )
            return {
                "ok": True,
                "id": int(preset_id),
                "previewPath": rel,
                "previewKey": preview_key,
                "hasPreview": True,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def clear_preset_preview(preset_id: int) -> Dict:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT preview_path FROM presets WHERE id = ?",
                (int(preset_id),),
            ).fetchone()
            if not row:
                return {"ok": False, "error": "Not found"}
            old_rel = (row["preview_path"] or "").strip()
            conn.execute(
                """
                UPDATE presets
                SET preview_path = '', updated_at = datetime('now')
                WHERE id = ?
                """,
                (int(preset_id),),
            )
            conn.commit()
            _unlink_preview_file(old_rel)
            return {"ok": True, "id": int(preset_id), "previewPath": "", "hasPreview": False}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def resolve_preset_preview_file(preset_id: int) -> Optional[str]:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT preview_path FROM presets WHERE id = ?",
                (int(preset_id),),
            ).fetchone()
            if not row:
                return None
            path = _preview_abs(row["preview_path"] or "")
            if path and os.path.isfile(path):
                return path
            return None
        finally:
            conn.close()


def resolve_preset_preview_by_pair(category: str, title: str) -> Optional[str]:
    """Resolve preview file from library path: shelf + pair title."""
    shelf = _normalize_shelf_path(category)
    name = (title or "").strip()
    if not name:
        return None
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                """
                SELECT presets.preview_path
                FROM presets
                JOIN categories ON categories.id = presets.category_id
                WHERE categories.name = ? COLLATE NOCASE
                  AND presets.title = ? COLLATE NOCASE
                """,
                (shelf, name),
            ).fetchone()
            if row:
                path = _preview_abs(row["preview_path"] or "")
                if path and os.path.isfile(path):
                    return path
            for ext in _PREVIEW_EXTS:
                path = _preview_abs(_preview_rel_for_pair(shelf, name, ext))
                if path and os.path.isfile(path):
                    return path
            return None
        finally:
            conn.close()


def rename_category(name: str, new_name: str) -> Dict:
    """Rename / move a collection path together with its sub-collections."""
    old = _normalize_shelf_path(name)
    new = _normalize_shelf_path(new_name)
    if not old:
        return {"ok": False, "error": "Not found"}
    if not new:
        return {"ok": False, "error": "Invalid name"}
    if old == new:
        return {"ok": True, "name": new}
    if old.casefold() != new.casefold() and _in_shelf_tree(new, old):
        return {"ok": False, "error": "Cannot move a collection into itself"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            rows = conn.execute("SELECT id, name FROM categories").fetchall()
            moving = [row for row in rows if _in_shelf_tree(row["name"], old)]
            if not moving:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            moving_ids = {int(row["id"]) for row in moving}
            others = {
                (row["name"] or "").casefold()
                for row in rows
                if int(row["id"]) not in moving_ids
            }
            renames = [
                (int(row["id"]), new + (row["name"] or "")[len(old):]) for row in moving
            ]
            conflicts = [{"name": target} for _id, target in renames if target.casefold() in others]
            if conflicts:
                conn.rollback()
                return {"ok": False, "conflicts": conflicts}
            for category_id, target in renames:
                conn.execute(
                    "UPDATE categories SET name = ? WHERE id = ?",
                    (target, category_id),
                )
            # Keep preview files aligned with shelf/pair names.
            for category_id, target in renames:
                preset_rows = conn.execute(
                    "SELECT id, title, preview_path FROM presets WHERE category_id = ?",
                    (category_id,),
                ).fetchall()
                for preset_row in preset_rows:
                    old_rel = (preset_row["preview_path"] or "").strip()
                    if not old_rel:
                        continue
                    ext = os.path.splitext(old_rel)[1] or ".jpg"
                    want = _preview_rel_for_pair(target, preset_row["title"] or "", ext)
                    if want == old_rel:
                        continue
                    next_rel = _relocate_preview_file(old_rel, want) or want
                    if next_rel != old_rel:
                        conn.execute(
                            "UPDATE presets SET preview_path = ? WHERE id = ?",
                            (next_rel, int(preset_row["id"])),
                        )
            conn.commit()
            return {"ok": True, "name": new}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_category(name: str) -> Dict:
    """Delete a collection path together with its sub-collections."""
    shelf = _normalize_shelf_path(name)
    if not shelf:
        return {"ok": False, "error": "Not found"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            rows = conn.execute("SELECT id, name FROM categories").fetchall()
            ids = [int(row["id"]) for row in rows if _in_shelf_tree(row["name"], shelf)]
            if not ids:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            preview_paths = []
            count = 0
            for category_id in ids:
                preset_rows = conn.execute(
                    "SELECT preview_path FROM presets WHERE category_id = ?",
                    (category_id,),
                ).fetchall()
                count += len(preset_rows)
                for preset_row in preset_rows:
                    preview_paths.append(preset_row["preview_path"] or "")
                conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
            conn.commit()
            for rel in preview_paths:
                _unlink_preview_file(rel)
            return {"ok": True, "deleted": int(count)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


UI_PREF_KEYS = (
    "otherCollections",
    "showEmpty",
    "searchInPrompts",
    "promptAutocomplete",
    "managerTab",
    "skipPairReplaceConfirm",
    "civitaiToolkitImport",
    "presetsEnabled",
    "templatesEnabled",
    "pairBrowse",
    "templateBrowse",
    "lastSeenChangelog",
)
UI_PREF_DEFAULTS = {
    "otherCollections": False,
    "showEmpty": False,
    "searchInPrompts": False,
    "promptAutocomplete": False,
    "managerTab": "presets",
    "skipPairReplaceConfirm": False,
    "civitaiToolkitImport": False,
    "presetsEnabled": True,
    "templatesEnabled": True,
    "pairBrowse": False,
    "templateBrowse": False,
    "lastSeenChangelog": "",
}
_MANAGER_TAB_VALUES = frozenset({"presets", "prompts", "templates", "suggest"})


def _safe_ingest_pair(positive: str = "", negative: str = "") -> None:
    try:
        from . import autocomplete as ac

        ac.ingest_pair(positive or "", negative or "")
    except Exception:
        # Autocomplete must never break library saves.
        pass


def list_presets_for_autocomplete() -> List[Dict]:
    """Lightweight rows for dictionary rebuild progress."""
    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    presets.title,
                    presets.positive,
                    presets.negative,
                    categories.name AS category
                FROM presets
                JOIN categories ON categories.id = presets.category_id
                ORDER BY categories.name COLLATE NOCASE, presets.title COLLATE NOCASE
                """
            ).fetchall()
            return [
                {
                    "title": row["title"] or "",
                    "category": row["category"] or "",
                    "positive": row["positive"] or "",
                    "negative": row["negative"] or "",
                }
                for row in rows
            ]
        finally:
            conn.close()


def _prompt_field_for_side(side: str) -> str:
    key = (side or "").strip().lower()
    if key in ("negative", "neg", "str_neg"):
        return "negative"
    return "positive"


def find_presets_with_segment(side: str, segment: str) -> Dict:
    """Presets that contain the segment on this side only (pos OR neg)."""
    from . import autocomplete as ac

    field = _prompt_field_for_side(side)
    needle = ac.normalize_segment(segment)
    if not needle:
        return {"ok": False, "error": "Empty segment"}

    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                """
                SELECT
                    presets.id,
                    presets.title,
                    presets.positive,
                    presets.negative,
                    categories.name AS category
                FROM presets
                JOIN categories ON categories.id = presets.category_id
                ORDER BY categories.name COLLATE NOCASE, presets.title COLLATE NOCASE
                """
            ).fetchall()
        finally:
            conn.close()

    matches = []
    for row in rows:
        body = row[field] or ""
        if ac.prompt_contains_segment(body, needle):
            matches.append(
                {
                    "id": int(row["id"]),
                    "title": row["title"] or "",
                    "category": row["category"] or "",
                    "positive": row["positive"] or "",
                    "negative": row["negative"] or "",
                }
            )
    return {
        "ok": True,
        "side": "neg" if field == "negative" else "pos",
        "segment": needle,
        "count": len(matches),
        "matches": matches,
    }


def replace_segment_in_presets(side: str, old_text: str, new_text: str) -> Dict:
    """Rewrite segment inside preset prompts on one side only."""
    from . import autocomplete as ac

    field = _prompt_field_for_side(side)
    old_n = ac.normalize_segment(old_text)
    new_n = ac.normalize_segment(new_text)
    if not old_n or not new_n:
        return {"ok": False, "error": "Empty segment"}
    if old_n == new_n:
        return {"ok": True, "updated": 0, "replacements": 0}

    with _lock:
        conn = _connect()
        try:
            rows = conn.execute(
                f"SELECT id, {field} AS body FROM presets"
            ).fetchall()
            updated = 0
            replacements = 0
            conn.execute("BEGIN")
            for row in rows:
                next_body, hits = ac.replace_segment_in_prompt(
                    row["body"] or "", old_n, new_n
                )
                if hits <= 0:
                    continue
                conn.execute(
                    f"""
                    UPDATE presets
                    SET {field} = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (next_body, int(row["id"])),
                )
                updated += 1
                replacements += hits
            conn.commit()
            return {
                "ok": True,
                "side": "neg" if field == "negative" else "pos",
                "old": old_n,
                "new": new_n,
                "updated": updated,
                "replacements": replacements,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def rename_autocomplete_segment(
    side: str,
    old_text: str,
    new_text: str,
    replace_in_presets: bool = False,
) -> Dict:
    """Rename dictionary segment; optionally rewrite matching presets on that side."""
    from . import autocomplete as ac

    renamed = ac.rename_segment(side, old_text, new_text)
    if not renamed.get("ok"):
        return renamed

    result = {
        "ok": True,
        "side": renamed.get("side"),
        "old": renamed.get("old"),
        "new": renamed.get("new"),
        "changed": renamed.get("changed"),
        "merged": renamed.get("merged"),
        "presets_updated": 0,
        "replacements": 0,
    }
    if replace_in_presets and renamed.get("changed"):
        lib = replace_segment_in_presets(side, renamed["old"], renamed["new"])
        if not lib.get("ok"):
            return lib
        result["presets_updated"] = int(lib.get("updated") or 0)
        result["replacements"] = int(lib.get("replacements") or 0)
    return result


def rebuild_autocomplete_from_library() -> Dict:
    """Scan all saved pairs into pos/neg letter-bucket dictionaries."""
    rows = list_presets_for_autocomplete()
    pairs = [(row["positive"], row["negative"]) for row in rows]

    from . import autocomplete as ac

    result = ac.rebuild_from_presets(pairs)
    result["presets"] = len(pairs)
    return result


_UI_PREFS_ROW = "ui_prefs"


def _normalize_ui_prefs(raw) -> Dict:
    prefs = dict(UI_PREF_DEFAULTS)
    if not isinstance(raw, dict):
        return prefs
    for key in UI_PREF_KEYS:
        if key not in raw:
            continue
        if key == "managerTab":
            val = str(raw[key] or "").strip().lower()
            if val == "stacks":
                val = "presets"
            prefs[key] = val if val in _MANAGER_TAB_VALUES else "presets"
        elif key == "lastSeenChangelog":
            prefs[key] = str(raw[key] or "").strip()
        else:
            prefs[key] = bool(raw[key])
    return prefs


def get_ui_prefs() -> Dict:
    with _lock:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT value FROM settings WHERE key = ?",
                (_UI_PREFS_ROW,),
            ).fetchone()
            raw = {}
            if row and row["value"]:
                try:
                    raw = json.loads(row["value"])
                except Exception:
                    raw = {}
            return {"ok": True, "prefs": _normalize_ui_prefs(raw)}
        finally:
            conn.close()


def set_ui_prefs(patch: Optional[Dict] = None) -> Dict:
    incoming = patch if isinstance(patch, dict) else {}
    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT value FROM settings WHERE key = ?",
                (_UI_PREFS_ROW,),
            ).fetchone()
            raw = {}
            if row and row["value"]:
                try:
                    raw = json.loads(row["value"])
                except Exception:
                    raw = {}
            prefs = _normalize_ui_prefs(raw)
            for key in UI_PREF_KEYS:
                if key not in incoming:
                    continue
                if key == "managerTab":
                    val = str(incoming[key] or "").strip().lower()
                    if val == "stacks":
                        val = "presets"
                    prefs[key] = val if val in _MANAGER_TAB_VALUES else "presets"
                elif key == "lastSeenChangelog":
                    prefs[key] = str(incoming[key] or "").strip()
                else:
                    prefs[key] = bool(incoming[key])
            payload = json.dumps(prefs)
            conn.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (_UI_PREFS_ROW, payload),
            )
            conn.commit()
            return {"ok": True, "prefs": prefs}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
