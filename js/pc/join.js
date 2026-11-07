import { isExternalGroup } from "./external.js";

const DEFAULT_SEPARATOR = ", ";

export function normalizePrompt(text) {
  if (!text) return "";
  let s = String(text).trim();
  s = s.replace(/[ \t\r\n]+/g, " ");
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/(,\s*){2,}/g, ", ");
  s = s.replace(/^[, ]+|[, ]+$/g, "");
  s = s.replace(/\.{4,}/g, "...");
  s = s.replace(/(?<!\.)\.\.(?!\.)/g, ".");
  s = s.replace(/!{2,}/g, "!");
  s = s.replace(/\?{2,}/g, "?");
  return s.trim();
}

export function joinFields(parts, separator = DEFAULT_SEPARATOR) {
  const chunks = [];
  for (const part of parts) {
    const cleaned = normalizePrompt(part);
    if (cleaned) chunks.push(cleaned);
  }
  if (!chunks.length) return "";
  return normalizePrompt(chunks.join(separator));
}

export function craftOutput(groups) {
  const enabled = (groups || []).filter((group) => group.enabled !== false);
  // External text comes from node inputs at execute time (Python); preview skips it.
  return {
    str_pos: joinFields(
      enabled.map((group) => (isExternalGroup(group) ? "" : group.positive)),
    ),
    str_neg: joinFields(
      enabled.map((group) => (isExternalGroup(group) ? "" : group.negative)),
    ),
  };
}

export function isJoinDebugEnabled(config) {
  if (config?.debug_join) return true;
  try {
    return localStorage.getItem("pc-debug-join") === "1";
  } catch {
    return false;
  }
}
