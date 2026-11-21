// Einlesen und Bewerten: Anfrage schicken, Antwort prüfen, bei Formfehlern genau einmal nachfragen.
import { completeJSON } from "./providers/index.js";
import { badOutput } from "./providers/errors.js";
import { ANALYSIS_SCHEMA, OCR_SCHEMA, validate } from "./schema.js";
import { ANALYSIS_SYSTEM, DRILL_SYSTEM, JUDGE_SYSTEM, OCR_SYSTEM, analysisPrompt, drillPrompt, judgePrompt, ocrPrompt, retryPrompt } from "./prompts.js";
import { cleanDrill, DRILL_SCHEMA } from "./drill.js";
import { categoryById } from "./taxonomy.js";

async function askValid(provider, req, deps) {
  let value;
  let problems;
  try {
    value = await completeJSON(provider, req, deps);
    problems = validate(req.schema, value);
  } catch (e) {
    if (e?.code !== "bad_output") throw e;
    problems = [e.detail || e.message];
  }
  if (!problems.length) return value;
  let second;
  try {
    second = await completeJSON(provider, { ...req, prompt: retryPrompt(req.prompt, problems) }, deps);
  } catch (e) {
    if (e?.code === "bad_output") throw badOutput(`${provider.model}: ${e.detail || e.message}`);
    throw e;
  }
  const again = validate(req.schema, second);
  if (again.length) throw badOutput(`${provider.model}: ${again.slice(0, 3).join("; ")}`);
  return second;
}

export async function transcribe(provider, image, deps = {}) {
  const out = await askValid(provider, { system: OCR_SYSTEM, prompt: ocrPrompt(), image, schema: OCR_SCHEMA, schemaName: "transcription" }, deps);
  return out.text;
}

export function analyze(provider, text, topic, deps = {}) {
  return askValid(provider, {
    system: ANALYSIS_SYSTEM, prompt: analysisPrompt(text, topic), schema: ANALYSIS_SCHEMA, schemaName: "writing_feedback",
  }, deps);
}

export const JUDGE_SCHEMA = {
  type: "object", properties: { correct: { type: "boolean" }, feedback: { type: "string" } },
  required: ["correct", "feedback"], additionalProperties: false,
};

// Ist die Variante des Lernenden auch richtig? (Überarbeiten, „KI fragen“)
export function judgeRevision(provider, task, deps = {}) {
  return askValid(provider, { system: JUDGE_SYSTEM, prompt: judgePrompt(task), schema: JUDGE_SCHEMA, schemaName: "revision_check" }, deps);
}

// Übungen zu einer Fehlerart; ungültige werden verworfen, unter 3 gültigen gilt die Antwort als unbrauchbar.
export async function generateDrill(provider, { category, level, examples = [], topics = [], count = 6 }, deps = {}) {
  const c = categoryById(category);
  const raw = await askValid(provider, {
    system: DRILL_SYSTEM, schema: DRILL_SCHEMA, schemaName: "grammar_drill",
    prompt: drillPrompt({ category, label: c?.label || category, tip: c?.tip || "", level, examples: examples.slice(0, 3), topics: topics.slice(0, 5), count }),
  }, deps);
  const list = cleanDrill(raw, { category });
  if (list.length < 3) throw badOutput(`${provider.model}: nur ${list.length} brauchbare Übungen`);
  return list;
}
