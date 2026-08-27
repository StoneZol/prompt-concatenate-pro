"""SQLite library: layout presets (empty slots) and category shelves."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from typing import Dict, List, Optional, Tuple

_lock = threading.Lock()

UNCATEGORISED_NAME = "Uncategorised"


def _db_path() -> str:
    directory = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, "presets.sqlite")


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
        """
    )
    if _table_columns(conn, "layouts") and "folder_id" not in _table_columns(conn, "layouts"):
        conn.execute(
            "ALTER TABLE layouts ADD COLUMN folder_id INTEGER REFERENCES layout_folders(id) ON DELETE SET NULL"
        )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_layouts_folder_id ON layouts(folder_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_layouts_name ON layouts(name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_presets_category_id ON presets(category_id)")


def init_db() -> None:
    with _lock:
        conn = _connect()
        conn.close()


def _get_or_create_category(conn: sqlite3.Connection, name: str) -> Tuple[int, bool]:
    row = conn.execute(
        "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
        (name,),
    ).fetchone()
    if row:
        return int(row["id"]), False
    cur = conn.execute("INSERT INTO categories (name) VALUES (?)", (name,))
    return int(cur.lastrowid), True


def _normalize_folder_name(name: str) -> str:
    return (name or "").strip()


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
    title = (name or "").strip()
    slot_names = _parse_slots(slots)
    if not title:
        return {"ok": False, "error": "Name is required"}
    if not slot_names:
        return {"ok": False, "error": "Add a group first"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            folder_id = _get_or_create_folder(conn, folder)
            folder_name = ""
            if folder_id:
                folder_row = conn.execute(
                    "SELECT name FROM layout_folders WHERE id = ?",
                    (folder_id,),
                ).fetchone()
                folder_name = folder_row["name"] if folder_row else _normalize_folder_name(folder)

            existing = conn.execute(
                "SELECT id FROM layouts WHERE name = ? COLLATE NOCASE",
                (title,),
            ).fetchone()
            if existing and not overwrite:
                conn.rollback()
                return {"ok": False, "conflicts": [{"name": title}]}

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


def _preset_row(row: sqlite3.Row) -> Dict:
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "description": row["description"] or "",
        "positive": row["positive"] or "",
        "negative": row["negative"] or "",
        "category": row["category"] or "",
    }


def save_preset(
    category: str,
    title: str,
    description: str = "",
    positive: str = "",
    negative: str = "",
    overwrite: bool = False,
) -> Dict:
    shelf = (category or "").strip()
    name = (title or "").strip()
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
                conn.execute(
                    """
                    UPDATE presets
                    SET description = ?, positive = ?, negative = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (note, pos, neg, int(existing["id"])),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO presets (category_id, title, description, positive, negative)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (category_id, name, note, pos, neg),
                )
            conn.commit()
            return {
                "ok": True,
                "title": name,
                "category": shelf,
            }
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def list_presets(category: str = "") -> Dict:
    shelf = (category or "").strip()
    with _lock:
        conn = _connect()
        try:
            if shelf:
                rows = conn.execute(
                    """
                    SELECT
                        presets.id,
                        presets.title,
                        presets.description,
                        presets.positive,
                        presets.negative,
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

            next_name = row["name"] if name is None else (name or "").strip()
            next_desc = row["description"] if description is None else (description or "").strip()
            next_folder_id = row["folder_id"]
            if not next_name:
                conn.rollback()
                return {"ok": False, "error": "Name is required"}

            if name is not None and next_name.casefold() != (row["name"] or "").casefold():
                existing = conn.execute(
                    "SELECT id FROM layouts WHERE name = ? COLLATE NOCASE AND id != ?",
                    (next_name, int(layout_id)),
                ).fetchone()
                if existing and not overwrite:
                    conn.rollback()
                    return {"ok": False, "conflicts": [{"name": next_name}]}
                if existing and overwrite:
                    conn.execute("DELETE FROM layouts WHERE id = ?", (int(existing["id"]),))

            if folder is not None:
                next_folder_id = _get_or_create_folder(conn, folder)

            conn.execute(
                """
                UPDATE layouts
                SET name = ?, description = ?, folder_id = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (next_name, next_desc, next_folder_id, int(layout_id)),
            )
            conn.commit()
            return {"ok": True, "id": int(layout_id), "name": next_name}
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


def rename_layout_folder(name: str, new_name: str) -> Dict:
    old = _normalize_folder_name(name)
    new = _normalize_folder_name(new_name)
    if _is_uncategorised(old):
        return {"ok": False, "error": "Cannot rename Uncategorised"}
    if not new or _is_uncategorised(new):
        return {"ok": False, "error": "Invalid name"}
    if old.casefold() == new.casefold():
        return {"ok": True, "name": new}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT id FROM layout_folders WHERE name = ? COLLATE NOCASE",
                (old,),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            existing = conn.execute(
                "SELECT id FROM layout_folders WHERE name = ? COLLATE NOCASE",
                (new,),
            ).fetchone()
            if existing:
                conn.rollback()
                return {"ok": False, "conflicts": [{"name": new}]}
            conn.execute(
                "UPDATE layout_folders SET name = ? WHERE id = ?",
                (new, int(row["id"])),
            )
            conn.commit()
            return {"ok": True, "name": new}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_layout_folder(name: str) -> Dict:
    title = _normalize_folder_name(name)
    if _is_uncategorised(title):
        return {"ok": False, "error": "Cannot delete Uncategorised"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT id FROM layout_folders WHERE name = ? COLLATE NOCASE",
                (title,),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM layouts WHERE folder_id = ?",
                (int(row["id"]),),
            ).fetchone()["c"]
            conn.execute("DELETE FROM layout_folders WHERE id = ?", (int(row["id"]),))
            conn.commit()
            return {"ok": True, "moved": int(count)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


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

            next_title = row["title"] if title is None else (title or "").strip()
            next_desc = row["description"] if description is None else (description or "").strip()
            next_pos = row["positive"] if positive is None else (positive or "")
            next_neg = row["negative"] if negative is None else (negative or "")
            category_id = int(row["category_id"])
            shelf = row["category"]
            if not next_title:
                conn.rollback()
                return {"ok": False, "error": "Name is required"}
            if not next_pos.strip() and not next_neg.strip():
                conn.rollback()
                return {"ok": False, "error": "Write a prompt first"}

            if category is not None:
                shelf = (category or "").strip()
                if not shelf:
                    conn.rollback()
                    return {"ok": False, "error": "Collection is required"}
                category_id, _created = _get_or_create_category(conn, shelf)

            if (
                title is not None
                and next_title.casefold() != (row["title"] or "").casefold()
            ) or (category is not None and category_id != int(row["category_id"])):
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
                    conn.execute("DELETE FROM presets WHERE id = ?", (int(existing["id"]),))

            conn.execute(
                """
                UPDATE presets
                SET category_id = ?, title = ?, description = ?, positive = ?, negative = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                """,
                (category_id, next_title, next_desc, next_pos, next_neg, int(preset_id)),
            )
            conn.commit()
            return {"ok": True, "id": int(preset_id), "title": next_title, "category": shelf}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_preset(preset_id: int) -> Dict:
    with _lock:
        conn = _connect()
        try:
            cur = conn.execute("DELETE FROM presets WHERE id = ?", (int(preset_id),))
            conn.commit()
            if cur.rowcount == 0:
                return {"ok": False, "error": "Not found"}
            return {"ok": True}
        finally:
            conn.close()


def rename_category(name: str, new_name: str) -> Dict:
    old = (name or "").strip()
    new = (new_name or "").strip()
    if not old:
        return {"ok": False, "error": "Not found"}
    if not new:
        return {"ok": False, "error": "Invalid name"}
    if old.casefold() == new.casefold():
        return {"ok": True, "name": new}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
                (old,),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            existing = conn.execute(
                "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
                (new,),
            ).fetchone()
            if existing:
                conn.rollback()
                return {"ok": False, "conflicts": [{"name": new}]}
            conn.execute(
                "UPDATE categories SET name = ? WHERE id = ?",
                (new, int(row["id"])),
            )
            conn.commit()
            return {"ok": True, "name": new}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def delete_category(name: str) -> Dict:
    shelf = (name or "").strip()
    if not shelf:
        return {"ok": False, "error": "Not found"}

    with _lock:
        conn = _connect()
        try:
            conn.execute("BEGIN")
            row = conn.execute(
                "SELECT id FROM categories WHERE name = ? COLLATE NOCASE",
                (shelf,),
            ).fetchone()
            if not row:
                conn.rollback()
                return {"ok": False, "error": "Not found"}
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM presets WHERE category_id = ?",
                (int(row["id"]),),
            ).fetchone()["c"]
            conn.execute("DELETE FROM categories WHERE id = ?", (int(row["id"]),))
            conn.commit()
            return {"ok": True, "deleted": int(count)}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


UI_PREF_KEYS = ("otherCollections", "showEmpty", "searchInPrompts")
UI_PREF_DEFAULTS = {
    "otherCollections": False,
    "showEmpty": False,
    "searchInPrompts": False,
}
_UI_PREFS_ROW = "ui_prefs"


def _normalize_ui_prefs(raw) -> Dict:
    prefs = dict(UI_PREF_DEFAULTS)
    if not isinstance(raw, dict):
        return prefs
    for key in UI_PREF_KEYS:
        if key in raw:
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
                if key in incoming:
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
