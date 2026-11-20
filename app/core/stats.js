// Auswertungen über Einträge: häufigste Fehlerkategorien, Fehler je Gruppe.
import { categoryById, GROUPS } from "./taxonomy.js";

export function topCategories(entries, n = 5) {
  const counts = new Map();
  for (const e of entries || []) {
    for (const err of e?.analysis?.errors || []) {
      if (!categoryById(err.category)) continue;
      counts.set(err.category, (counts.get(err.category) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id, count]) => {
      const c = categoryById(id);
      return { id, label: c.label, group: c.group, count };
    });
}

export function errorGroupCounts(errors) {
  const out = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, 0]));
  for (const e of errors || []) {
    const g = categoryById(e?.category)?.group;
    if (g) out[g]++;
  }
  return out;
}
