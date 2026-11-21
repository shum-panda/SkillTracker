import { test } from "node:test";
import assert from "node:assert/strict";
import { completeJSON } from "../app/core/providers/index.js";
import { supportsEffort } from "../app/core/providers/anthropic.js";
import { MemoryStore } from "../app/core/store.js";
import { parseImport, applyImport } from "../app/core/backup.js";
import { mtld } from "../app/core/metrics.js";
import { locateErrors } from "../app/core/locate.js";
import { OCR_SCHEMA } from "../app/core/schema.js";
import { fakeFetch } from "./fixtures.mjs";

const REQ = { system: "s", prompt: "p", schema: OCR_SCHEMA, schemaName: "x" };
const ok = { body: { choices: [{ message: { content: '{"text":"a"}' }, finish_reason: "stop" }] } };

test("#1 OpenAI-Schlüssel geht nie an eine eigene baseUrl", async () => {
  const f = fakeFetch(ok);
  await completeJSON({ id: "o", type: "openai", name: "O", apiKey: "sk-real", baseUrl: "https://evil.example/v1", model: "m" }, REQ, { fetch: f });
  assert.equal(new URL(f.calls[0].url).host, "api.openai.com");
});

test("#1 Import: baseUrl nur bei kompatibel, Schlüssel bleibt nur bei gleichem Ziel", async () => {
  const s = new MemoryStore();
  await s.setSetting("providers", [{ id: "a", type: "openai", name: "O", apiKey: "sk-real", baseUrl: "", model: "m" },
    { id: "b", type: "compatible", name: "C", apiKey: "sk-c", baseUrl: "http://localhost:11434/v1", model: "m" }]);
  const file = { app: "skilltracker", version: 1, settings: { providers: [
    { id: "a", type: "openai", name: "O", apiKey: "", baseUrl: "https://evil.example/v1", model: "m" },
    { id: "b", type: "compatible", name: "C", apiKey: "", baseUrl: "https://evil.example/v1", model: "m" }] }, entries: [] };
  const parsed = parseImport(file);
  assert.equal(parsed.settings.providers[0].baseUrl, "");
  await applyImport(s, parsed, { withKeys: false });
  const [a, b] = await s.getSetting("providers");
  assert.equal(a.apiKey, "sk-real", "gleiches Ziel (api.openai.com) -> Schlüssel bleibt");
  assert.equal(b.apiKey, "", "anderes Ziel -> Schlüssel wird nicht übernommen");
});

test("#4 MTLD: Wiederholung erhöht nie die Vielfalt", () => {
  const uniq = "one two three four five six seven eight nine ten eleven twelve".split(" ");
  const rep = [...uniq.slice(0, 11), "one"];
  assert.ok(mtld(uniq) >= mtld(rep), `${mtld(uniq)} < ${mtld(rep)}`);
});

test("#5 Zitate finden trotz anderer Apostrophe und Zeilenumbrüche", () => {
  const err = (quote) => ({ quote, correction: "", category: "spelling", severity: "minor", explanation: "" });
  assert.deepEqual(locateErrors("I don’t like it", [err("don't like")]), [{ index: 0, start: 2, end: 12 }]);
  assert.deepEqual(locateErrors("he go\nhome", [err("he go home")]), [{ index: 0, start: 0, end: 10 }]);
  assert.deepEqual(locateErrors("İx He Go", [err("he go")]), [{ index: 0, start: 3, end: 8 }]);
});

test("#8 effort nur bei bekannten neuen Claude-Modellen", () => {
  assert.equal(supportsEffort("claude-opus-5-5"), true);
  assert.equal(supportsEffort("claude-sonnet-4-6"), true);
  assert.equal(supportsEffort("claude-haiku-4-5"), false);
  assert.equal(supportsEffort("claude-3-5-haiku-latest"), false);
  assert.equal(supportsEffort("something-else"), false);
});
