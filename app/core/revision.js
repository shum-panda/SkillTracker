// Überarbeiten: Sätze mit Positionen, Aufgaben je Fehler, Antworten lokal prüfen, Fassung zusammensetzen.
import { locateErrors, pattern } from "./locate.js";
import { categoryById, categoryRank } from "./taxonomy.js";

const ABBR = new Set(["e.g.", "i.e.", "mr.", "mrs.", "ms.", "dr.", "etc.", "vs."]);

// Sätze als {start, end} (ohne führenden/abschließenden Leerraum). Enden an .!? vor Leerraum/Ende und an Zeilenumbrüchen.
export function sentenceSpans(text) {
  const src = String(text || "");
  const out = [];
  let start = null;
  const push = (s, e) => {
    while (e > s && /\s/.test(src[e - 1])) e--;
    if (e > s) out.push({ start: s, end: e });
  };
  for (let i = 0; i <= src.length; i++) {
    const ch = src[i];
    if (start === null) {
      if (i < src.length && !/\s/.test(ch)) start = i;
      continue;
    }
    if (i === src.length || ch === "\n") {
      push(start, i);
      start = null;
      continue;
    }
    if (/[.!?]/.test(ch)) {
      let j = i;
      while (/[.!?]/.test(src[j + 1] || "")) j++;
      if (j + 1 >= src.length || /\s/.test(src[j + 1])) {
        const word = (src.slice(start, j + 1).match(/(\S+)$/)?.[1] || "").toLowerCase();
        if (!ABBR.has(word)) {
          push(start, j + 1);
          start = null;
        }
      }
      i = j;
    }
  }
  return out;
}

// Aufgaben je gefundenem Fehler, sortiert nach Gruppe → Kategorie → Position (ein Konzept am Stück).
export function buildTasks(text, errors) {
  const src = String(text || "");
  const spans = locateErrors(src, errors);
  const sentences = sentenceSpans(src);
  // Fehler, die über eine Satzgrenze reichen: Sätze verschmelzen.
  for (const sp of spans) {
    const i = sentences.findIndex((s) => sp.start >= s.start && sp.start < s.end);
    if (i === -1) continue;
    while (sentences[i + 1] && sp.end > sentences[i].end) {
      sentences[i] = { start: sentences[i].start, end: sentences[i + 1].end };
      sentences.splice(i + 1, 1);
    }
  }
  const tasks = spans.map((sp) => {
    const e = errors[sp.index];
    const sentenceIndex = sentences.findIndex((s) => sp.start >= s.start && sp.start < s.end);
    return { errorIndex: sp.index, sentenceIndex, category: e.category, group: categoryById(e.category)?.group || "grammar",
      quote: e.quote, correction: e.correction, start: sp.start };
  }).filter((t) => t.sentenceIndex !== -1)
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.start - b.start);
  return {
    sentences: sentences.map((s) => ({ ...s, text: src.slice(s.start, s.end) })),
    tasks,
    unplaced: (errors || []).length - tasks.length,
  };
}

const norm = (s) => String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ")
  .replace(/\s+([.,!?;:])/g, "$1").replace(/[\s.,!?;:]+$/, "").trim();

function replaceQuote(sentence, quote, correction) {
  const re = new RegExp(pattern(quote), "iu");
  return re.test(sentence) ? sentence.replace(re, correction) : null;
}

// "exact" = wie erwartet · "fixed" = Fehler weg, Korrektur drin · "unchanged" · "different"
export function checkAnswer(sentence, quote, correction, answer) {
  const a = norm(answer);
  if (!a || a === norm(sentence)) return "unchanged";
  const expected = replaceQuote(sentence, quote, correction);
  if (expected !== null && a === norm(expected)) return "exact";
  const q = norm(quote);
  const c = norm(correction);
  const quoteGone = c.includes(q) || !a.includes(q);
  const correctionIn = !c || a.includes(c);
  return quoteGone && correctionIn && c !== q ? "fixed" : "different";
}

// Setzt bearbeitete Sätze (Index → neuer Text) in den Originaltext ein; Abstände dazwischen bleiben.
export function applySentences(text, spans, edits) {
  const src = String(text || "");
  let out = "";
  let pos = 0;
  spans.forEach((s, i) => {
    out += src.slice(pos, s.start) + (Object.hasOwn(edits, i) ? edits[i] : src.slice(s.start, s.end));
    pos = s.end;
  });
  return out + src.slice(pos);
}

export const OUTCOMES = ["solo", "hint", "ai", "self", "shown", "skipped", "done"];

export function summarizeRevision(tasks) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
  const shown = new Map();
  for (const t of tasks) {
    if (Object.hasOwn(counts, t.outcome)) counts[t.outcome]++;
    if (t.outcome === "shown") shown.set(t.category, (shown.get(t.category) || 0) + 1);
  }
  const hard = [...shown.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, label: categoryById(id)?.label || id, count }));
  return { counts, hard };
}

export const STEPS_FROM = 6;
export const recommendMode = (errorCount) => (errorCount >= STEPS_FROM ? "steps" : "whole");
