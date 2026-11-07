"""Prompt Concatenate Pro — stack prompt groups and join positive / negative strings."""

import json
import re

DEFAULT_SEPARATOR = ", "
# Keep in sync with js/pc/external.js
EXTERNAL_GROUP_ID = "pc_external_7f3a9c2e-4b1d-4e8a-9f06-1a2b3c4d5e6f"


def _normalize_prompt(text: str) -> str:
    if not text:
        return ""
    s = str(text).strip()
    s = re.sub(r"[ \t\r\n]+", " ", s)
    s = re.sub(r"\s*,\s*", ", ", s)
    s = re.sub(r"(,\s*){2,}", ", ", s)
    s = s.strip(" ,")
    s = re.sub(r"\.{4,}", "...", s)
    s = re.sub(r"(?<!\.)\.\.(?!\.)", ".", s)
    s = re.sub(r"!{2,}", "!", s)
    s = re.sub(r"\?{2,}", "?", s)
    return s.strip()


def _join_fields(parts, separator: str) -> str:
    chunks = []
    for part in parts:
        cleaned = _normalize_prompt(part)
        if cleaned:
            chunks.append(cleaned)
    if not chunks:
        return ""
    return _normalize_prompt(separator.join(chunks))


def _parse_blocks(raw) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("groups"), list):
        return data["groups"]
    return []


def _block_text(block: dict, key: str, external_pos: str, external_neg: str) -> str:
    if str(block.get("id") or "") == EXTERNAL_GROUP_ID:
        return external_pos if key == "positive" else external_neg
    return block.get(key, "") or ""


class PromptCraft:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "external_pos": ("STRING", {"forceInput": True, "default": ""}),
                "external_neg": ("STRING", {"forceInput": True, "default": ""}),
            },
            "hidden": {
                "blocks_data": ("STRING", {"default": "[]"}),
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("str_pos", "str_neg")
    FUNCTION = "craft"
    CATEGORY = "Prompt Concatenate Pro"
    # Still run when STRING links were temporarily dropped for PNG meta materialize.
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, blocks_data, external_pos=None, external_neg=None, **kwargs):
        return (blocks_data, external_pos or "", external_neg or "")

    def craft(
        self,
        blocks_data,
        external_pos=None,
        external_neg=None,
        unique_id=None,
        extra_pnginfo=None,
        **kwargs,
    ):
        ext_pos = external_pos if external_pos is not None else ""
        ext_neg = external_neg if external_neg is not None else ""
        blocks = _parse_blocks(blocks_data)

        positives = []
        negatives = []
        for block in blocks:
            if block.get("enabled", True) is False:
                continue
            positives.append(_block_text(block, "positive", ext_pos, ext_neg))
            negatives.append(_block_text(block, "negative", ext_pos, ext_neg))

        str_pos = _join_fields(positives, DEFAULT_SEPARATOR)
        str_neg = _join_fields(negatives, DEFAULT_SEPARATOR)
        print(f"[PromptConcatenatePro] str_pos ({len(str_pos)}): {str_pos!r}")
        print(f"[PromptConcatenatePro] str_neg ({len(str_neg)}): {str_neg!r}")

        if isinstance(extra_pnginfo, dict):
            extra_pnginfo["prompt_concatenate_pro"] = {
                "positive": str_pos,
                "negative": str_neg,
                "node_id": str(unique_id) if unique_id is not None else "",
            }

        return (str_pos, str_neg)


NODE_CLASS_MAPPINGS = {
    "PromptCraft": PromptCraft,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptCraft": "Prompt Concatenate Pro",
}
