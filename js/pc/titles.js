/** Strip trailing " (N)" so Pose (2) → Pose for library shelves. */
export function baseShelfName(title) {
  return (title || "").trim().replace(/\s+\(\d+\)$/, "");
}

/** Next free name among a list of titles: Pose → Pose (2) → Pose (3). */
export function nextDuplicateName(names, title) {
  const base = baseShelfName(title) || "Untitled";
  const taken = new Set(
    (names || []).map((name) => String(name || "").trim().toLowerCase()).filter(Boolean),
  );
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n += 1;
  return `${base} (${n})`;
}

/** Next free title: Pose → Pose (2) → Pose (3). */
export function nextDuplicateTitle(groups, title) {
  return nextDuplicateName(
    (groups || []).map((group) => group.title),
    title,
  );
}
