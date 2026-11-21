import { test } from "node:test";
import assert from "node:assert/strict";
import { weaknessProfile, TRAINABLE_GROUPS } from "../app/core/weakness.js";
import { ownExercises, checkExercise, cleanDrill, DRILL_SCHEMA } from "../app/core/drill.js";
import { generateDrill } from "../app/core/ai.js";
import { parseImport } from "../app/core/backup.js";
import { fakeFetch, GOOD } from "./fixtures.mjs";

const E = (quote, correction, category, severity = "minor") => ({ quote, correction, category, severity, explanation: "Regel." });
const entry = (id, daysAgo, text, errors, words = 100, revisions = []) => ({
  id, createdAt: new Date(Date.UTC(2026, 10, 21 - daysAgo)).toISOString(), text, metrics: { words },
  analysis: { ...GOOD, errors, cefr: "B1" }, revisions,
});

test("Schwächenprofil: gewichtete Fehler je 100 Wörter, neuere zählen mehr, Wortschatz ausgenommen", () => {
  const entries = [
    entry(2, 0, "He go home. I have a apple.", [E("He go", "He goes", "subject_verb_agreement", "major"), E("a apple", "an apple", "article")]),
    entry(1, 7, "She work here. A informatio.", [E("She work", "She works", "subject_verb_agreement"), E("make photo", "take photo", "collocation")]),
  ];
  const p = weaknessProfile(entries, []);
  assert.deepEqual(TRAINABLE_GROUPS, ["grammar", "structure", "mechanics"]);
  assert.equal(p[0].id, "subject_verb_agreement");
  // (2·1 + 1·0,85) / (1 + 0,85) = 1,54 je 100 Wörter
  assert.ok(Math.abs(p[0].score - 2.85 / 1.85) < 1e-9);
  assert.equal(p[0].errorCount, 2);
  assert.ok(!p.some((x) => x.id === "collocation"));
  assert.equal(p.find((x) => x.id === "article").errorCount, 1);
});

test("Trend und Einfluss von Überarbeiten und Übungen", () => {
  const old = [0, 1, 2].map((i) => entry(10 + i, 20 + i, "x", [E("a", "b", "article"), E("c", "d", "article")]));
  const fresh = [0, 1, 2].map((i) => entry(20 + i, i, "x", []));
  const p = weaknessProfile([...fresh, ...old], []);
  assert.equal(p.find((x) => x.id === "article").trend, "better");
  const rev = [entry(1, 0, "x", [E("a", "b", "past_simple")], 100,
    [{ mode: "steps", tasks: [{ category: "past_simple", outcome: "shown" }, { category: "past_simple", outcome: "skipped" }] }])];
  const withRev = weaknessProfile(rev, []).find((x) => x.id === "past_simple");
  assert.ok(Math.abs(withRev.score - 2) < 1e-9, "1 + 0,5 + 0,5");
  const drills = [{ category: "past_simple", total: 10, correct: 10, createdAt: "2026-11-21T10:00:00Z" }];
  const withDrill = weaknessProfile(rev, drills).find((x) => x.id === "past_simple");
  assert.ok(Math.abs(withDrill.score - 1) < 1e-9, "volle Trefferquote halbiert");
  assert.equal(withDrill.lastDrill.correct, 10);
  assert.deepEqual(weaknessProfile([], []), []);
});

test("Eigene Übungen aus Fehlern einer Kategorie", () => {
  const entries = [
    entry(2, 0, "Yesterday I go home. Then I go out.", [E("I go", "I went", "past_simple"), E("I go out", "I went out", "past_simple")]),
    entry(1, 3, "Last year we live here.", [E("we live", "we lived", "past_simple"), E("here", "there", "word_choice")]),
  ];
  const ex = ownExercises(entries, "past_simple", 3);
  assert.equal(ex.length, 3);
  assert.deepEqual(ex[0], { type: "fix", source: "own", instruction: "Verbessere den Satz.", prompt: "Yesterday I go home.",
    options: [], answer: "Yesterday I went home.", accept: [], explanation: "Regel." });
  assert.equal(ex[2].prompt, "Last year we live here.");
  assert.equal(ownExercises(entries, "article").length, 0);
});

test("checkExercise: Varianten, Groß/klein und Satzzeichen je nach Kategorie", () => {
  const fill = { type: "fill", prompt: "She ___ (go) to school.", answer: "goes", accept: ["is going"], options: [] };
  assert.equal(checkExercise(fill, " Goes ", "subject_verb_agreement"), true);
  assert.equal(checkExercise(fill, "is going", "subject_verb_agreement"), true);
  assert.equal(checkExercise(fill, "go", "subject_verb_agreement"), false);
  const choose = { type: "choose", prompt: "I have ___ apple.", options: ["a", "an", "the"], answer: "an", accept: [] };
  assert.equal(checkExercise(choose, "an", "article"), true);
  assert.equal(checkExercise(choose, "a", "article"), false);
  const fix = { type: "fix", prompt: "on monday i go.", answer: "On Monday I go.", accept: [], options: [] };
  assert.equal(checkExercise(fix, "on monday i go", "capitalization"), false);
  assert.equal(checkExercise(fix, "On Monday I go", "capitalization"), true);
  assert.equal(checkExercise({ ...fix, answer: "He doesn't like it." }, "he doesn’t like it", "negation"), true);
  assert.equal(checkExercise({ type: "fix", prompt: "Hi how are you", answer: "Hi, how are you?", accept: [], options: [] }, "Hi how are you?", "punctuation"), false);
});

test("cleanDrill verwirft ungültige Übungen", () => {
  const ok = { type: "choose", instruction: "Wähle.", prompt: "I have ___ apple.", options: ["a", "an"], answer: "an", accept: [], explanation: "Vokal." };
  const out = cleanDrill({ exercises: [
    ok,
    { ...ok, answer: "the" },
    { ...ok, type: "fill", prompt: "no gap here", options: [] },
    { ...ok, type: "fill", prompt: "She ___ (go).", options: [], answer: "goes" },
    { ...ok, type: "fix", prompt: "He go.", options: [], answer: "He goes." },
    { ...ok, type: "fix", prompt: "Same.", options: [], answer: "Same." },
  ] });
  assert.deepEqual(out.map((x) => x.type), ["choose", "fill", "fix"]);
  assert.equal(out[1].options.length, 0);
});

test("generateDrill: Kategorie, Niveau und eigene Sätze im Prompt; zu wenige gültige → Fehler", async () => {
  const claude = { id: "c", type: "anthropic", name: "C", apiKey: "k", model: "claude-opus-5-5" };
  const ex = { type: "fill", instruction: "Setz ein.", prompt: "She ___ (go).", options: [], answer: "goes", accept: [], explanation: "s" };
  const ans = (o) => ({ body: { content: [{ type: "text", text: JSON.stringify(o) }], stop_reason: "end_turn" } });
  const f = fakeFetch(ans({ exercises: [ex, ex, ex] }));
  const out = await generateDrill(claude, { category: "subject_verb_agreement", level: "B1", examples: ["He go home."], topics: ["My weekend"] }, { fetch: f });
  assert.equal(out.length, 3);
  const prompt = f.calls[0].body.messages[0].content.at(-1).text;
  assert.match(prompt, /subject_verb_agreement/);
  assert.match(prompt, /B1/);
  assert.match(prompt, /He go home\./);
  assert.equal(f.calls[0].body.output_config.format.schema.properties.exercises.type, "array");
  const g = fakeFetch(ans({ exercises: [ex] }));
  await assert.rejects(generateDrill(claude, { category: "article", level: "A2", examples: [], topics: [] }, { fetch: g }), (e) => e.code === "bad_output");
  assert.ok(DRILL_SCHEMA.properties.exercises.items.properties.type.enum.includes("choose"));
});

test("Sicherung: Übungsergebnisse werden geprüft übernommen", () => {
  const parsed = parseImport({ app: "skilltracker", version: 1, entries: [], settings: { drills: [
    { createdAt: "2026-11-20T10:00:00Z", category: "article", total: 6, correct: 4 },
    { createdAt: "x", category: "article", total: 6, correct: 4 },
    { createdAt: "2026-11-20T10:00:00Z", category: "evil", total: 6, correct: 4 },
    { createdAt: "2026-11-20T10:00:00Z", category: "article", total: 2, correct: 5 },
  ] } });
  assert.equal(parsed.settings.drills.length, 1);
});
