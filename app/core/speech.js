// Aussprache: Zielsätze, Wort-Abgleich (Verständlichkeit), Selbsteinschätzung, Zusammenfassung.
import { sentenceSpans } from "./revision.js";

export const SPEECH_TYPES = ["openai", "compatible", "gemini"]; // Anbieter, die Audio verstehen
const SELF = { good: 100, ok: 60, hard: 20 };
const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*['’]?/g;

// Vergleich ohne Apostrophe (Spracherkennungen hören sie nicht); angezeigt wird die Originalform.
const norm = (w) => w.replace(/['’]/g, "").toLowerCase();
const shown = (w) => w.replace(/’/g, "'").toLowerCase();
const words = (s) => String(s || "").match(WORD) || [];

export const selfScore = (rating) => SELF[rating] ?? 0;

// Längste gemeinsame Teilfolge der Wörter: welche Zielwörter kamen (in der richtigen Reihenfolge) vor?
export function alignWords(target, heard) {
  const t = words(target);
  const tn = t.map(norm);
  const hn = words(heard).map(norm);
  const n = tn.length;
  const m = hn.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) dp[i][j] = tn[i] === hn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ok = new Array(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (tn[i] === hn[j]) { ok[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const tokens = t.map((word, i) => ({ word, ok: ok[i] }));
  const matched = ok.filter(Boolean).length;
  const missed = [...new Set(t.filter((_, i) => !ok[i]).map(shown))];
  return { tokens, score: n ? Math.round((matched / n) * 100) : 0, missed };
}

export function summarizeSpeaking(sentences) {
  const list = sentences.filter((s) => Number.isFinite(s.score));
  const score = list.length ? Math.round(list.reduce((a, s) => a + s.score, 0) / list.length) : 0;
  const counts = new Map();
  for (const s of list) for (const w of s.missed || []) counts.set(w, (counts.get(w) || 0) + 1);
  const order = [...counts.keys()];
  const missed = order.sort((a, b) => counts.get(b) - counts.get(a) || order.indexOf(a) - order.indexOf(b));
  return { score, missed: missed.slice(0, 50) };
}

// Sätze zum Nachsprechen: verbesserte Fassung, letzte eigene Überarbeitung oder der eigene Text.
export function speakingSentences(entry, source = "improved") {
  let text = "";
  if (source === "improved") text = entry?.analysis?.improved_text || "";
  else if (source === "revision") {
    const last = [...(entry?.revisions || [])].filter((r) => r.revisedText).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
    text = last?.revisedText || "";
  } else text = entry?.text || "";
  return sentenceSpans(text).map((s) => text.slice(s.start, s.end).replace(/\s+/g, " ").trim()).filter((s) => words(s).length);
}
