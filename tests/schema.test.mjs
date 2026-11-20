import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, GROUPS, categoryById } from "../app/core/taxonomy.js";
import { ANALYSIS_SCHEMA, OCR_SCHEMA, validate, wireSchema } from "../app/core/schema.js";
import { GOOD } from "./fixtures.mjs";

test("Kategorien: 36, eindeutig, gültige Gruppen", () => {
  assert.equal(CATEGORIES.length, 36);
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, 36);
  for (const c of CATEGORIES) assert.ok(GROUPS[c.group], c.id);
  assert.equal(categoryById("article").label, "Artikel");
  assert.equal(categoryById("nope"), undefined);
});

test("gültige Antwort besteht", () => {
  assert.deepEqual(validate(ANALYSIS_SCHEMA, GOOD), []);
  assert.deepEqual(validate(OCR_SCHEMA, { text: "hi" }), []);
});

test("Fehler werden mit Pfad gemeldet", () => {
  const bad = structuredClone(GOOD);
  bad.errors[0].category = "made_up";
  bad.style.score = 101;
  delete bad.summary;
  bad.extra = 1;
  const errs = validate(ANALYSIS_SCHEMA, bad).join("\n");
  assert.match(errs, /errors\[0\]\.category/);
  assert.match(errs, /style\.score/);
  assert.match(errs, /summary/);
  assert.match(errs, /extra/);
  assert.ok(validate(ANALYSIS_SCHEMA, null).length > 0);
  assert.ok(validate(ANALYSIS_SCHEMA, { ...GOOD, errors: "x" }).length > 0);
  assert.ok(validate(ANALYSIS_SCHEMA, { ...GOOD, style: { score: 5.5, comment: "" } }).length > 0);
});

test("wireSchema entfernt Grenzwerte, die nicht jeder Anbieter kennt", () => {
  const w = JSON.stringify(wireSchema(ANALYSIS_SCHEMA));
  assert.doesNotMatch(w, /minimum|maximum/);
  assert.match(JSON.stringify(ANALYSIS_SCHEMA), /maximum/);
});
