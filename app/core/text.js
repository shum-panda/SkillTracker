// Text zerlegen: Wörter und Sätze.

const WORD = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
const ABBREV = /\b(e\.g|i\.e|mr|mrs|ms|dr|etc|vs)\./gi;
const HOLD = "\u0000";

export function tokenize(text) {
  return (String(text || "").replace(/[’‘`]/g, "'").match(WORD) || []).map((w) => w.toLowerCase());
}

export function splitSentences(text) {
  const out = [];
  for (const para of String(text || "").split(/\n\s*\n/)) {
    const held = para.replace(ABBREV, (m) => m.replace(/\./g, HOLD));
    for (const s of held.split(/(?<=[.!?])\s+/)) {
      const clean = s.replace(/\u0000/g, ".").replace(/\s+/g, " ").trim();
      if (clean) out.push(clean);
    }
  }
  return out;
}
