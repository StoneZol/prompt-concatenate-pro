/** Shared library search: AND tokens; optional `shelf\ rest` / `path/to/shelf\ rest` / `shelf/ rest` filter. */

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizePathParts(raw) {
  return String(raw || "")
    .split(/[/\\]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {{ shelf: string|null, tokens: string[], hasShelfFilter: boolean }}
 */
export function parseSearchQuery(raw) {
  const text = String(raw || "").trim();
  if (!text) return { shelf: null, tokens: [], hasShelfFilter: false };

  // `\` wins: `Scene\kw`, `Scene/Walk\kw`, `looks\port\` (trailing \ = path only).
  // Bare `/` keeps the legacy split (`Scene/Walk` → shelf Scene, token Walk).
  if (text.includes("\\")) {
    const parts = text.split("\\");
    const trailingSlash = parts.length > 1 && parts[parts.length - 1].trim() === "";
    if (trailingSlash) {
      const shelf = normalizePathParts(parts.slice(0, -1).join("/")).join("/") || null;
      return {
        shelf: shelf ? shelf.toLowerCase() : null,
        tokens: [],
        hasShelfFilter: true,
      };
    }
    const shelf = normalizePathParts(parts.slice(0, -1).join("/")).join("/") || null;
    const rest = (parts[parts.length - 1] || "").trim();
    return {
      shelf: shelf ? shelf.toLowerCase() : null,
      tokens: tokenize(rest),
      hasShelfFilter: true,
    };
  }

  const sep = text.indexOf("/");
  if (sep < 0) {
    return { shelf: null, tokens: tokenize(text), hasShelfFilter: false };
  }

  const shelf =
    text
      .slice(0, sep)
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .join("/")
      .toLowerCase() || null;
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

/** Ordered segment match: `looks/port` → Looks/Portrait (substring per segment). */
function shelfPathMatches(category, shelf) {
  if (!shelf) return true;
  const cat = String(category || "").toLowerCase();
  const filterParts = shelf.split("/").map((p) => p.trim()).filter(Boolean);
  if (!filterParts.length) return true;
  if (filterParts.length === 1) return cat.includes(filterParts[0]);

  const catParts = cat.split("/").filter(Boolean);
  let i = 0;
  for (const part of filterParts) {
    while (i < catParts.length && !catParts[i].includes(part)) i += 1;
    if (i >= catParts.length) return false;
    i += 1;
  }
  return true;
}

/**
 * Empty folder/collection visibility while Show empty is on.
 * With an active query, the shelf name itself must match — don't leak unrelated empties.
 */
export function emptyShelfMatchesSearch(name, rawQuery) {
  const { shelf, tokens, hasShelfFilter } = parseSearchQuery(rawQuery);
  if (!hasShelfFilter && !tokens.length) return true;

  const label = String(name || "").toLowerCase();
  if (hasShelfFilter) {
    if (shelf && !shelfPathMatches(label, shelf)) return false;
    // Tokens may also target a sub-folder name: `looks\port` → Looks/Portrait.
    return includesAll(label, tokens);
  }
  return includesAll(label, tokens);
}

function shelfLabel(name, emptyLabel = "Uncategorised") {
  const trimmed = String(name || "").trim();
  return trimmed || emptyLabel;
}

/**
 * Prompt pair: optional collection filter, then AND over metadata.
 * When includeBody is true, positive/negative also participate.
 * Plain query (no `\`/`/`): AND over collection + name/desc (+ body).
 * With `shelf\token`: shelf scopes the collection path; tokens also match
 * path segments (so `looks\port` hits both pair "Portrait" and items under
 * Looks/Portrait).
 */
export function matchesPromptPreset(preset, rawQuery, { includeBody = false } = {}) {
  const { shelf, tokens, hasShelfFilter } = parseSearchQuery(rawQuery);
  if (!hasShelfFilter && !tokens.length) return true;

  const category = shelfLabel(preset?.category);
  if (shelf && !shelfPathMatches(category, shelf)) return false;

  if (!tokens.length) return true;

  const fields = [category, preset?.title, preset?.description];
  if (includeBody) fields.push(preset?.positive, preset?.negative);

  return includesAll(fields.join(" "), tokens);
}

/**
 * Layout stack: optional folder filter, then AND over name/desc/slots.
 */
export function matchesLayoutPreset(layout, rawQuery, { emptyFolder = "Uncategorised" } = {}) {
  const { shelf, tokens, hasShelfFilter } = parseSearchQuery(rawQuery);
  if (!hasShelfFilter && !tokens.length) return true;

  const folder = shelfLabel(layout?.folder, emptyFolder);
  if (shelf && !shelfPathMatches(folder, shelf)) return false;

  if (!tokens.length) return true;

  const slots = (layout?.slots || []).join(" ");
  const fields = [folder, layout?.name, layout?.description, slots];

  return includesAll(fields.join(" "), tokens);
}

/**
 * Template pack: folder filter + name/desc/slot titles (+ optional prompt bodies).
 */
export function matchesTemplatePreset(
  template,
  rawQuery,
  { emptyFolder = "Uncategorised", includeBody = false } = {},
) {
  const { shelf, tokens, hasShelfFilter } = parseSearchQuery(rawQuery);
  if (!hasShelfFilter && !tokens.length) return true;

  const folder = shelfLabel(template?.folder, emptyFolder);
  if (shelf && !shelfPathMatches(folder, shelf)) return false;

  if (!tokens.length) return true;

  const slotTitles = (template?.slots || [])
    .map((slot) => (typeof slot === "string" ? slot : slot?.title || ""))
    .join(" ");
  const fields = [folder, template?.name, template?.description, slotTitles];

  if (includeBody) {
    for (const slot of template?.slots || []) {
      if (typeof slot === "object" && slot) {
        fields.push(slot.positive, slot.negative);
      }
    }
  }

  return includesAll(fields.join(" "), tokens);
}
