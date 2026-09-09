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


def _encode_conditioning(clip, text: str):
    """Same CONDITIONING shape as stock CLIPTextEncode."""
    tokens = clip.tokenize(text or "")
    if hasattr(clip, "encode_from_tokens_scheduled"):
        return clip.encode_from_tokens_scheduled(tokens)
    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
    return [[cond, {"pooled_output": pooled}]]


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


class PromptCraftCLIPEncode:
    """Dual CLIP encode.

    Wire feed: ``str_pos`` / ``str_neg`` (links — execute).
    Meta literals: hidden ``text`` / ``negative`` (PNG ``prompt``; ``text`` =
    CLIPTextEncode-compatible name for scanners). JS copies from PromptCraft.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "str_pos": ("STRING", {"forceInput": True, "default": ""}),
                "str_neg": ("STRING", {"forceInput": True, "default": ""}),
            },
            "hidden": {
                "text": ("STRING", {"default": ""}),
                "negative": ("STRING", {"default": ""}),
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "encode"
    CATEGORY = "Prompt Concatenate Pro"

    def encode(
        self,
        clip,
        str_pos,
        str_neg,
        text="",
        negative="",
        unique_id=None,
        extra_pnginfo=None,
    ):
        pos_text = str_pos or text or ""
        neg_text = str_neg or negative or ""
        pos_cond = _encode_conditioning(clip, pos_text)
        neg_cond = _encode_conditioning(clip, neg_text)

        if isinstance(extra_pnginfo, dict):
            extra_pnginfo["prompt_concatenate_pro"] = {
                "positive": pos_text,
                "negative": neg_text,
                "node_id": str(unique_id) if unique_id is not None else "",
            }
            extra_pnginfo["parameters"] = f"{pos_text}\nNegative prompt: {neg_text}"

        return (pos_cond, neg_cond)


NODE_CLASS_MAPPINGS = {
    "PromptCraft": PromptCraft,
    "PromptCraftCLIPEncode": PromptCraftCLIPEncode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptCraft": "Prompt Concatenate Pro",
    "PromptCraftCLIPEncode": "Prompt CLIP Encode",
}
