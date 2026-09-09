"""Prompt Concatenate Pro — stack prompt groups and join positive / negative strings."""

import json
import re

DEFAULT_SEPARATOR = ", "


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
    return data if isinstance(data, list) else []


class PromptCraft:
    @classmethod
    def INPUT_TYPES(cls):
        return {
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
    def IS_CHANGED(cls, blocks_data, **kwargs):
        return blocks_data

    def craft(self, blocks_data, unique_id=None, extra_pnginfo=None, **kwargs):
        blocks = _parse_blocks(blocks_data)
        positives = [block.get("positive", "") for block in blocks if block.get("enabled", True) is not False]
        negatives = [block.get("negative", "") for block in blocks if block.get("enabled", True) is not False]
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
