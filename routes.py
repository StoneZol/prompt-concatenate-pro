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
LORA_NOTE_ROUTE = "/prompt_craft/lora_note"

_NOTE_EXTS = (".txt", ".md", ".caption")
_NOTE_MAX_BYTES = 65536


def _read_lora_sidecar_note(filename: str) -> dict:
    """Read Toolkit-style sidecar note next to a LoRA (same basename + .txt/.md)."""
    rel = str(filename or "").replace("\\", "/").strip().lstrip("/")
    if not rel or any(part == ".." for part in rel.split("/")):
        return {"ok": False, "error": "Invalid path", "notes": ""}

    try:
        import folder_paths
    except Exception:
        return {"ok": False, "error": "folder_paths unavailable", "notes": ""}

    full = folder_paths.get_full_path("loras", rel)
    if not full or not os.path.isfile(full):
        # Toolkit sometimes omits extension in relative paths — try as-is under loras roots.
        for root in folder_paths.get_folder_paths("loras") or []:
            candidate = os.path.normpath(os.path.join(root, rel.replace("/", os.sep)))
            if os.path.isfile(candidate):
                full = candidate
                break
    if not full or not os.path.isfile(full):
        return {"ok": False, "error": "LoRA file not found", "notes": ""}

    # Stay inside configured loras roots.
    roots = [os.path.normcase(os.path.abspath(r)) for r in (folder_paths.get_folder_paths("loras") or [])]
    abs_full = os.path.normcase(os.path.abspath(full))
    if not any(abs_full == root or abs_full.startswith(root + os.sep) for root in roots):
        return {"ok": False, "error": "Path outside loras", "notes": ""}

    base, _ext = os.path.splitext(full)
    for note_ext in _NOTE_EXTS:
        note_path = base + note_ext
        if not os.path.isfile(note_path):
            continue
        try:
            with open(note_path, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read(_NOTE_MAX_BYTES)
        except Exception as exc:
            return {"ok": False, "error": str(exc), "notes": ""}
        return {
            "ok": True,
            "notes": text.strip(),
            "source": os.path.basename(note_path),
        }

    return {"ok": True, "notes": "", "source": None}

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


async def get_lora_note(request):
    filename = request.rel_url.query.get("file") or ""
    result = _read_lora_sidecar_note(filename)
    status = 200 if result.get("ok") else 400
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
if LORA_NOTE_ROUTE not in _existing:
    PromptServer.instance.routes.get(LORA_NOTE_ROUTE)(get_lora_note)
