import { test } from "node:test";
import assert from "node:assert/strict";
import { sentenceSpans, buildTasks, checkAnswer, applySentences, summarizeRevision, recommendMode } from "../app/core/revision.js";
import { CATEGORIES } from "../app/core/taxonomy.js";
import { judgeRevision } from "../app/core/ai.js";
import { parseImport, applyImport } from "../app/core/backup.js";
import { MemoryStore } from "../app/core/store.js";
import { fakeFetch, GOOD } from "./fixtures.mjs";

const err = (quote, correction, category) => ({ quote, correction, category, severity: "minor", explanation: "Erklärung" });

test("sentenceSpans: Sätze mit Positionen, Zeilenumbruch trennt", () => {
  const t = "I go home. He like it!\nNew line here";
  assert.deepEqual(sentenceSpans(t).map((s) => t.slice(s.start, s.end)), ["I go home.", "He like it!", "New line here"]);
  assert.deepEqual(sentenceSpans(""), []);
});

test("buildTasks: nach Gruppe und Kategorie sortiert, Satz zugeordnet, Unauffindbares gezählt", () => {
  const text = "Yesterday I go to a office. She work there.";
  const errors = [err("a office", "an office", "article"), err("I go", "I went", "past_simple"),
    err("She work", "She works", "subject_verb_agreement"), err("nicht da", "x", "spelling"), err("there", "there", "spelling")];
  const r = buildTasks(text, errors);
  assert.deepEqual(r.tasks.map((t) => t.errorIndex), [1, 2, 0, 4]); // past_simple, s-v-agreement, article (Taxonomie-Reihenfolge), dann mechanics
  assert.deepEqual(r.tasks.map((t) => t.sentenceIndex), [0, 1, 0, 1]);
  assert.equal(r.unplaced, 1);
  assert.equal(r.sentences.length, 2);
});

test("checkAnswer: exakt, behoben, unverändert, anders", () => {
  const s = "Yesterday I go to a office.";
  assert.equal(checkAnswer(s, "I go", "I went", "yesterday i went to a office"), "exact");
  assert.equal(checkAnswer(s, "I go", "I went", "Yesterday I went  to a office!"), "exact");
  assert.equal(checkAnswer(s, "I go", "I went", "I went to an office yesterday."), "fixed");
  assert.equal(checkAnswer(s, "I go", "I went", "Yesterday I go to a office."), "unchanged");
  assert.equal(checkAnswer(s, "I go", "I went", "Yesterday I walked to a office."), "different");
  assert.equal(checkAnswer("I don’t like the rents.", "the rents", "rents", "I don't like rents."), "exact");
  assert.equal(checkAnswer("He is is here.", "is is", "is", "He is here."), "exact");
  assert.equal(checkAnswer("He go.", "He go", "He goes", ""), "unchanged");
});

test("applySentences ersetzt nur bearbeitete Sätze und behält Abstände", () => {
  const text = "I go home.  He like it!\nBye.";
  const spans = sentenceSpans(text);
  assert.equal(applySentences(text, spans, { 1: "He likes it!" }), "I go home.  He likes it!\nBye.");
  assert.equal(applySentences(text, spans, {}), text);
});

test("summarizeRevision zählt Ergebnisse und schwere Kategorien", () => {
  const s = summarizeRevision([
    { category: "article", outcome: "solo" }, { category: "article", outcome: "shown" },
    { category: "past_simple", outcome: "hint" }, { category: "past_simple", outcome: "shown" }, { category: "spelling", outcome: "skipped" },
  ]);
  assert.deepEqual(s.counts, { solo: 1, hint: 1, ai: 0, self: 0, shown: 2, skipped: 1, done: 0 });
  assert.deepEqual(s.hard.map((h) => h.id), ["article", "past_simple"]);
});

test("recommendMode: ab 6 Fehlern Schritt für Schritt", () => {
  assert.equal(recommendMode(5), "whole");
  assert.equal(recommendMode(6), "steps");
});

test("jede Kategorie hat einen Merksatz", () => {
  for (const c of CATEGORIES) assert.ok(c.tip && c.tip.length > 15, c.id);
});

test("judgeRevision: Schema, Antwort, zweiter Versuch", async () => {
  const claude = { id: "c", type: "anthropic", name: "C", apiKey: "k", model: "claude-opus-5-5" };
  const ans = (o) => ({ body: { content: [{ type: "text", text: JSON.stringify(o) }], stop_reason: "end_turn" } });
  const f = fakeFetch(ans({ correct: "yes" }), ans({ correct: true, feedback: "Passt." }));
  const r = await judgeRevision(claude, { sentence: "He go.", answer: "He goes.", quote: "He go", correction: "He goes", category: "verb_form" }, { fetch: f });
  assert.deepEqual(r, { correct: true, feedback: "Passt." });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[0].body.messages[0].content.at(-1).text, /He goes\./);
});

test("Import: revisions geprüft, Verweise auf neue IDs umgeschrieben", async () => {
  const base = (id, extra) => ({ id, createdAt: `2026-11-0${id}T10:00:00Z`, topic: "", source: "typed", text: "Hello there my friend.",
    analysis: GOOD, metrics: { words: 4, sentences: 1, mtld: 4, levelShare: 0, levelCounted: 4, avgLen: 4, subPerSentence: 0 },
    scores: { grammar: 1, structure: 1, diversity: 1, level: 1, complexity: 1, style: 1 }, model: { ocr: "", analysis: "" }, ...extra });
  const file = { app: "skilltracker", version: 1, entries: [
    base(7, { revisions: [{ createdAt: "2026-11-07T11:00:00Z", mode: "steps", revisedText: "Hello.", resultEntryId: 9,
      tasks: [{ errorIndex: 0, category: "article", outcome: "solo", answer: "x" }, { errorIndex: 1, category: "evil", outcome: "solo", answer: "y" }] },
      { mode: "hack" }] }),
    base(9, { revisionOf: 7 }),
    base(8, { revisionOf: 99 }),
  ] };
  const parsed = parseImport(file);
  assert.equal(parsed.entries[0].revisions.length, 1);
  assert.equal(parsed.entries[0].revisions[0].tasks.length, 1);
  const s = new MemoryStore();
  await s.addEntry({ text: "already there" });
  await applyImport(s, parsed);
  const all = await s.listEntries();
  const orig = all.find((e) => e.revisions?.length);
  const rev = all.find((e) => e.revisionOf !== undefined);
  assert.equal(rev.revisionOf, orig.id);
  assert.equal(orig.revisions[0].resultEntryId, rev.id);
  assert.equal(all.filter((e) => e.revisionOf !== undefined).length, 1, "Verweis auf unbekannte ID verworfen");
});
