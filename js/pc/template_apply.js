function slotHasText(value) {
  return Boolean(String(value || "").trim());
}

function slotHasContent(slot) {
  return slotHasText(slot?.positive) || slotHasText(slot?.negative);
}

function loadedMeta(slotOrGroup) {
  return {
    loadedTitle: (slotOrGroup?.loadedTitle || "").trim(),
    loadedCategory: (slotOrGroup?.loadedCategory || "").trim(),
    loadedDescription: (slotOrGroup?.loadedDescription || "").trim(),
  };
}

/** Serialize node groups into template slots — skip empty pos/neg pairs. */
export function serializeTemplateSlots(groups) {
  const slots = [];
  const seen = new Set();
  for (const group of groups || []) {
    const title = (group?.title || "").trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    if (!slotHasContent(group)) continue;
    seen.add(key);
    slots.push({
      title,
      positive: group.positive || "",
      negative: group.negative || "",
      enabled: group.enabled !== false,
      ...loadedMeta(group),
    });
  }
  return slots;
}

function normalizeActiveSlot(slot) {
  const title = (slot?.title || "").trim();
  if (!title || slot?.enabled === false) return null;
  return {
    title,
    positive: slot.positive || "",
    negative: slot.negative || "",
    ...loadedMeta(slot),
  };
}

function applySlotContent(target, slot) {
  if (slotHasText(slot.positive)) target.positive = slot.positive;
  if (slotHasText(slot.negative)) target.negative = slot.negative;
  if (slotHasText(slot.positive) || slotHasText(slot.negative)) {
    target.loadedTitle = slot.loadedTitle || "";
    target.loadedCategory = slot.loadedCategory || "";
    target.loadedDescription = slot.loadedDescription || "";
  }
  return target;
}

/**
 * Merge template onto node groups.
 * - Keep node order
 * - Match by title (case-insensitive)
 * - Non-empty template fields overwrite; empty keep node
 * - Loaded-pair chip restored when content is applied
 * - Disabled / missing-from-template slots skipped
 * - New slots append at end (template order)
 */
export function mergeTemplateGroups(groups, templateSlots, { newGroupId, stampLabels }) {
  const active = [];
  for (const slot of templateSlots || []) {
    const next = normalizeActiveSlot(slot);
    if (next) active.push(next);
  }

  const byKey = new Map();
  for (const slot of active) {
    byKey.set(slot.title.toLowerCase(), slot);
  }

  const result = [];
  const used = new Set();

  for (const group of groups || []) {
    const key = (group.title || "").trim().toLowerCase();
    const slot = key ? byKey.get(key) : null;
    const next = { ...group };
    if (slot) {
      used.add(key);
      applySlotContent(next, slot);
    }
    result.push(next);
  }

  for (const slot of active) {
    const key = slot.title.toLowerCase();
    if (used.has(key)) continue;
    result.push({
      id: newGroupId(),
      title: slot.title,
      positive: slot.positive,
      negative: slot.negative,
      enabled: true,
      ...loadedMeta(slot),
      ...stampLabels(slot.title),
    });
  }

  return result;
}

/** Full replace: only enabled template slots become groups. */
export function replaceTemplateGroups(templateSlots, { newGroupId, stampLabels }) {
  const groups = [];
  const seen = new Set();
  for (const slot of templateSlots || []) {
    const next = normalizeActiveSlot(slot);
    if (!next) continue;
    const key = next.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({
      id: newGroupId(),
      title: next.title,
      positive: next.positive,
      negative: next.negative,
      enabled: true,
      ...loadedMeta(next),
      ...stampLabels(next.title),
    });
  }
  return groups;
}
