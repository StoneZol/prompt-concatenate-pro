/** Hardcoded id — used as group.id and as preset slot sentinel. */
export const EXTERNAL_GROUP_ID = "pc_external_7f3a9c2e-4b1d-4e8a-9f06-1a2b3c4d5e6f";
export const EXTERNAL_TITLE = "External";

export function isExternalGroup(group) {
  return Boolean(group && group.id === EXTERNAL_GROUP_ID);
}

export function isExternalSlotName(name) {
  return String(name || "").trim() === EXTERNAL_GROUP_ID;
}

export function makeExternalGroup({ enabled = true } = {}) {
  return {
    id: EXTERNAL_GROUP_ID,
    title: EXTERNAL_TITLE,
    positive: "",
    negative: "",
    enabled: enabled !== false,
    collapsed: false,
    // Display-only; never persisted into blocks_data.
    lastPositive: "",
    lastNegative: "",
  };
}

/** Slot name for layout presets (UUID sentinel). */
export function slotNameForGroup(group) {
  if (isExternalGroup(group)) return EXTERNAL_GROUP_ID;
  return String(group?.title || "").trim();
}

/** Human label for a saved slot name (UUID → External). */
export function displaySlotName(name) {
  return isExternalSlotName(name) ? EXTERNAL_TITLE : String(name || "").trim();
}

/** Strip runtime snapshot fields so workflow / PNG meta stay clean. */
export function serializeGroupForPersist(group) {
  if (!isExternalGroup(group)) return group;
  return {
    id: EXTERNAL_GROUP_ID,
    title: EXTERNAL_TITLE,
    positive: "",
    negative: "",
    enabled: group.enabled !== false,
    collapsed: Boolean(group.collapsed),
  };
}

export function findExternalIndex(groups) {
  return (groups || []).findIndex((g) => isExternalGroup(g));
}
