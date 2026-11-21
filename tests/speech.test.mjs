import { test } from "node:test";
import assert from "node:assert/strict";
import { alignWords, selfScore, summarizeSpeaking, speakingSentences, SPEECH_TYPES } from "../app/core/speech.js";
import { encodeWav } from "../app/core/wav.js";
import { transcribeAudio } from "../app/core/providers/audio.js";
import { parseImport } from "../app/core/backup.js";
import { MemoryStore } from "../app/core/store.js";
import { buildSnapshot, mergeSnapshot } from "../app/core/sync.js";
import { fakeFetch, GOOD } from "./fixtures.mjs";

test("alignWords: erkannte und fehlende Wörter, Reihenfolge zählt, Groß/klein und Satzzeichen egal", () => {
  const r = alignWords("I'd love to visit the farmers' market.", "i love to visit the farmer market");
  assert.deepEqual(r.tokens.map((t) => [t.word, t.ok]), [
    ["I'd", false], ["love", true], ["to", true], ["visit", true], ["the", true], ["farmers'", false], ["market", true]]);
  assert.equal(r.score, 71);
  assert.deepEqual(r.missed, ["i'd", "farmers'"]);
  assert.equal(alignWords("Hello there.", "").score, 0);
  assert.equal(alignWords("", "anything").score, 0);
  assert.equal(alignWords("one two three", "three two one").score, 33, "Reihenfolge");
});

test("selfScore und Zusammenfassung", () => {
  assert.equal(selfScore("good"), 100);
  assert.equal(selfScore("ok"), 60);
  assert.equal(selfScore("hard"), 20);
  const s = summarizeSpeaking([{ i: 0, score: 100, missed: [] }, { i: 1, score: 50, missed: ["market", "farmers'"] }, { i: 2, score: 0, missed: ["market"] }]);
  assert.equal(s.score, 50);
  assert.deepEqual(s.missed, ["market", "farmers'"], "häufigste zuerst, ohne Doppelte");
});

test("speakingSentences: verbesserte Fassung, letzte Überarbeitung oder eigener Text", () => {
  const e = { text: "I go home. It rain.", analysis: { ...GOOD, improved_text: "I went home. It was raining." },
    revisions: [{ createdAt: "a", revisedText: "Old." }, { createdAt: "b", revisedText: "I went home.\n\nIt rained." }] };
  assert.deepEqual(speakingSentences(e, "improved"), ["I went home.", "It was raining."]);
  assert.deepEqual(speakingSentences(e, "revision"), ["I went home.", "It rained."]);
  assert.deepEqual(speakingSentences(e, "own"), ["I go home.", "It rain."]);
  assert.deepEqual(speakingSentences({ ...e, revisions: [] }, "revision"), []);
});

test("encodeWav: 16-bit PCM mono mit gültigem Kopf", () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
  assert.equal(wav.length, 44 + 8);
  const dv = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  assert.equal(dv.getUint16(22, true), 1, "mono");
  assert.equal(dv.getUint32(24, true), 16000);
  assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getInt16(46, true), 32767);
  assert.equal(dv.getInt16(48, true), -32768);
});

test("transcribeAudio: OpenAI über /audio/transcriptions, Gemini mit Audio, Claude nicht", async () => {
  const wav = encodeWav(new Float32Array(16), 16000);
  const openai = { id: "o", type: "openai", name: "O", apiKey: "sk-o", baseUrl: "", model: "gpt-x" };
  const f = fakeFetch({ body: { text: "I went home." } });
  assert.equal(await transcribeAudio(openai, wav, { model: "whisper-1" }, { fetch: f }), "I went home.");
  const c = f.calls[0];
  assert.equal(c.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(c.headers.Authorization, "Bearer sk-o");
  assert.ok(c.init.body instanceof FormData);
  assert.equal(c.init.body.get("model"), "whisper-1");
  assert.equal(c.init.body.get("language"), "en");
  assert.equal(c.init.body.get("file").type, "audio/wav");

  const local = { id: "l", type: "compatible", name: "L", apiKey: "", baseUrl: "http://localhost:8000/v1", model: "m" };
  const g = fakeFetch({ body: { text: "ok" } });
  await transcribeAudio(local, wav, { model: "" }, { fetch: g });
  assert.equal(g.calls[0].url, "http://localhost:8000/v1/audio/transcriptions");
  assert.equal(g.calls[0].init.body.get("model"), "whisper-1");

  const gemini = { id: "g", type: "gemini", name: "G", apiKey: "gk", baseUrl: "", model: "gemini-x" };
  const h = fakeFetch({ body: { candidates: [{ content: { parts: [{ text: '{"text":"I went home."}' }] }, finishReason: "STOP" }] } });
  assert.equal(await transcribeAudio(gemini, wav, {}, { fetch: h }), "I went home.");
  assert.equal(h.calls[0].body.contents[0].parts[0].inline_data.mime_type, "audio/wav");

  await assert.rejects(transcribeAudio({ type: "anthropic", model: "claude-opus-5-5" }, wav, {}, {}), /kein Audio/);
  assert.deepEqual(SPEECH_TYPES, ["openai", "compatible", "gemini"]);
});

test("Sicherung und Abgleich nehmen Aussprache-Übungen mit", async () => {
  const sp = { createdAt: "2026-11-20T10:00:00.000Z", method: "self", source: "improved", score: 70, sentences: [{ i: 0, score: 100 }, { i: 1, score: 40 }], missed: ["market"] };
  const entry = { createdAt: "2026-11-01T10:00:00Z", topic: "", source: "typed", text: "Hello there my friend.", analysis: GOOD,
    metrics: { words: 4, sentences: 1, mtld: 4, levelShare: 0, levelCounted: 4, avgLen: 4, subPerSentence: 0 },
    scores: { grammar: 1, structure: 1, diversity: 1, level: 1, complexity: 1, style: 1 }, model: { ocr: "", analysis: "" },
    speaking: [sp, { ...sp, method: "evil" }, { ...sp, score: 500 }] };
  const parsed = parseImport({ app: "skilltracker", version: 1, entries: [entry] });
  assert.deepEqual(parsed.entries[0].speaking, [sp]);

  const a = new MemoryStore();
  const b = new MemoryStore();
  await a.addEntry({ ...entry, speaking: [sp] });
  await mergeSnapshot(b, await buildSnapshot(a));
  const eb = (await b.listEntries())[0];
  eb.speaking = [...eb.speaking, { ...sp, createdAt: "2026-11-21T10:00:00.000Z", score: 90 }];
  await b.putEntry(eb);
  await mergeSnapshot(a, await buildSnapshot(b));
  assert.deepEqual((await a.listEntries())[0].speaking.map((x) => x.score), [70, 90]);
});
