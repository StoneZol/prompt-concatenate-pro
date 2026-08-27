/** Shared library search: AND tokens; optional `shelf\ rest` / `shelf/ rest` path filter. */

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {{ shelf: string|null, tokens: string[], hasShelfFilter: boolean }}
 */
export function parseSearchQuery(raw) {
  const text = String(raw || "").trim();
  if (!text) return { shelf: null, tokens: [], hasShelfFilter: false };

  const sep = text.search(/[\\/]/);
  if (sep < 0) {
    return { shelf: null, tokens: tokenize(text), hasShelfFilter: false };
  }

  const shelf = text.slice(0, sep).trim().toLowerCase() || null;
  const rest = text.slice(sep + 1).trim();
  return {
    shelf,
    tokens: tokenize(rest),
    hasShelfFilter: true,
  };
}

function includesAll(haystack, tokens) {
  if (!tokens.length) return true;
  const h = String(haystack || "").toLowerCase();
  return tokens.every((token) => h.includes(token));
}

function shelfLabel(name, emptyLabel = "Uncategorised") {
  const trimmed = String(name || "").trim();
  return trimmed || emptyLabel;
}

/**
 * Prompt pair: optional collection filter, then AND over name/desc/body.
 * Plain query (no `\`/`/`): AND over collection + name/desc/body.
 */
export function matchesPromptPreset(preset, rawQuery) {
  const { shelf, tokens, hasShelfFilter } = parseSearchQuery(rawQuery);
  if (!hasShelfFilter && !tokens.length) return true;

  const category = shelfLabel(preset?.category);
  if (shelf && !category.toLowerCase().includes(shelf)) return false;

  if (!tokens.length) return true;

  const fields = hasShelfFilter
    ? [preset?.title, preset?.description, preset?.positive, preset?.negative]
    : [category, preset?.title, preset?.description, preset?.positive, preset?.negative];

  return includesAll(fields.join(" "), tokens);
}

/**
 * Layout stack: optional folder filter, then AND over name/desc/slots.
 */
export function matchesLayoutPreset(layout, rawQuery, { emptyFolder = "Uncategorised" } = {}) {
  const { shelf, tokens, hasShelfFilter } = parseSearchQuery(rawQuery);
  if (!hasShelfFilter && !tokens.length) return true;

  const folder = shelfLabel(layout?.folder, emptyFolder);
  if (shelf && !folder.toLowerCase().includes(shelf)) return false;

  if (!tokens.length) return true;

  const slots = (layout?.slots || []).join(" ");
  const fields = hasShelfFilter
    ? [layout?.name, layout?.description, slots]
    : [folder, layout?.name, layout?.description, slots];

  return includesAll(fields.join(" "), tokens);
}
