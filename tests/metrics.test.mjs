import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize, splitSentences } from "../app/core/text.js";
import { mtld, levelShare, complexity, computeMetrics } from "../app/core/metrics.js";

test("tokenize: klein, Apostrophe vereinheitlicht, Satzzeichen weg", () => {
  assert.deepEqual(tokenize("I don’t know, Mr. Smith!"), ["i", "don't", "know", "mr", "smith"]);
  assert.deepEqual(tokenize("123 ... !!!"), []);
});

test("splitSentences trennt nicht nach Abkürzungen", () => {
  assert.deepEqual(splitSentences("I went home. Mr. Lee was there! Was he?"),
    ["I went home.", "Mr. Lee was there!", "Was he?"]);
  assert.deepEqual(splitSentences("We need e.g. bread. Ok."), ["We need e.g. bread.", "Ok."]);
  assert.deepEqual(splitSentences("first line no dot\n\nsecond part"), ["first line no dot", "second part"]);
  assert.deepEqual(splitSentences("   "), []);
});

test("mtld: Wiederholung niedrig, lauter neue Wörter = Länge", () => {
  const same = Array(100).fill("go");
  assert.ok(mtld(same) < 5);
  const distinct = Array.from({ length: 100 }, (_, i) => "w" + i);
  assert.equal(mtld(distinct), 100);
  assert.equal(mtld([]), 0);
});

test("levelShare zählt nur Wörter aus der Liste", () => {
  const freq = new Map([["the", 7.7], ["house", 5.7], ["ubiquitous", 3.4]]);
  const r = levelShare(["the", "house", "ubiquitous", "xyzzy"], freq);
  assert.equal(r.counted, 3);
  assert.ok(Math.abs(r.share - 1 / 3) < 1e-9);
  assert.deepEqual(levelShare([], freq), { share: 0, counted: 0 });
});

test("complexity: Satzlänge und Nebensatz-Signale", () => {
  const c = complexity("I stayed because it rained. It was cold.");
  assert.equal(c.sentences, 2);
  assert.equal(c.avgLen, 4);
  assert.equal(c.subPerSentence, 0.5);
});

test("computeMetrics: leerer Text ergibt nur Nullen", () => {
  const m = computeMetrics("", new Map());
  for (const v of Object.values(m)) assert.equal(v, 0);
});
