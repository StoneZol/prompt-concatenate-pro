"""HTTP routes for the Prompt Concatenate Pro preset library."""

import asyncio
import json
import os
import queue
import threading

from aiohttp import web
from server import PromptServer

from . import db

SAVE_ROUTE = "/prompt_craft/layouts"
LIST_ROUTE = "/prompt_craft/layouts"
FOLDERS_ROUTE = "/prompt_craft/layout_folders"
PRESETS_ROUTE = "/prompt_craft/presets"
CATEGORIES_ROUTE = "/prompt_craft/categories"
TEMPLATES_ROUTE = "/prompt_craft/templates"
TEMPLATE_FOLDERS_ROUTE = "/prompt_craft/template_folders"
PREFS_ROUTE = "/prompt_craft/prefs"
AUTOCOMPLETE_ROUTE = "/prompt_craft/autocomplete"
RESOLVE_LORA_ROUTE = "/prompt_craft/resolve_lora"
LORA_NOTE_ROUTE = "/prompt_craft/lora_note"
CIVITAI_URL_ROUTE = "/prompt_craft/civitai_url"

_NOTE_EXTS = (".txt", ".md", ".caption")
_NOTE_MAX_BYTES = 65536
_toolkit_db_path = None  # cached path or False when missing

db.init_db()


async def save_layout(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    try:
        result = db.save_layout(
            payload.get("name") or "",
            payload.get("description") or "",
            payload.get("slots") or [],
            overwrite=bool(payload.get("overwrite")),
            folder=payload.get("folder") or "",
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)

    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def list_layouts(request):
    try:
        result = db.list_layouts()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def list_layout_folders(request):
    try:
        result = db.list_layout_folders()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def save_preset(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    try:
        result = db.save_preset(
            payload.get("category") or "",
            payload.get("title") or "",
            payload.get("description") or "",
            payload.get("positive") or "",
            payload.get("negative") or "",
            overwrite=bool(payload.get("overwrite")),
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)

    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def list_presets(request):
    try:
        result = db.list_presets(request.query.get("category") or "")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def list_categories(request):
    try:
        result = db.list_categories()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def update_layout(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict) or not payload.get("id"):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.update_layout(
            int(payload["id"]),
            name=payload["name"] if "name" in payload else None,
            description=payload["description"] if "description" in payload else None,
            folder=payload["folder"] if "folder" in payload else None,
            slots=payload["slots"] if "slots" in payload else None,
            overwrite=bool(payload.get("overwrite")),
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def delete_layout(request):
    layout_id = request.rel_url.query.get("id")
    if not layout_id:
        return web.json_response({"ok": False, "error": "Missing id"}, status=400)
    try:
        result = db.delete_layout(int(layout_id))
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 404 if result.get("error") == "Not found" else 400
    return web.json_response(result, status=status)


async def update_layout_folder(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.rename_layout_folder(payload.get("name") or "", payload.get("new_name") or "")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def delete_layout_folder(request):
    name = request.rel_url.query.get("name") or ""
    try:
        result = db.delete_layout_folder(name)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 400
    return web.json_response(result, status=status)


async def update_preset(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict) or not payload.get("id"):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.update_preset(
            int(payload["id"]),
            title=payload["title"] if "title" in payload else None,
            description=payload["description"] if "description" in payload else None,
            category=payload["category"] if "category" in payload else None,
            positive=payload["positive"] if "positive" in payload else None,
            negative=payload["negative"] if "negative" in payload else None,
            overwrite=bool(payload.get("overwrite")),
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def delete_preset(request):
    preset_id = request.rel_url.query.get("id")
    if not preset_id:
        return web.json_response({"ok": False, "error": "Missing id"}, status=400)
    try:
        result = db.delete_preset(int(preset_id))
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 404 if result.get("error") == "Not found" else 400
    return web.json_response(result, status=status)


async def update_category(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.rename_category(payload.get("name") or "", payload.get("new_name") or "")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def delete_category(request):
    name = request.rel_url.query.get("name") or ""
    try:
        result = db.delete_category(name)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 400
    return web.json_response(result, status=status)


async def save_template(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.save_template(
            payload.get("name") or "",
            payload.get("description") or "",
            payload.get("slots") or [],
            overwrite=bool(payload.get("overwrite")),
            folder=payload.get("folder") or "",
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def list_templates(request):
    try:
        result = db.list_templates()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def update_template(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict) or not payload.get("id"):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.update_template(
            int(payload["id"]),
            name=payload["name"] if "name" in payload else None,
            description=payload["description"] if "description" in payload else None,
            folder=payload["folder"] if "folder" in payload else None,
            slots=payload["slots"] if "slots" in payload else None,
            overwrite=bool(payload.get("overwrite")),
        )
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def delete_template(request):
    template_id = request.rel_url.query.get("id")
    if not template_id:
        return web.json_response({"ok": False, "error": "Missing id"}, status=400)
    try:
        result = db.delete_template(int(template_id))
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 404 if result.get("error") == "Not found" else 400
    return web.json_response(result, status=status)


async def list_template_folders(request):
    try:
        result = db.list_template_folders()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def update_template_folder(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    try:
        result = db.rename_template_folder(payload.get("name") or "", payload.get("new_name") or "")
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 409 if result.get("conflicts") else 400
    return web.json_response(result, status=status)


async def delete_template_folder_route(request):
    name = request.rel_url.query.get("name") or ""
    try:
        result = db.delete_template_folder(name)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    status = 200 if result.get("ok") else 400
    return web.json_response(result, status=status)


async def get_prefs(request):
    try:
        result = db.get_ui_prefs()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def update_prefs(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    try:
        result = db.set_ui_prefs(payload)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def autocomplete_lookup(request):
    side = request.rel_url.query.get("side") or "pos"
    prefix = request.rel_url.query.get("prefix") or ""
    try:
        limit = int(request.rel_url.query.get("limit") or 20)
    except Exception:
        limit = 20
    try:
        result = db.autocomplete.lookup(side, prefix, limit=limit)
    except ValueError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def autocomplete_list(request):
    side = request.rel_url.query.get("side") or "pos"
    bucket = request.rel_url.query.get("bucket") or ""
    try:
        limit = int(request.rel_url.query.get("limit") or 500)
    except Exception:
        limit = 500
    try:
        result = db.autocomplete.list_segments(side, bucket=bucket, limit=limit)
    except ValueError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def autocomplete_buckets(request):
    side = request.rel_url.query.get("side") or "pos"
    try:
        result = db.autocomplete.list_buckets(side)
    except ValueError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)
    return web.json_response(result)


async def _autocomplete_rebuild_ndjson(request):
    """Stream rebuild progress as NDJSON: start → progress* → done."""
    try:
        rows = db.list_presets_for_autocomplete()
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)

    response = web.StreamResponse(
        status=200,
        reason="OK",
        headers={
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
    await response.prepare(request)

    async def write_msg(payload: dict) -> None:
        await response.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))

    loop = asyncio.get_running_loop()
    events: queue.Queue = queue.Queue()

    def worker() -> None:
        try:
            for event in db.autocomplete.iter_rebuild_events(rows):
                events.put(event)
        except Exception as exc:
            events.put({"ok": False, "phase": "error", "error": str(exc)})
        finally:
            events.put(None)

    threading.Thread(target=worker, name="pc-ac-rebuild", daemon=True).start()

    while True:
        event = await loop.run_in_executor(None, events.get)
        if event is None:
            break
        await write_msg(event)
        if event.get("ok") is False:
            break

    await response.write_eof()
    return response


async def autocomplete_mutate(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    if not isinstance(payload, dict):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)

    action = (payload.get("action") or "add").strip().lower()
    if action == "rebuild":
        return await _autocomplete_rebuild_ndjson(request)

    try:
        if action == "add":
            result = db.autocomplete.add_segment(payload.get("side") or "pos", payload.get("text") or "")
        elif action == "delete":
            result = db.autocomplete.delete_segment(payload.get("side") or "pos", payload.get("text") or "")
        elif action == "ingest":
            result = db.autocomplete.ingest_pair(
                payload.get("positive") or "",
                payload.get("negative") or "",
            )
        elif action == "rename_preview":
            result = db.find_presets_with_segment(
                payload.get("side") or "pos",
                payload.get("old_text") or payload.get("text") or "",
            )
        elif action == "rename":
            result = db.rename_autocomplete_segment(
                payload.get("side") or "pos",
                payload.get("old_text") or "",
                payload.get("new_text") or "",
                replace_in_presets=bool(payload.get("replace_in_presets")),
            )
        else:
            return web.json_response({"ok": False, "error": "Unknown action"}, status=400)
    except ValueError as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=400)
    except Exception as exc:
        return web.json_response({"ok": False, "error": str(exc)}, status=500)

    status = 200 if result.get("ok") else 400
    return web.json_response(result, status=status)


def _resolve_comfy_lora_name(filename: str) -> dict:
    """Map Toolkit / arbitrary LoRA path → exact folder_paths loras name (for pysssss)."""
    raw = str(filename or "").replace("\\", "/").strip().lstrip("/")
    if not raw or any(part == ".." for part in raw.split("/")):
        return {"ok": False, "error": "Invalid path", "name": ""}

    want = raw.lower()
    if want.startswith("loras/"):
        want = want[6:]
    # Drop drive / absolute prefix if a /loras/ segment exists.
    if ":" in want:
        idx = want.rfind("/loras/")
        if idx >= 0:
            want = want[idx + len("/loras/") :]
    want_no_ext = want.rsplit(".", 1)[0] if "." in want.split("/")[-1] else want
    want_base = want.split("/")[-1]
    want_base_no_ext = want_base.rsplit(".", 1)[0] if "." in want_base else want_base

    try:
        import folder_paths
    except Exception:
        return {"ok": False, "error": "folder_paths unavailable", "name": ""}

    files = folder_paths.get_filename_list("loras") or []
    normed = [(f, str(f).replace("\\", "/")) for f in files]

    def match(pred):
        for original, forward in normed:
            if pred(forward.lower(), forward):
                return original
        return None

    hit = match(lambda low, _fwd: low == want or low.rsplit(".", 1)[0] == want_no_ext)
    if hit is None:
        hit = match(
            lambda low, _fwd: low.split("/")[-1] == want_base
            or low.split("/")[-1].rsplit(".", 1)[0] == want_base_no_ext
        )
    if hit is None:
        return {"ok": False, "error": "LoRA not in Comfy loras list", "name": ""}
    return {"ok": True, "name": hit}


async def resolve_lora(request):
    filename = request.rel_url.query.get("file") or ""
    result = _resolve_comfy_lora_name(filename)
    status = 200 if result.get("ok") else 404
    return web.json_response(result, status=status)


def _read_lora_sidecar_note(filename: str) -> dict:
    """On-demand sidecar note next to one LoRA (Name.txt / .md / .caption)."""
    resolved = _resolve_comfy_lora_name(filename)
    if not resolved.get("ok"):
        # Still try raw relative path under loras roots.
        rel = str(filename or "").replace("\\", "/").strip().lstrip("/")
        if rel.lower().startswith("loras/"):
            rel = rel[6:]
        name = rel
    else:
        name = resolved["name"]

    if not name or any(part == ".." for part in str(name).replace("\\", "/").split("/")):
        return {"ok": False, "error": "Invalid path", "notes": "", "source": None}

    try:
        import folder_paths
    except Exception:
        return {"ok": False, "error": "folder_paths unavailable", "notes": "", "source": None}

    full = folder_paths.get_full_path("loras", name)
    if not full or not os.path.isfile(full):
        return {"ok": False, "error": "LoRA file not found", "notes": "", "source": None}

    roots = [
        os.path.normcase(os.path.abspath(r))
        for r in (folder_paths.get_folder_paths("loras") or [])
    ]
    abs_full = os.path.normcase(os.path.abspath(full))
    if not any(abs_full == root or abs_full.startswith(root + os.sep) for root in roots):
        return {"ok": False, "error": "Path outside loras", "notes": "", "source": None}

    base, _ext = os.path.splitext(full)
    for note_ext in _NOTE_EXTS:
        note_path = base + note_ext
        if not os.path.isfile(note_path):
            continue
        try:
            with open(note_path, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read(_NOTE_MAX_BYTES)
        except Exception as exc:
            return {"ok": False, "error": str(exc), "notes": "", "source": None}
        return {
            "ok": True,
            "notes": text.strip(),
            "source": os.path.basename(note_path),
        }

    return {"ok": True, "notes": "", "source": None}


async def get_lora_note(request):
    filename = request.rel_url.query.get("file") or ""
    result = _read_lora_sidecar_note(filename)
    status = 200 if result.get("ok") else 400
    return web.json_response(result, status=status)


def _find_toolkit_db():
    """Soft-locate ComfyUI-Civitai-Toolkit SQLite (data/civitai_helper.db)."""
    global _toolkit_db_path
    if _toolkit_db_path is not None:
        return _toolkit_db_path or None
    try:
        import folder_paths

        base = getattr(folder_paths, "base_path", None) or os.getcwd()
    except Exception:
        base = os.getcwd()

    hit = None
    root = os.path.join(base, "custom_nodes")
    if os.path.isdir(root):
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [
                d
                for d in dirnames
                if d not in ("node_modules", ".git", "__pycache__", "web", "js", "dist")
            ]
            if "civitai_helper.db" in filenames and os.path.basename(dirpath) == "data":
                hit = os.path.join(dirpath, "civitai_helper.db")
                break

    _toolkit_db_path = hit or False
    return hit


def _toolkit_setting(conn, key, default=None):
    cur = conn.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cur.fetchone()
    if not row:
        return default
    raw = row["value"] if hasattr(row, "keys") else row[0]
    try:
        return json.loads(raw)
    except Exception:
        return raw if raw is not None else default


def _resolve_civitai_page_url(file_hash: str) -> dict:
    """
    On-demand Civitai page URL for one LoRA hash via Toolkit DB.
    Does not scan the library or hit the network — one SQLite lookup.
    """
    h = str(file_hash or "").strip()
    if not h:
        return {"ok": False, "error": "Missing hash", "url": ""}

    db_path = _find_toolkit_db()
    if not db_path or not os.path.isfile(db_path):
        return {"ok": False, "error": "Toolkit DB not found", "url": ""}

    try:
        import sqlite3

        conn = sqlite3.connect(db_path, timeout=5)
        conn.row_factory = sqlite3.Row
        domain = "civitai.work" if _toolkit_setting(conn, "network_choice", "com") == "work" else "civitai.com"
        cur = conn.execute(
            "SELECT model_id, version_id, api_response FROM versions WHERE hash = ? COLLATE NOCASE",
            (h,),
        )
        ver = cur.fetchone()
        conn.close()
    except Exception as exc:
        return {"ok": False, "error": str(exc), "url": ""}

    if not ver:
        return {"ok": False, "error": "Hash not in Toolkit DB", "url": ""}

    model_id = ver["model_id"]
    version_id = ver["version_id"]
    if (not model_id or not version_id) and ver["api_response"]:
        try:
            api = json.loads(ver["api_response"])
            if not model_id:
                model_id = api.get("modelId") or (api.get("model") or {}).get("id")
            if not version_id:
                version_id = api.get("id")
        except Exception:
            pass

    if not model_id:
        return {"ok": False, "error": "No Civitai model id", "url": ""}

    url = f"https://{domain}/models/{int(model_id)}"
    if version_id:
        url += f"?modelVersionId={int(version_id)}"
    return {
        "ok": True,
        "url": url,
        "model_id": int(model_id),
        "version_id": int(version_id) if version_id else None,
        "domain": domain,
    }


async def get_civitai_url(request):
    file_hash = request.rel_url.query.get("hash") or ""
    result = _resolve_civitai_page_url(file_hash)
    status = 200 if result.get("ok") else 404
    return web.json_response(result, status=status)


_existing = {getattr(route, "path", None) for route in PromptServer.instance.routes}
if SAVE_ROUTE not in _existing:
    PromptServer.instance.routes.post(SAVE_ROUTE)(save_layout)
    PromptServer.instance.routes.get(LIST_ROUTE)(list_layouts)
    PromptServer.instance.routes.patch(SAVE_ROUTE)(update_layout)
    PromptServer.instance.routes.delete(SAVE_ROUTE)(delete_layout)
if FOLDERS_ROUTE not in _existing:
    PromptServer.instance.routes.get(FOLDERS_ROUTE)(list_layout_folders)
    PromptServer.instance.routes.patch(FOLDERS_ROUTE)(update_layout_folder)
    PromptServer.instance.routes.delete(FOLDERS_ROUTE)(delete_layout_folder)
if PRESETS_ROUTE not in _existing:
    PromptServer.instance.routes.post(PRESETS_ROUTE)(save_preset)
    PromptServer.instance.routes.get(PRESETS_ROUTE)(list_presets)
    PromptServer.instance.routes.patch(PRESETS_ROUTE)(update_preset)
    PromptServer.instance.routes.delete(PRESETS_ROUTE)(delete_preset)
if CATEGORIES_ROUTE not in _existing:
    PromptServer.instance.routes.get(CATEGORIES_ROUTE)(list_categories)
    PromptServer.instance.routes.patch(CATEGORIES_ROUTE)(update_category)
    PromptServer.instance.routes.delete(CATEGORIES_ROUTE)(delete_category)
if TEMPLATES_ROUTE not in _existing:
    PromptServer.instance.routes.post(TEMPLATES_ROUTE)(save_template)
    PromptServer.instance.routes.get(TEMPLATES_ROUTE)(list_templates)
    PromptServer.instance.routes.patch(TEMPLATES_ROUTE)(update_template)
    PromptServer.instance.routes.delete(TEMPLATES_ROUTE)(delete_template)
if TEMPLATE_FOLDERS_ROUTE not in _existing:
    PromptServer.instance.routes.get(TEMPLATE_FOLDERS_ROUTE)(list_template_folders)
    PromptServer.instance.routes.patch(TEMPLATE_FOLDERS_ROUTE)(update_template_folder)
    PromptServer.instance.routes.delete(TEMPLATE_FOLDERS_ROUTE)(delete_template_folder_route)
if PREFS_ROUTE not in _existing:
    PromptServer.instance.routes.get(PREFS_ROUTE)(get_prefs)
    PromptServer.instance.routes.patch(PREFS_ROUTE)(update_prefs)
if AUTOCOMPLETE_ROUTE not in _existing:
    PromptServer.instance.routes.get(AUTOCOMPLETE_ROUTE)(autocomplete_lookup)
    PromptServer.instance.routes.get(f"{AUTOCOMPLETE_ROUTE}/list")(autocomplete_list)
    PromptServer.instance.routes.get(f"{AUTOCOMPLETE_ROUTE}/buckets")(autocomplete_buckets)
    PromptServer.instance.routes.post(AUTOCOMPLETE_ROUTE)(autocomplete_mutate)
if RESOLVE_LORA_ROUTE not in _existing:
    PromptServer.instance.routes.get(RESOLVE_LORA_ROUTE)(resolve_lora)
if LORA_NOTE_ROUTE not in _existing:
    PromptServer.instance.routes.get(LORA_NOTE_ROUTE)(get_lora_note)
if CIVITAI_URL_ROUTE not in _existing:
    PromptServer.instance.routes.get(CIVITAI_URL_ROUTE)(get_civitai_url)
