// pysssss "View Lora info" — same call as Ultimate LoRA Loader `i`,
// but Toolkit filenames are resolved to Comfy's exact loras list first.
// Soft dependency on comfyui-custom-scripts.

let _pysssssModelInfoUrl = null;

/**
 * Toolkit / mixed separators → exact name from folder_paths.get_filename_list("loras").
 * pysssss 404s (and hangs on Loading…) if the string doesn't match that list.
 */
export async function resolveComfyLoraName(loraPath) {
  const raw = String(loraPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw) return { ok: false, name: "", error: "Missing LoRA path" };
  try {
    const qs = new URLSearchParams({ file: raw });
    const res = await fetch(`/prompt_craft/resolve_lora?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (data?.ok && data.name) return { ok: true, name: String(data.name) };
    return {
      ok: false,
      name: "",
      error: data?.error || "LoRA not in Comfy loras list",
      tried: raw,
    };
  } catch (err) {
    return { ok: false, name: "", error: err?.message || "resolve_lora failed", tried: raw };
  }
}

export async function resolvePysssssModelInfoUrl() {
  if (_pysssssModelInfoUrl) return _pysssssModelInfoUrl;

  const known = [
    "/extensions/comfyui-custom-scripts/js/modelInfo.js",
    "/extensions/ComfyUI-Custom-Scripts/js/modelInfo.js",
  ];
  for (const url of known) {
    try {
      const res = await fetch(url, { method: "GET", cache: "force-cache" });
      if (res.ok) {
        _pysssssModelInfoUrl = url;
        return url;
      }
    } catch {
      /* try next */
    }
  }

  const list = await (await fetch("/extensions")).json();
  const hit = (list || []).find((p) => /custom-scripts\/js\/modelInfo\.js$/i.test(p));
  if (hit) {
    _pysssssModelInfoUrl = hit.startsWith("/") ? hit : `/${hit}`;
    return _pysssssModelInfoUrl;
  }

  throw new Error("comfyui-custom-scripts not found (needed for View Lora info)");
}

/**
 * @param {string} loraPath Toolkit filename or loader-style relative path
 * @param {object} [node] Comfy node (loader passes this)
 */
export async function openPysssssLoraInfo(loraPath, node) {
  try {
    const resolved = await resolveComfyLoraName(loraPath);
    if (!resolved.ok || !resolved.name) {
      alert(
        `Could not resolve LoRA for View info.\n` +
          `${resolved.tried || loraPath || ""}\n\n` +
          `${resolved.error || "Not found in Comfy loras list."}\n\n` +
          `Restart ComfyUI if you just added /prompt_craft/resolve_lora.`,
      );
      return;
    }
    const path = resolved.name;

    const url = await resolvePysssssModelInfoUrl();
    const mod = await import(/* @vite-ignore */ url);
    if (!mod?.LoraInfoDialog) {
      throw new Error("LoraInfoDialog export missing from modelInfo.js");
    }
    // Same call signature as Ultimate LoRA Loader.
    new mod.LoraInfoDialog(path, node).show("loras", path);
  } catch (e) {
    console.error("[PromptConcatenatePro] pysssss Lora info failed:", e);
    alert(
      `Could not open View Lora info.\nIs ComfyUI-Custom-Scripts (pysssss) installed?\n\n${e.message || e}`,
    );
  }
}
