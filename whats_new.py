"""Current package version + short release notes from CHANGELOG.md."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

_ROOT = Path(__file__).resolve().parent
_PYPROJECT = _ROOT / "pyproject.toml"
_CHANGELOG = _ROOT / "changelog" / "CHANGELOG.md"
_SCREENSHOTS = (_ROOT / "docs" / "screenshots").resolve()

_DEFAULT_CHANGELOG_URL = (
    "https://github.com/StoneZol/prompt-concatenate-pro/blob/main/changelog/CHANGELOG.md"
)
_DISPLAY_NAME = "Prompt Concatenate Pro"

_VERSION_RE = re.compile(r'^version\s*=\s*"([^"]+)"', re.MULTILINE)
_CHANGELOG_URL_RE = re.compile(
    r'^Changelog\s*=\s*"([^"]+)"',
    re.MULTILINE,
)
_HEADING_RE = re.compile(r"^##\s*\[([^\]]+)\]")
_IMAGE_RE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$")

_ASSET_PREFIX = "/prompt_craft/asset/"


def read_package_version() -> str:
    try:
        text = _PYPROJECT.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = _VERSION_RE.search(text)
    return (match.group(1) or "").strip() if match else ""


def read_changelog_url() -> str:
    try:
        text = _PYPROJECT.read_text(encoding="utf-8")
    except OSError:
        return _DEFAULT_CHANGELOG_URL
    match = _CHANGELOG_URL_RE.search(text)
    url = (match.group(1) or "").strip() if match else ""
    return url or _DEFAULT_CHANGELOG_URL


def _strip_md_inline(text: str) -> str:
    out = text.strip()
    out = re.sub(r"!\[([^\]]*)\]\([^)]+\)", "", out)
    out = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", out)
    out = out.replace("**", "")
    return out.strip()


def _changelog_image_to_rel(raw_path: str) -> Optional[str]:
    """Map markdown image path (relative to CHANGELOG.md) → package-relative posix path under docs/screenshots."""
    raw = (raw_path or "").strip().replace("\\", "/")
    if not raw or raw.startswith(("http://", "https://", "data:")):
        return None
    try:
        resolved = (_CHANGELOG.parent / raw).resolve()
        resolved.relative_to(_SCREENSHOTS)
    except (OSError, ValueError):
        return None
    try:
        return resolved.relative_to(_ROOT).as_posix()
    except ValueError:
        return None


def resolve_asset_file(rel_path: str) -> Optional[Path]:
    """Safe file lookup for screenshot assets only."""
    raw = (rel_path or "").strip().replace("\\", "/").lstrip("/")
    if not raw or ".." in raw.split("/"):
        return None
    try:
        candidate = (_ROOT / raw).resolve()
        candidate.relative_to(_SCREENSHOTS)
    except (OSError, ValueError):
        return None
    if not candidate.is_file():
        return None
    return candidate


def parse_release_notes(markdown: str, version: str) -> Dict:
    """Pull `## [version]` section into short {sections, note}."""
    if not markdown or not version:
        return {"sections": [], "note": ""}

    lines = markdown.splitlines()
    start = -1
    for i, line in enumerate(lines):
        match = _HEADING_RE.match(line.strip())
        if match and match.group(1).strip() == version:
            start = i + 1
            break
    if start < 0:
        return {"sections": [], "note": ""}

    end = len(lines)
    for i in range(start, len(lines)):
        if _HEADING_RE.match(lines[i].strip()):
            end = i
            break

    sections: List[Dict] = []
    current = None
    notes: List[str] = []

    def ensure_section() -> Dict:
        nonlocal current
        if current is None:
            current = {"title": "", "items": []}
            sections.append(current)
        return current

    for raw in lines[start:end]:
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("<"):
            continue

        image = _IMAGE_RE.match(stripped)
        if image:
            rel = _changelog_image_to_rel(image.group(2))
            if not rel:
                continue
            ensure_section()["items"].append(
                {
                    "type": "image",
                    "alt": (image.group(1) or "").strip(),
                    "url": f"{_ASSET_PREFIX}{rel}",
                }
            )
            continue

        if stripped.startswith("### "):
            title = _strip_md_inline(stripped[4:])
            current = {"title": title, "items": []}
            sections.append(current)
            continue

        if stripped.startswith("- "):
            bullet = _strip_md_inline(stripped[2:])
            if not bullet:
                continue
            ensure_section()["items"].append({"type": "bullet", "text": bullet})
            continue

        if stripped.startswith(">"):
            note = _strip_md_inline(stripped.lstrip(">").strip())
            if note:
                notes.append(note)

    return {"sections": sections, "note": " ".join(notes).strip()}


def get_whats_new() -> Dict:
    version = read_package_version()
    changelog_url = read_changelog_url()
    sections: List[Dict] = []
    note = ""
    try:
        markdown = _CHANGELOG.read_text(encoding="utf-8")
        parsed = parse_release_notes(markdown, version)
        sections = parsed.get("sections") or []
        note = parsed.get("note") or ""
    except OSError:
        pass

    return {
        "ok": True,
        "version": version,
        "name": _DISPLAY_NAME,
        "sections": sections,
        "note": note,
        "changelogUrl": changelog_url,
    }
