/**
 * Simple fuzzy search: returns a score 0–1 for how well `str` matches `query`.
 * Returns 1 for exact/substring match, partial score for letter-order match, 0 for no match.
 */
export function fuzzyScore(str, query) {
  if (!str || !query) return 0;
  const s = str.toLowerCase();
  const q = query.toLowerCase();
  if (s.includes(q)) return 1;

  let si = 0, qi = 0, matched = 0;
  while (si < s.length && qi < q.length) {
    if (s[si] === q[qi]) { matched++; qi++; }
    si++;
  }
  return qi === q.length ? matched / s.length : 0;
}

/**
 * Filter a list of items by a fuzzy query across specified fields.
 * Items are returned sorted by best match score descending.
 */
export function fuzzyFilter(items, query, fields) {
  if (!query) return items;
  return items
    .map((item) => {
      const score = Math.max(
        ...fields.map((f) => fuzzyScore(String(item[f] ?? ""), query))
      );
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}