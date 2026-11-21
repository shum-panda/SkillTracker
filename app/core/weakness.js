// Schwächenprofil: Welche Fehlerarten bremsen am meisten? Aus Texten, Überarbeitungen und Übungsergebnissen.
import { categoryById, CATEGORIES } from "./taxonomy.js";

export const TRAINABLE_GROUPS = ["grammar", "structure", "mechanics"]; // Wortschatz läuft über die Karteikarten
const RECENT_TEXTS = 10;
const DECAY = 0.85;

const trainable = (id) => TRAINABLE_GROUPS.includes(categoryById(id)?.group);
const weightOf = (e) => (e.severity === "major" ? 2 : 1);

function counts(entry) {
  const out = new Map();
  for (const e of entry.analysis?.errors || []) {
    if (!trainable(e.category)) continue;
    out.set(e.category, (out.get(e.category) || 0) + weightOf(e));
  }
  return out;
}

function rate(entries, id) {
  let errs = 0;
  let words = 0;
  for (const e of entries) {
    errs += counts(e).get(id) || 0;
    words += e.metrics.words;
  }
  return words ? (errs * 100) / words : 0;
}

export function weaknessProfile(allEntries, drills = []) {
  // Nur bewertete Texte mit Wortzahl zählen.
  const entries = [...allEntries].filter((e) => e?.analysis && (e.metrics?.words || 0) > 0)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, RECENT_TEXTS);
  if (!entries.length) return [];
  const perEntry = entries.map(counts);
  const weights = entries.map((_, i) => DECAY ** i);
  const wordWeight = entries.reduce((s, e, i) => s + weights[i] * (e.metrics.words / 100), 0);
  const chrono = [...entries].reverse();
  const half = Math.floor(chrono.length / 2);

  const out = [];
  for (const c of CATEGORIES) {
    if (!trainable(c.id)) continue;
    const weighted = perEntry.reduce((s, m, i) => s + weights[i] * (m.get(c.id) || 0), 0);
    let score = wordWeight ? weighted / wordWeight : 0;
    let errorCount = 0;
    for (const e of entries) errorCount += (e.analysis?.errors || []).filter((x) => x.category === c.id).length;
    let touched = errorCount > 0;
    // Überarbeiten: wie die Fehler gewichtet (Alter) und auf 100 Wörter bezogen; gutes Lösen halbiert höchstens.
    let adj = 0;
    entries.forEach((e, i) => {
      for (const r of e.revisions || []) {
        for (const t of r.tasks || []) {
          if (t.category !== c.id) continue;
          if (t.outcome === "shown" || t.outcome === "skipped") { adj += 0.5 * weights[i]; touched = true; }
          if (t.outcome === "solo") adj -= 0.3 * weights[i];
        }
      }
    });
    adj = wordWeight ? adj / wordWeight : 0;
    score = adj >= 0 ? score + adj : Math.max(score / 2, score + adj);
    const mine = drills.filter((d) => d.category === c.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const recent = mine.slice(0, 3);
    if (recent.length) {
      const total = recent.reduce((s, d) => s + d.total, 0);
      const acc = total ? recent.reduce((s, d) => s + d.correct, 0) / total : 0;
      score *= 1 - 0.5 * acc;
    }
    if (!touched && !score) continue;
    let trend = "flat";
    if (half >= 2) {
      const older = rate(chrono.slice(0, half), c.id);
      const newer = rate(chrono.slice(half), c.id);
      if (newer < older * 0.7 && older - newer > 0.2) trend = "better";
      else if (newer > older * 1.3 && newer - older > 0.2) trend = "worse";
    }
    out.push({ id: c.id, label: c.label, group: c.group, tip: c.tip, score, errorCount, trend, lastDrill: mine[0] || null });
  }
  return out.sort((a, b) => b.score - a.score || b.errorCount - a.errorCount || a.id.localeCompare(b.id));
}
