import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../app/core/store.js";
import { exportData, parseImport, applyImport } from "../app/core/backup.js";
import { GOOD } from "./fixtures.mjs";

const scores = { grammar: 1, structure: 2, diversity: 3, level: 4, complexity: 5, style: 6 };
const metrics = { words: 12, sentences: 2, mtld: 10, levelShare: 0, levelCounted: 10, avgLen: 6, subPerSentence: 0 };
const entry = (createdAt, extra = {}) => ({ createdAt, topic: "", source: "typed", thumb: "", text: "Hello there.",
  analysis: GOOD, metrics, scores, model: { ocr: "", analysis: "m" }, schemaVersion: 1, ...extra });
const provider = { id: "a", type: "anthropic", name: "Claude", apiKey: "sk-secret", baseUrl: "", model: "claude-opus-5-5" };

test("MemoryStore: Einträge neueste zuerst, Einstellungen, Löschen", async () => {
  const s = new MemoryStore();
  const id1 = await s.addEntry(entry("2026-11-01T10:00:00Z"));
  const id2 = await s.addEntry(entry("2026-11-03T10:00:00Z"));
  await s.addEntry(entry("2026-11-02T10:00:00Z"));
  assert.deepEqual((await s.listEntries()).map((e) => e.id), [id2, 3, id1]);
  const e = await s.getEntry(id1);
  e.text = "changed";
  assert.equal((await s.getEntry(id1)).text, "Hello there.", "Kopien, keine geteilten Objekte");
  await s.putEntry({ ...e });
  assert.equal((await s.getEntry(id1)).text, "changed");
  await s.deleteEntry(id1);
  assert.equal(await s.getEntry(id1), undefined);
  await s.setSetting("showImproved", false);
  assert.equal(await s.getSetting("showImproved"), false);
  await s.clearAll();
  assert.deepEqual(await s.listEntries(), []);
  assert.equal(await s.getSetting("showImproved"), undefined);
});

test("Export ohne Schlüssel, außer ausdrücklich gewählt", async () => {
  const s = new MemoryStore();
  await s.setSetting("providers", [provider]);
  await s.addEntry(entry("2026-11-01T10:00:00Z"));
  const plain = await exportData(s, { includeKeys: false });
  assert.equal(plain.app, "skilltracker");
  assert.equal(plain.version, 1);
  assert.equal(plain.settings.providers[0].apiKey, "");
  assert.equal(plain.entries.length, 1);
  assert.doesNotMatch(JSON.stringify(plain), /sk-secret/);
  const withKeys = await exportData(s, { includeKeys: true });
  assert.equal(withKeys.settings.providers[0].apiKey, "sk-secret");
});

test("Import: fremde Datei wird abgelehnt", () => {
  assert.throws(() => parseImport({ app: "other", version: 1 }), /SkillTracker/);
  assert.throws(() => parseImport(null), /SkillTracker/);
  assert.throws(() => parseImport({ app: "skilltracker", version: 99, entries: [] }), /Version/);
});

test("Import: Einträge gesäubert, kaputte verworfen, Schlüssel nur auf Wunsch", async () => {
  const file = {
    app: "skilltracker", version: 1, exportedAt: "x",
    settings: { providers: [provider, { id: "z", type: "evil", name: "x" }], showImproved: false, theme: "dark",
      analysisProvider: "a", junk: "<script>" },
    entries: [
      entry("2026-11-01T10:00:00Z", { text: "<script>alert(1)</script>", extraField: 1, thumb: "javascript:alert(1)" }),
      entry("2026-11-02T10:00:00Z", { analysis: { broken: true } }),
      entry("2026-11-03T10:00:00Z", { scores: { grammar: "x" } }),
      "not an object",
    ],
  };
  const parsed = parseImport(file);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.skipped, 3);
  assert.equal(parsed.hasKeys, true);
  assert.equal(parsed.entries[0].text, "<script>alert(1)</script>", "Text bleibt Text");
  assert.equal(parsed.entries[0].thumb, "");
  assert.equal("extraField" in parsed.entries[0], false);
  assert.equal(parsed.settings.providers.length, 1);
  assert.equal("junk" in parsed.settings, false);

  const s = new MemoryStore();
  const r = await applyImport(s, parsed, { withKeys: false });
  assert.deepEqual(r, { added: 1, skipped: 3 });
  assert.equal((await s.getSetting("providers"))[0].apiKey, "");
  assert.equal(await s.getSetting("showImproved"), false);
  const s2 = new MemoryStore();
  await applyImport(s2, parsed, { withKeys: true });
  assert.equal((await s2.getSetting("providers"))[0].apiKey, "sk-secret");
});

test("Import behält vorhandene Schlüssel desselben Anbieters", async () => {
  const s = new MemoryStore();
  await s.setSetting("providers", [{ ...provider, apiKey: "sk-mine" }]);
  const parsed = parseImport(await exportData(s, { includeKeys: false }));
  await applyImport(s, parsed, { withKeys: false });
  assert.equal((await s.getSetting("providers"))[0].apiKey, "sk-mine");
});
