import { test } from "node:test";
import assert from "node:assert/strict";
import { AXES, computeScores, reliability, averageScores } from "../app/core/scores.js";
import { locateErrors } from "../app/core/locate.js";
import { GOOD } from "./fixtures.mjs";

const metrics = { words: 100, sentences: 7, mtld: 70, levelShare: 0.1, levelCounted: 90, avgLen: 14, subPerSentence: 0.6 };
const err = (category, severity = "minor", quote = "x") => ({ quote, correction: "y", category, severity, explanation: "" });

test("Achsen in fester Reihenfolge", () => {
  assert.deepEqual(AXES.map((a) => a.key), ["grammar", "structure", "diversity", "level", "complexity", "style"]);
  for (const a of AXES) assert.ok(a.label && a.how, a.key);
});

test("Formeln der Spec", () => {
  const analysis = { ...GOOD, errors: [err("article"), err("past_simple", "major"), err("word_order"), err("spelling", "major")],
    style: { score: 62, comment: "" } };
  const s = computeScores(metrics, analysis);
  assert.equal(s.grammar, 69);     // d = 3  -> 100·e^(−3/8)
  assert.equal(s.structure, 78);   // d = 1  -> 100·e^(−1/4)
  assert.equal(s.diversity, 50);
  assert.equal(s.level, 40);
  assert.equal(s.complexity, 50);
  assert.equal(s.style, 62);
});

test("Satzbau d = 2 und Grenzen", () => {
  const s = computeScores(metrics, { ...GOOD, errors: [err("word_order", "major")] });
  assert.equal(s.structure, 61);
  const hi = computeScores({ ...metrics, mtld: 500, levelShare: 0.9, avgLen: 60, subPerSentence: 5 },
    { ...GOOD, errors: [], style: { score: 100, comment: "" } });
  assert.deepEqual(hi, { grammar: 100, structure: 100, diversity: 100, level: 100, complexity: 100, style: 100 });
  const lo = computeScores({ words: 0, sentences: 0, mtld: 0, levelShare: 0, levelCounted: 0, avgLen: 0, subPerSentence: 0 },
    { ...GOOD, errors: [err("article", "major")], style: { score: 0, comment: "" } });
  for (const v of Object.values(lo)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
});

test("reliability", () => {
  assert.equal(reliability(9), "too_short");
  assert.equal(reliability(10), "short");
  assert.equal(reliability(49), "short");
  assert.equal(reliability(50), "ok");
});

test("locateErrors: der Reihe nach, doppelte Zitate, fehlende und überlappende", () => {
  const text = "Yesterday he go home and he go to bed.";
  const spans = locateErrors(text, [err("verb_form", "major", "he go"), err("verb_form", "major", "he go"),
    err("article", "minor", "not there"), err("spelling", "minor", "go home")]);
  assert.deepEqual(spans, [{ index: 0, start: 10, end: 15 }, { index: 1, start: 25, end: 30 }]);
  const ci = locateErrors("He Go home.", [err("verb_form", "major", "he go")]);
  assert.deepEqual(ci, [{ index: 0, start: 0, end: 5 }]);
  assert.deepEqual(locateErrors("abc", [err("x", "minor", "")]), []);
});

test("locateErrors: Zitat vor einem früheren Treffer wird trotzdem gefunden", () => {
  const spans = locateErrors("a b c d", [err("x", "minor", "c"), err("x", "minor", "a")]);
  assert.deepEqual(spans, [{ index: 0, start: 4, end: 5 }, { index: 1, start: 0, end: 1 }]);
});

test("averageScores", () => {
  assert.equal(averageScores([]), null);
  const a = { grammar: 50, structure: 60, diversity: 70, level: 80, complexity: 90, style: 100 };
  const b = { grammar: 51, structure: 60, diversity: 70, level: 80, complexity: 90, style: 0 };
  assert.deepEqual(averageScores([{ scores: a }, { scores: b }]),
    { grammar: 51, structure: 60, diversity: 70, level: 80, complexity: 90, style: 50 });
});
