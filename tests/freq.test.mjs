import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFreq, zipfOf } from "../app/core/freq.js";

test("parseFreq liest Bänder als Zipf-Werte", () => {
  const m = parseFreq({ bands: { "57": "house the", "34": "ubiquitous" } });
  assert.equal(zipfOf(m, "house"), 5.7);
  assert.equal(zipfOf(m, "the"), 5.7);
  assert.equal(zipfOf(m, "ubiquitous"), 3.4);
  assert.equal(zipfOf(m, "nope"), undefined);
});

test("die echte Liste ist vollständig", () => {
  const raw = JSON.parse(readFileSync(new URL("../app/data/wordfreq-en.json", import.meta.url), "utf8"));
  const m = parseFreq(raw);
  assert.ok(m.size > 30000, `nur ${m.size} Wörter`);
  assert.ok(zipfOf(m, "the") > 7);
  assert.ok(zipfOf(m, "ubiquitous") < 4.5);
  assert.match(raw.license, /CC BY-SA/);
});
