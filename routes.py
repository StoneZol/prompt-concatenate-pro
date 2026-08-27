"""HTTP routes for the Prompt Concatenate Pro preset library."""

from aiohttp import web
from server import PromptServer

from . import db

SAVE_ROUTE = "/prompt_craft/layouts"
LIST_ROUTE = "/prompt_craft/layouts"
FOLDERS_ROUTE = "/prompt_craft/layout_folders"
PRESETS_ROUTE = "/prompt_craft/presets"
CATEGORIES_ROUTE = "/prompt_craft/categories"
PREFS_ROUTE = "/prompt_craft/prefs"

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
if PREFS_ROUTE not in _existing:
    PromptServer.instance.routes.get(PREFS_ROUTE)(get_prefs)
    PromptServer.instance.routes.patch(PREFS_ROUTE)(update_prefs)
