import { test } from "node:test";
import assert from "node:assert/strict";
import { movePage, removePage, addPages, joinPages, MAX_PAGES, entryThumbs } from "../app/core/pages.js";
import { parseImport } from "../app/core/backup.js";
import { GOOD } from "./fixtures.mjs";

test("movePage verschiebt nach oben/unten, an den Rändern nichts", () => {
  assert.deepEqual(movePage(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(movePage(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  assert.deepEqual(movePage(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(movePage(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
  const orig = ["a", "b"];
  movePage(orig, 0, 1);
  assert.deepEqual(orig, ["a", "b"], "Original unverändert");
});

test("removePage und addPages mit Obergrenze", () => {
  assert.deepEqual(removePage(["a", "b", "c"], 1), ["a", "c"]);
  assert.equal(MAX_PAGES, 10);
  const nine = Array.from({ length: 9 }, (_, i) => i);
  const r = addPages(nine, ["x", "y", "z"]);
  assert.equal(r.pages.length, 10);
  assert.equal(r.dropped, 2);
  assert.deepEqual(addPages([], ["x"]), { pages: ["x"], dropped: 0 });
});

test("joinPages: Leerzeile zwischen Seiten, leere Seiten weg", () => {
  assert.equal(joinPages(["First page.\n", "  ", "Second page."]), "First page.\n\nSecond page.");
  assert.equal(joinPages([]), "");
});

test("entryThumbs: neue Liste, altes Einzelfeld, nichts", () => {
  assert.deepEqual(entryThumbs({ thumbs: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(entryThumbs({ thumb: "a" }), ["a"]);
  assert.deepEqual(entryThumbs({ thumb: "" }), []);
});

test("Import: Seitenfotos geprüft, altes thumb wird zur Liste", () => {
  const img = "data:image/jpeg;base64,QUJD";
  const base = { createdAt: "2026-11-01T10:00:00Z", topic: "", source: "photo", text: "Hello there my friend.", analysis: GOOD,
    metrics: { words: 4, sentences: 1, mtld: 4, levelShare: 0, levelCounted: 4, avgLen: 4, subPerSentence: 0 },
    scores: { grammar: 1, structure: 1, diversity: 1, level: 1, complexity: 1, style: 1 }, model: { ocr: "", analysis: "" } };
  const parsed = parseImport({ app: "skilltracker", version: 1, entries: [
    { ...base, thumbs: [img, "javascript:alert(1)", img] },
    { ...base, thumb: img },
  ] });
  assert.deepEqual(parsed.entries[0].thumbs, [img, img]);
  assert.deepEqual(parsed.entries[1].thumbs, [img]);
  assert.equal("thumb" in parsed.entries[0], false);
});
