// Grammatik-Übungen: aus eigenen Fehlern (offline) und von der KI (geprüft), lokale Antwortprüfung.
import { locateErrors } from "./locate.js";
import { expectedSentence, sentenceSpans } from "./revision.js";

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

const loose = (s) => String(s ?? "").replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();

export function ownExercises(entries, category, n = 3) {
  const out = [];
  const seen = new Set();
  const sorted = [...entries].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  for (const entry of sorted) {
    const text = String(entry.text || "");
    const spans = sentenceSpans(text);
    for (const e of entry.analysis?.errors || []) {
      if (e.category !== category || out.length >= n) continue;
      const hit = locateErrors(text, [e])[0];
      if (!hit) continue;
      const s = spans.find((x) => hit.start >= x.start && hit.start < x.end);
      if (!s) continue;
      const sentence = loose(text.slice(s.start, s.end));
      const answer = expectedSentence(sentence, e.quote, e.correction);
      if (!answer || loose(answer) === sentence || seen.has(sentence)) continue;
      seen.add(sentence);
      out.push({ type: "fix", source: "own", instruction: INSTRUCTION.fix, prompt: sentence, options: [], answer: loose(answer),
        accept: [], explanation: String(e.explanation || "") });
    }
  }
  return out;
}

// Groß/klein bzw. Satzzeichen am Ende zählen nur, wenn genau das geübt wird.
export function checkExercise(ex, answer, category) {
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

export function cleanDrill(raw, max = 8) {
  const list = Array.isArray(raw?.exercises) ? raw.exercises : [];
  const out = [];
  for (const x of list) {
    if (!x || !TYPES.includes(x.type)) continue;
    const prompt = loose(x.prompt);
    const answer = loose(x.answer);
    if (!prompt || !answer || prompt.length > 400 || answer.length > 400) continue;
    let options = [];
    if (x.type === "choose") {
      options = [...new Set((Array.isArray(x.options) ? x.options : []).map(loose).filter(Boolean))];
      if (options.length < 2 || options.length > 5 || !options.includes(answer)) continue;
    }
    if (x.type === "fill" && !prompt.includes("___")) continue;
    if (x.type === "fix" && prompt.toLowerCase() === answer.toLowerCase()) continue;
    out.push({ type: x.type, source: "ai", instruction: loose(x.instruction) || INSTRUCTION[x.type], prompt, options, answer,
      accept: (Array.isArray(x.accept) ? x.accept : []).map(loose).filter(Boolean).slice(0, 6), explanation: loose(x.explanation) });
    if (out.length >= max) break;
  }
  return out;
}
