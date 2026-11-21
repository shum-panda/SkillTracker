// Grammatik-Übungen: aus eigenen Fehlern (offline) und von der KI (geprüft), lokale Antwortprüfung.
import { locateErrors } from "./locate.js";
import { checkAnswer, sentenceSpans } from "./revision.js";

const TYPES = ["choose", "fill", "fix"];
const INSTRUCTION = { choose: "Wähle die richtige Lösung.", fill: "Setz die richtige Form ein.", fix: "Verbessere den Satz." };
const str = { type: "string" };

export const DRILL_SCHEMA = {
  type: "object",
  properties: {
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: TYPES }, instruction: str, prompt: str,
          options: { type: "array", items: str }, answer: str, accept: { type: "array", items: str }, explanation: str,
        },
        required: ["type", "instruction", "prompt", "options", "answer", "accept", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["exercises"],
  additionalProperties: false,
};

const loose = (s) => String(s ?? "").replace(/[’‘`]/g, "'").replace(/[“”„]/g, '"').replace(/\s+/g, " ")
  .replace(/ ([.,!?;:])/g, "$1").trim();

// Übungen aus den eigenen Fehlern: der Satz, in dem der Fehler wirklich steht (alle Fehler eines Textes werden gemeinsam
// verortet, wie bei der Markierung). Ein Satz mit mehreren Fehlern dieser Art ergibt eine Übung zum ersten davon.
export function ownExercises(entries, category, n = 3) {
  const out = [];
  const seen = new Set();
  const sorted = [...entries].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  for (const entry of sorted) {
    const text = String(entry.text || "");
    const errors = entry.analysis?.errors || [];
    const spans = sentenceSpans(text);
    for (const hit of locateErrors(text, errors)) {
      const e = errors[hit.index];
      if (e.category !== category || out.length >= n) continue;
      const s = spans.find((x) => hit.start >= x.start && hit.start < x.end);
      if (!s || hit.end > s.end) continue;
      const raw = text.slice(s.start, s.end);
      const answerRaw = raw.slice(0, hit.start - s.start) + e.correction + raw.slice(hit.end - s.start);
      const sentence = loose(raw);
      const answer = loose(answerRaw);
      if (!answer || answer === sentence || seen.has(sentence)) continue;
      seen.add(sentence);
      out.push({ type: "fix", source: "own", instruction: INSTRUCTION.fix, prompt: sentence, options: [], answer,
        accept: [], explanation: String(e.explanation || ""), quote: e.quote, correction: e.correction });
    }
  }
  return out;
}

// Groß/klein bzw. Satzzeichen am Ende zählen nur, wenn genau das geübt wird.
export function checkExercise(ex, answer, category) {
  if (ex.source === "own" && ex.quote) {
    // Eigene Sätze: nur die Fehlerstelle zählt – weitere Verbesserungen im Satz sind kein Fehler.
    const r = checkAnswer(ex.prompt, ex.quote, ex.correction, answer);
    return r === "exact" || r === "fixed";
  }
  const caseSens = category === "capitalization";
  const punctSens = category === "punctuation";
  const norm = (s) => {
    let x = loose(s);
    if (!punctSens) x = x.replace(/[\s.!?]+$/, "");
    return caseSens ? x : x.toLowerCase();
  };
  const a = norm(answer);
  if (!a) return false;
  return [ex.answer, ...(ex.accept || [])].some((c) => norm(c) === a);
}

export function cleanDrill(raw, { category = "", max = 8 } = {}) {
  const caseSens = category === "capitalization";
  const key = (s) => (caseSens ? s : s.toLowerCase());
  const list = Array.isArray(raw?.exercises) ? raw.exercises : [];
  const out = [];
  for (const x of list) {
    if (!x || !TYPES.includes(x.type)) continue;
    const prompt = loose(x.prompt);
    const answer = loose(x.answer);
    if (!prompt || !answer || prompt.length > 400 || answer.length > 400) continue;
    let options = [];
    let accept = (Array.isArray(x.accept) ? x.accept : []).map(loose).filter(Boolean);
    if (x.type === "choose") {
      const seen = new Set();
      for (const o of (Array.isArray(x.options) ? x.options : []).map(loose).filter(Boolean)) {
        if (seen.has(key(o))) continue;
        seen.add(key(o));
        options.push(o === answer || key(o) !== key(answer) ? o : answer);
      }
      if (options.length < 2 || options.length > 5 || !options.includes(answer)) continue;
      const distractors = new Set(options.filter((o) => o !== answer).map(key));
      accept = accept.filter((a) => !distractors.has(key(a)));
    }
    if (x.type === "fill" && (prompt.match(/_{3,}/g) || []).length !== 1) continue;
    if (x.type === "fix" && key(prompt) === key(answer)) continue;
    out.push({ type: x.type, source: "ai", instruction: loose(x.instruction).slice(0, 120) || INSTRUCTION[x.type], prompt, options,
      answer, accept: accept.slice(0, 6), explanation: loose(x.explanation).slice(0, 600) });
    if (out.length >= max) break;
  }
  return out;
}
