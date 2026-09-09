import { craftOutput } from "./join.js";

/** Stock CLIP text sockets we materialize into. */
const CLIP_TEXT_NAMES = new Set(["text", "text_g", "text_l"]);

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

function setClipTextWidget(node, value) {
  const widget =
    node.widgets?.find((w) => w.name === "text") ||
    node.widgets?.find((w) => w.name === "text_g") ||
    node.widgets?.find((w) => CLIP_TEXT_NAMES.has(w.name));
  if (!widget) return false;
  widget.value = value ?? "";
  return true;
}

function materializeTarget(origin, originSlot, target, targetSlot, text) {
  const input = target?.inputs?.[targetSlot];
  if (!target || !input || !CLIP_TEXT_NAMES.has(input.name)) return null;

  setClipTextWidget(target, text);
  target.disconnectInput?.(targetSlot);
  return {
    originId: origin.id,
    originSlot,
    targetId: target.id,
    targetSlot,
  };
}

/**
 * Copy join into downstream CLIP `text` widgets and drop STRING links for serialize.
 * API prompt then looks like the user typed into stock CLIP Text Encode.
 */
function materializeSlot(craftNode, outputSlot, text) {
  const graph = craftNode.graph;
  const output = craftNode.outputs?.[outputSlot];
  if (!graph || !output?.links?.length) return [];

  const pending = [];
  for (const linkId of [...(output.links || [])]) {
    const link = graph.links?.[linkId];
    if (!link) continue;
    let target = graph.getNodeById?.(link.target_id) ?? graph._nodes_by_id?.[link.target_id];
    let targetSlot = link.target_slot;

    if (target && (target.type === "Reroute" || target.comfyClass === "Reroute")) {
      const rerouteOut = target.outputs?.[0];
      for (const rid of [...(rerouteOut?.links || [])]) {
        const rl = graph.links?.[rid];
        if (!rl) continue;
        const dest = graph.getNodeById?.(rl.target_id) ?? graph._nodes_by_id?.[rl.target_id];
        const spec = materializeTarget(target, 0, dest, rl.target_slot, text);
        if (spec) pending.push(spec);
      }
      continue;
    }

    const spec = materializeTarget(craftNode, outputSlot, target, targetSlot, text);
    if (spec) pending.push(spec);
  }
  return pending;
}

function reconnectAll(graph, pending) {
  if (!graph || !pending?.length) return;
  for (const spec of pending) {
    const origin =
      graph.getNodeById?.(spec.originId) ?? graph._nodes_by_id?.[spec.originId];
    const target =
      graph.getNodeById?.(spec.targetId) ?? graph._nodes_by_id?.[spec.targetId];
    if (!origin || !target) continue;
    try {
      origin.connect?.(spec.originSlot, target, spec.targetSlot);
    } catch (err) {
      console.warn("[PromptConcatenatePro] reconnect after queue failed", err);
    }
  }
}

/**
 * Official widget hooks only — no app.graphToPrompt hijack.
 * beforeQueued: write joined prompts into stock CLIP text widgets, disconnect.
 * afterQueued: restore wires.
 */
export function attachPromptMaterializeHooks(node, dataWidget) {
  if (!node || !dataWidget || dataWidget.__pcMaterializeHooked) return;
  dataWidget.__pcMaterializeHooked = true;

  const prevBefore = dataWidget.beforeQueued;
  const prevAfter = dataWidget.afterQueued;

  const restore = () => {
    if (node.__pcReconnectTimer) {
      clearTimeout(node.__pcReconnectTimer);
      node.__pcReconnectTimer = null;
    }
    reconnectAll(node.graph, node.__pcReconnect);
    node.__pcReconnect = null;
  };

  dataWidget.beforeQueued = function () {
    prevBefore?.apply(this, arguments);
    const { str_pos, str_neg } = craftFromNode(node);
    node.__pcReconnect = [
      ...materializeSlot(node, 0, str_pos),
      ...materializeSlot(node, 1, str_neg),
    ];
    if (node.__pcReconnectTimer) clearTimeout(node.__pcReconnectTimer);
    node.__pcReconnectTimer = setTimeout(restore, 5000);
  };

  dataWidget.afterQueued = function () {
    restore();
    prevAfter?.apply(this, arguments);
  };
}
