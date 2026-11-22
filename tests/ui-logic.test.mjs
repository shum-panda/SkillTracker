import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { highlightHtml } from "../app/ui/highlight.js";
import { topCategories, errorGroupCounts } from "../app/core/stats.js";
import { demoEntries } from "../app/core/demo.js";
import { parseFreq } from "../app/core/freq.js";
import { ANALYSIS_SCHEMA, validate } from "../app/core/schema.js";
import { locateErrors } from "../app/core/locate.js";

const err = (category, quote) => ({ quote, correction: "", category, severity: "minor", explanation: "" });

test("highlightHtml: escaped Text mit Markierungen je Gruppe", () => {
  const html = highlightHtml("a <b> he go", [{ index: 0, start: 6, end: 11 }], [err("verb_form", "he go")]);
  assert.equal(html, 'a &lt;b&gt; <mark class="err grammar" data-i="0" tabindex="0">he go</mark>');
  assert.equal(highlightHtml("<i>x</i>", [], []), "&lt;i&gt;x&lt;/i&gt;");
  const two = highlightHtml("one two three", [{ index: 1, start: 8, end: 13 }, { index: 0, start: 0, end: 3 }],
    [err("spelling", "one"), err("word_order", "three")]);
  assert.equal(two, '<mark class="err mechanics" data-i="0" tabindex="0">one</mark> two ' +
    '<mark class="err structure" data-i="1" tabindex="0">three</mark>');
});

test("highlightHtml: Zeilenumbrüche bleiben als <br>", () => {
  assert.equal(highlightHtml("a\nb", [], []), "a<br>b");
});

test("topCategories zählt über alle Einträge, Gleichstand nach ID", () => {
  const entries = [
    { analysis: { errors: [err("article", "a"), err("preposition", "b"), err("article", "c")] } },
    { analysis: { errors: [err("preposition", "d"), err("spelling", "e")] } },
  ];
  assert.deepEqual(topCategories(entries, 2), [
    { id: "article", label: "Artikel", group: "grammar", count: 2 },
    { id: "preposition", label: "Präposition", group: "grammar", count: 2 },
  ]);
  assert.deepEqual(errorGroupCounts(entries[0].analysis.errors), { grammar: 3, structure: 0, vocabulary: 0, mechanics: 0 });
  assert.deepEqual(topCategories([], 3), []);
});

test("Demo-Einträge: gültige Analysen, auffindbare Zitate, berechnete Werte", () => {
  const freq = parseFreq(JSON.parse(readFileSync(new URL("../app/data/wordfreq-en.json", import.meta.url), "utf8")));
  const list = demoEntries(freq, new Date("2026-11-20T12:00:00Z"));
  assert.ok(list.length >= 4);
  for (const e of list) {
    assert.deepEqual(validate(ANALYSIS_SCHEMA, e.analysis), [], e.topic);
    assert.equal(locateErrors(e.text, e.analysis.errors).length, e.analysis.errors.length, `Zitate in „${e.topic}“`);
    for (const v of Object.values(e.scores)) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
    assert.ok(e.metrics.words >= 50, e.topic);
  }
  const dates = list.map((e) => e.createdAt);
  assert.deepEqual([...dates].sort(), dates, "älteste zuerst");
});

// --- Teil 7: Onboarding ---
import { onboardingDone, resultHtml, STEPS } from "../app/ui/views/welcome.js";
import { MemoryStore } from "../app/core/store.js";
import { defaultProfile } from "../app/core/profile.js";
import { recommendation } from "../app/core/plan.js";

test("Onboarding: fertig erst mit Profil; Ergebnis je nach KI", async () => {
  const s = new MemoryStore();
  assert.equal(await onboardingDone(s), false);
  await s.setSetting("profile", defaultProfile());
  assert.equal(await onboardingDone(s), true);
  assert.deepEqual(STEPS, ["concept1", "concept2", "concept3", "goal", "level", "motivation", "reminder", "result"]);
  const p = defaultProfile();
  const without = resultHtml(p, false);
  assert.match(without, /KI verbinden/);
  assert.doesNotMatch(without, /Ersten Text schreiben/);
  assert.match(resultHtml(p, true), /Ersten Text schreiben/);
  assert.match(without, /Demo ansehen/);
  assert.ok(without.includes(recommendation(p).text));
});

// --- Teil 7: Demo-Aktivität ---
import { demoActivity, demoProfile } from "../app/core/demo.js";
import { dayStats, levelOf } from "../app/core/activity.js";
import { cleanProfile } from "../app/core/profile.js";
import { cleanActivity } from "../app/core/backup.js";

test("Demo-Aktivität: 20 Wochen, deterministisch, alle Stufen", () => {
  const now = new Date(2026, 10, 20, 12);
  const a = demoActivity(now);
  assert.deepEqual(demoActivity(now), a);
  const days = [...new Set(a.map((e) => e.day))].sort();
  assert.ok(days[0] >= "2026-07-03" && days.at(-1) <= "2026-11-20", `${days[0]} … ${days.at(-1)}`);
  const levels = new Set([...dayStats(a).values()].map((d) => levelOf(d.score)));
  for (const l of [1, 2, 3, 4]) assert.ok(levels.has(l), `Stufe ${l}`);
  assert.ok(a.every((e) => cleanActivity(e)), "gültige Ereignisse");
  assert.ok(cleanProfile(demoProfile()));
});
