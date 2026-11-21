// Findet die Fehler-Zitate der KI im Text. Der Reihe nach ab dem vorigen Treffer, sonst von vorne;
// erst mit, dann ohne Groß/klein. Apostroph-Varianten (’ ‘ ` ') und Leerraum (Zeilenumbruch, mehrere Leerzeichen)
// gelten als gleich. Überlappende oder nicht gefundene Zitate bekommen keine Markierung.

const APOS = /['’‘`]/;

function pattern(quote) {
  let src = "";
  for (const part of quote.trim().split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { src += "\\s+"; continue; }
    for (const ch of part) src += APOS.test(ch) ? "['’‘`]" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return src;
}

function findFree(text, re, from, taken) {
  re.lastIndex = from;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[0].length && !taken.some((t) => start < t.end && end > t.start)) return { start, end };
    re.lastIndex = start + 1;
  }
  return null;
}

export function locateErrors(text, errors) {
  const src = String(text || "");
  const taken = [];
  const out = [];
  let cursor = 0;
  (errors || []).forEach((e, index) => {
    const q = String(e?.quote || "");
    if (!q.trim()) return;
    const p = pattern(q);
    const exact = new RegExp(p, "gu");
    const loose = new RegExp(p, "giu");
    const hit = findFree(src, exact, cursor, taken) || findFree(src, exact, 0, taken)
      || findFree(src, loose, cursor, taken) || findFree(src, loose, 0, taken);
    if (!hit) return;
    const span = { index, ...hit };
    taken.push(span);
    out.push(span);
    cursor = span.end;
  });
  return out;
}
