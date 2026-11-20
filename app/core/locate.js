// Findet die Fehler-Zitate der KI im Text. Der Reihe nach ab dem vorigen Treffer, sonst von vorne;
// exakt, sonst ohne Groß/klein. Überlappende oder nicht gefundene Zitate bekommen keine Markierung.

function findFree(hay, needle, from, taken) {
  let i = hay.indexOf(needle, from);
  while (i !== -1) {
    const end = i + needle.length;
    if (!taken.some((t) => i < t.end && end > t.start)) return i;
    i = hay.indexOf(needle, i + 1);
  }
  return -1;
}

export function locateErrors(text, errors) {
  const src = String(text || "");
  const lower = src.toLowerCase();
  const taken = [];
  const out = [];
  let cursor = 0;
  (errors || []).forEach((e, index) => {
    const q = String(e?.quote || "");
    if (!q.trim()) return;
    let start = findFree(src, q, cursor, taken);
    if (start === -1) start = findFree(src, q, 0, taken);
    if (start === -1) start = findFree(lower, q.toLowerCase(), cursor, taken);
    if (start === -1) start = findFree(lower, q.toLowerCase(), 0, taken);
    if (start === -1) return;
    const span = { index, start, end: start + q.length };
    taken.push(span);
    out.push(span);
    cursor = span.end;
  });
  return out;
}
