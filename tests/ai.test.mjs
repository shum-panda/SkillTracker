import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, transcribe } from "../app/core/ai.js";
import { analysisPrompt, ANALYSIS_SYSTEM, OCR_SYSTEM } from "../app/core/prompts.js";
import { CATEGORIES } from "../app/core/taxonomy.js";
import { fakeFetch, GOOD } from "./fixtures.mjs";

const claude = { id: "p1", type: "anthropic", name: "Claude", apiKey: "k", model: "claude-opus-5-5" };
const answer = (obj) => ({ body: { content: [{ type: "text", text: JSON.stringify(obj) }], stop_reason: "end_turn" } });

test("analyze: gültige Antwort beim ersten Mal", async () => {
  const f = fakeFetch(answer(GOOD));
  assert.deepEqual(await analyze(claude, "On Saturday he go to the Wochenmarkt.", "", { fetch: f }), GOOD);
  assert.equal(f.calls.length, 1);
  const prompt = f.calls[0].body.messages[0].content.at(-1).text;
  assert.match(prompt, /<text>\nOn Saturday he go to the Wochenmarkt\.\n<\/text>/);
});

test("analyze: ungültig, dann gültig -> zweiter Versuch mit Fehlerliste", async () => {
  const f = fakeFetch(answer({ ...GOOD, cefr: "Z9" }), answer(GOOD));
  assert.deepEqual(await analyze(claude, "text text", "", { fetch: f }), GOOD);
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].body.messages[0].content.at(-1).text, /cefr/);
});

test("analyze: zweimal ungültig -> bad_output", async () => {
  const f = fakeFetch(answer({ nope: 1 }));
  await assert.rejects(analyze(claude, "text", "", { fetch: f }), (e) => e.code === "bad_output");
  assert.equal(f.calls.length, 2);
});

test("analyze: Netzfehler wird nicht wiederholt", async () => {
  const f = fakeFetch(new TypeError("x"));
  await assert.rejects(analyze(claude, "text", "", { fetch: f }), (e) => e.code === "network");
  assert.equal(f.calls.length, 1);
});

test("transcribe gibt den Text zurück und schickt das Bild", async () => {
  const f = fakeFetch(answer({ text: "I has a dog. [?]" }));
  assert.equal(await transcribe(claude, { mediaType: "image/jpeg", base64: "AA" }, { fetch: f }), "I has a dog. [?]");
  assert.equal(f.calls[0].body.messages[0].content[0].type, "image");
  assert.equal(f.calls[0].body.system, OCR_SYSTEM);
});

test("Prompts: alle Kategorien genannt, Thema optional, Text als Daten markiert", () => {
  for (const c of CATEGORIES) assert.ok(ANALYSIS_SYSTEM.includes(c.id), c.id);
  assert.match(analysisPrompt("Hi there.", "My weekend"), /Thema: My weekend/);
  assert.doesNotMatch(analysisPrompt("Hi there.", ""), /Thema:/);
  assert.match(ANALYSIS_SYSTEM, /Deutsch/);
  assert.match(OCR_SYSTEM, /\[\?\]/);
});
