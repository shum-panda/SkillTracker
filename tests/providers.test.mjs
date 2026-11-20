import { test } from "node:test";
import assert from "node:assert/strict";
import { listModels, completeJSON, PROVIDER_TYPES } from "../app/core/providers/index.js";
import { AiError } from "../app/core/providers/errors.js";
import { OCR_SCHEMA } from "../app/core/schema.js";

import { fakeFetch } from "./fixtures.mjs";

const IMG = { mediaType: "image/jpeg", base64: "QUJD" };
const REQ = { system: "sys", prompt: "bitte", schema: OCR_SCHEMA, schemaName: "ocr" };
const claude = { id: "p1", type: "anthropic", name: "Claude", apiKey: "sk-ant-x", model: "claude-opus-5-5" };
const openai = { id: "p2", type: "openai", name: "OpenAI", apiKey: "sk-o", model: "gpt-x" };
const gemini = { id: "p3", type: "gemini", name: "Gemini", apiKey: "g-key", model: "gemini-x" };
const local = { id: "p4", type: "compatible", name: "Ollama", apiKey: "", baseUrl: "http://localhost:11434/v1", model: "llava" };

test("Anbieter-Typen haben Beschriftung und https-Schlüssellink", () => {
  for (const t of ["anthropic", "openai", "gemini", "compatible"]) {
    assert.ok(PROVIDER_TYPES[t].label);
    assert.match(PROVIDER_TYPES[t].keyUrl, /^https:\/\//);
  }
  assert.equal(PROVIDER_TYPES.anthropic.defaultModel, "claude-opus-5-5");
});

test("Claude: Kopfzeilen, strukturierte Ausgabe, Bild vor Text, Ausweich-Option", async () => {
  const f = fakeFetch({ body: { content: [{ type: "text", text: '{"text":"hi"}' }], stop_reason: "end_turn" } });
  const out = await completeJSON(claude, { ...REQ, image: IMG }, { fetch: f });
  assert.deepEqual(out, { text: "hi" });
  const c = f.calls[0];
  assert.equal(c.url, "https://api.anthropic.com/v1/messages");
  assert.equal(c.headers["x-api-key"], "sk-ant-x");
  assert.equal(c.headers["anthropic-version"], "2026-10-21");
  assert.equal(c.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(c.headers["anthropic-beta"], "server-side-fallback-2026-07-01");
  assert.equal(c.body.fallbacks, "default");
  assert.equal(c.body.output_config.format.type, "json_schema");
  assert.equal(c.body.output_config.effort, "low");
  assert.equal(c.body.system, "sys");
  const content = c.body.messages[0].content;
  assert.equal(content[0].type, "image");
  assert.deepEqual(content[0].source, { type: "base64", media_type: "image/jpeg", data: "QUJD" });
  assert.equal(content[1].type, "text");
});

test("Claude: kein Ausweich-Header bei anderen Modellen, kein effort bei alten", async () => {
  const f = fakeFetch({ body: { content: [{ type: "text", text: '{"text":"a"}' }], stop_reason: "end_turn" } });
  await completeJSON({ ...claude, model: "claude-haiku-5-5" }, REQ, { fetch: f });
  assert.equal(f.calls[0].headers["anthropic-beta"], undefined);
  assert.equal(f.calls[0].body.fallbacks, undefined);
  assert.equal(f.calls[0].body.output_config.effort, "low");
  await completeJSON({ ...claude, model: "claude-haiku-4-5" }, REQ, { fetch: f });
  assert.equal(f.calls[1].body.output_config.effort, undefined);
});

test("Claude: Ablehnung und abgeschnittene Antwort", async () => {
  const f = fakeFetch({ body: { content: [], stop_reason: "refusal" } });
  await assert.rejects(completeJSON(claude, REQ, { fetch: f }), (e) => e instanceof AiError && e.code === "refusal");
  const g = fakeFetch({ body: { content: [{ type: "text", text: '{"te' }], stop_reason: "max_tokens" } });
  await assert.rejects(completeJSON(claude, REQ, { fetch: g }), (e) => e.code === "bad_output");
});

test("OpenAI: Bearer, strict json_schema, Bild als data-URL", async () => {
  const f = fakeFetch({ body: { choices: [{ message: { content: '{"text":"ok"}' }, finish_reason: "stop" }] } });
  const out = await completeJSON(openai, { ...REQ, image: IMG }, { fetch: f });
  assert.deepEqual(out, { text: "ok" });
  const c = f.calls[0];
  assert.equal(c.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(c.headers.Authorization, "Bearer sk-o");
  assert.equal(c.body.response_format.type, "json_schema");
  assert.equal(c.body.response_format.json_schema.strict, true);
  assert.equal(c.body.messages[0].role, "system");
  const parts = c.body.messages[1].content;
  assert.ok(parts.some((p) => p.type === "image_url" && p.image_url.url === "data:image/jpeg;base64,QUJD"));
});

test("OpenAI: Ablehnung", async () => {
  const f = fakeFetch({ body: { choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }] } });
  await assert.rejects(completeJSON(openai, REQ, { fetch: f }), (e) => e.code === "refusal");
});

test("Kompatibel: ohne Schlüssel kein Authorization, 400 auf json_schema -> json_object + Schema im Prompt", async () => {
  const f = fakeFetch({ status: 400, body: { error: { message: "response_format json_schema not supported" } } },
    { body: { choices: [{ message: { content: '```json\n{"text":"x"}\n```' }, finish_reason: "stop" }] } });
  const out = await completeJSON(local, REQ, { fetch: f });
  assert.deepEqual(out, { text: "x" });
  assert.equal(f.calls[0].url, "http://localhost:11434/v1/chat/completions");
  assert.equal(f.calls[0].headers.Authorization, undefined);
  assert.equal(f.calls[1].body.response_format.type, "json_object");
  assert.match(f.calls[1].body.messages[0].content, /"text"/);
  assert.equal(typeof f.calls[1].body.messages[1].content, "string");
});

test("Gemini: URL, Schlüssel im Kopf, JSON-Modus, Bild als inline_data", async () => {
  const f = fakeFetch({ body: { candidates: [{ content: { parts: [{ text: '{"text":"g"}' }] }, finishReason: "STOP" }] } });
  const out = await completeJSON(gemini, { ...REQ, image: IMG }, { fetch: f });
  assert.deepEqual(out, { text: "g" });
  const c = f.calls[0];
  assert.equal(c.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
  assert.equal(c.headers["x-goog-api-key"], "g-key");
  assert.doesNotMatch(c.url, /g-key/);
  assert.equal(c.body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(c.body.contents[0].parts[0], { inline_data: { mime_type: "image/jpeg", data: "QUJD" } });
  assert.match(c.body.systemInstruction.parts[0].text, /"text"/);
});

test("Gemini: Sperre durch Sicherheitsfilter = Ablehnung", async () => {
  const f = fakeFetch({ body: { promptFeedback: { blockReason: "SAFETY" } } });
  await assert.rejects(completeJSON(gemini, REQ, { fetch: f }), (e) => e.code === "refusal");
});

test("Modelllisten aller Anbieter", async () => {
  assert.deepEqual(await listModels(claude, { fetch: fakeFetch({ body: { data: [{ id: "claude-opus-5-5" }, { id: "claude-haiku-5-5" }] } }) }),
    ["claude-haiku-5-5", "claude-opus-5-5"]);
  assert.deepEqual(await listModels(openai, { fetch: fakeFetch({ body: { data: [{ id: "b" }, { id: "a" }] } }) }), ["a", "b"]);
  assert.deepEqual(await listModels(gemini, { fetch: fakeFetch({ body: { models: [
    { name: "models/gemini-x", supportedGenerationMethods: ["generateContent"] },
    { name: "models/embed", supportedGenerationMethods: ["embedContent"] }] } }) }), ["gemini-x"]);
  const f = fakeFetch({ body: { data: [{ id: "llava" }] } });
  assert.deepEqual(await listModels(local, { fetch: f }), ["llava"]);
  assert.equal(f.calls[0].url, "http://localhost:11434/v1/models");
});

test("HTTP- und Netzfehler werden übersetzt", async () => {
  const cases = [[401, "auth"], [403, "auth"], [404, "not_found"], [429, "rate_limit"], [500, "server"], [400, "bad_request"]];
  for (const [status, code] of cases) {
    const f = fakeFetch({ status, body: { error: { message: "nope" } } });
    await assert.rejects(completeJSON(claude, REQ, { fetch: f }), (e) => e.code === code && /\S/.test(e.message), String(status));
  }
  await assert.rejects(completeJSON(claude, REQ, { fetch: fakeFetch(new TypeError("Failed to fetch")) }),
    (e) => e.code === "network");
  const abort = new DOMException("aborted", "AbortError");
  await assert.rejects(completeJSON(openai, REQ, { fetch: fakeFetch(abort) }), (e) => e.code === "aborted");
});

test("Schlüssel gehen nur an die Adresse ihres Anbieters", async () => {
  for (const p of [claude, openai, gemini]) {
    const f = fakeFetch({ status: 500, body: {} });
    await completeJSON(p, REQ, { fetch: f }).catch(() => {});
    await listModels(p, { fetch: f }).catch(() => {});
    const host = { anthropic: "api.anthropic.com", openai: "api.openai.com", gemini: "generativelanguage.googleapis.com" }[p.type];
    for (const c of f.calls) assert.equal(new URL(c.url).host, host);
  }
});
