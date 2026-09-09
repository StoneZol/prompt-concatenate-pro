import { craftOutput } from "./join.js";

export const ENCODE_CLASS = "PromptCraftCLIPEncode";
export const CRAFT_CLASS = "PromptCraft";

/** Literals in API prompt — `text` matches CLIPTextEncode scanners. */
const META_KEYS = ["text", "negative"];

function parseGroups(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function craftFromNode(craftNode) {
  const raw = craftNode?.widgets?.find((w) => w.name === "blocks_data")?.value;
  return craftOutput(parseGroups(raw));
}

function isClass(node, className) {
  return node?.comfyClass === className || node?.type === className;
}

/** Hide on canvas/panel but keep value in API prompt JSON. */
export function hideMetaLiteralWidget(widget) {
  if (!widget) return;
  widget.hidden = true;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  widget.mouse = () => false;
  widget.computeLayoutSize = () => ({ minHeight: 0, maxHeight: 0, minWidth: 0 });
  widget.serialize = true;
  widget.options = {
    ...(widget.options || {}),
    hidden: true,
    serialize: true,
    multiline: true,
  };
  const el = widget.element || widget.inputEl || widget.textEl || widget.domElement;
  if (el?.style) {
    el.style.display = "none";
    el.style.pointerEvents = "none";
  }
}

function setMeta(encodeNode, str_pos, str_neg) {
  for (const widget of encodeNode.widgets || []) {
    if (widget.name === "text" && widget.value !== str_pos) widget.value = str_pos;
    if (widget.name === "negative" && widget.value !== str_neg) widget.value = str_neg;
  }
}

function resolveOrigin(graph, linkId) {
  let id = linkId;
  for (let i = 0; i < 16; i++) {
    if (id == null) return null;
    const link = graph.links?.[id];
    if (!link) return null;
    const origin = graph.getNodeById?.(link.origin_id) ?? graph._nodes_by_id?.[link.origin_id];
    if (!origin) return null;
    if (isClass(origin, CRAFT_CLASS)) return origin;
    if (origin.type === "Reroute" || origin.comfyClass === "Reroute") {
      const input = origin.inputs?.[0];
      id = input?.link;
      continue;
    }
    return null;
  }
  return null;
}

function craftUpstream(encodeNode) {
  const graph = encodeNode.graph;
  if (!graph) return null;
  for (const name of ["str_pos", "str_neg"]) {
    const input = encodeNode.inputs?.find((i) => i.name === name);
    if (input?.link == null) continue;
    const craft = resolveOrigin(graph, input.link);
    if (craft) return craft;
  }
  return null;
}

/** Copy joined prompts from linked PromptCraft into hidden meta widgets. */
export function syncEncodeNode(encodeNode) {
  if (!encodeNode || !isClass(encodeNode, ENCODE_CLASS)) return;
  const craft = craftUpstream(encodeNode);
  if (!craft) return;
  const { str_pos, str_neg } = craftFromNode(craft);
  setMeta(encodeNode, str_pos, str_neg);
}

/** After PromptCraft edits — push to every encode that feeds from this node. */
export function syncDownstreamEncodes(craftNode) {
  if (!craftNode || !isClass(craftNode, CRAFT_CLASS)) return;
  const graph = craftNode.graph;
  if (!graph) return;

  const seen = new Set();
  for (const output of craftNode.outputs || []) {
    for (const linkId of output.links || []) {
      const link = graph.links?.[linkId];
      if (!link) continue;
      let target = graph.getNodeById?.(link.target_id) ?? graph._nodes_by_id?.[link.target_id];
      if (target && (target.type === "Reroute" || target.comfyClass === "Reroute")) {
        const out = target.outputs?.[0];
        for (const rid of out?.links || []) {
          const rl = graph.links?.[rid];
          if (!rl) continue;
          target = graph.getNodeById?.(rl.target_id) ?? graph._nodes_by_id?.[rl.target_id];
          if (target && isClass(target, ENCODE_CLASS) && !seen.has(target.id)) {
            seen.add(target.id);
            syncEncodeNode(target);
          }
        }
        continue;
      }
      if (target && isClass(target, ENCODE_CLASS) && !seen.has(target.id)) {
        seen.add(target.id);
        syncEncodeNode(target);
      }
    }
  }
}

const STOCK_CLIP_TITLE = "CLIP Text Encode (Prompt)";

/**
 * Emit a stock-looking CLIPTextEncode pair and point sampler conditioning at them.
 * Readers then see the same shape as the default Comfy positive/negative CLIP nodes.
 * Canvas graph is unchanged; only the API `prompt` payload is adapted.
 */
export function injectClipEncodeMirrors(prompt) {
  const output = prompt?.output;
  if (!output || typeof output !== "object") return prompt;

  for (const [id, node] of Object.entries(output)) {
    if (node?.class_type !== ENCODE_CLASS) continue;
    const inputs = node.inputs;
    if (!inputs) continue;

    const pos =
      typeof inputs.text === "string"
        ? inputs.text
        : typeof inputs.positive === "string"
          ? inputs.positive
          : null;
    const neg = typeof inputs.negative === "string" ? inputs.negative : null;
    if (pos == null && neg == null) continue;

    if (pos != null) inputs.text = pos;

    const clip = Array.isArray(inputs.clip) ? inputs.clip : undefined;
    const posKey = `pc_meta_${id}_pos`;
    const negKey = `pc_meta_${id}_neg`;

    if (pos != null) {
      output[posKey] = {
        inputs: clip ? { text: pos, clip } : { text: pos },
        class_type: "CLIPTextEncode",
        _meta: { title: STOCK_CLIP_TITLE },
      };
    }
    if (neg != null) {
      output[negKey] = {
        inputs: clip ? { text: neg, clip } : { text: neg },
        class_type: "CLIPTextEncode",
        _meta: { title: STOCK_CLIP_TITLE },
      };
    }

    // KSampler / etc. → stock pair (same as default two CLIP Text Encode nodes).
    const idStr = String(id);
    for (const other of Object.values(output)) {
      const oin = other?.inputs;
      if (!oin) continue;
      if (pos != null && Array.isArray(oin.positive) && String(oin.positive[0]) === idStr) {
        oin.positive = [posKey, 0];
      }
      if (neg != null && Array.isArray(oin.negative) && String(oin.negative[0]) === idStr) {
        oin.negative = [negKey, 0];
      }
    }
  }
  return prompt;
}

export function installEncodeMetaSync(app) {
  if (app.__pcEncodeMetaSync) return;
  app.__pcEncodeMetaSync = true;

  app.registerExtension({
    name: "PromptConcatenatePro.EncodeMeta",

    async beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name !== ENCODE_CLASS) return;

      const onNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        const r = onNodeCreated?.apply(this, arguments);
        for (const name of META_KEYS) {
          let widget = this.widgets?.find((w) => w.name === name);
          if (!widget) {
            widget = this.addWidget("text", name, "", () => {}, { multiline: true });
          }
          hideMetaLiteralWidget(widget);
          widget.beforeQueued = () => {
            syncEncodeNode(this);
          };
        }
        syncEncodeNode(this);
        return r;
      };

      const onConnectionsChange = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function () {
        const r = onConnectionsChange?.apply(this, arguments);
        syncEncodeNode(this);
        return r;
      };
    },

    async setup() {
      if (app.__pcEncodeMetaPromptHook) return;
      app.__pcEncodeMetaPromptHook = true;
      const original = app.graphToPrompt?.bind(app);
      if (typeof original !== "function") return;
      app.graphToPrompt = async function (...args) {
        const result = await original(...args);
        try {
          injectClipEncodeMirrors(result);
        } catch (err) {
          console.warn("[PromptConcatenatePro] clip meta mirrors failed", err);
        }
        return result;
      };
    },
  });
}
