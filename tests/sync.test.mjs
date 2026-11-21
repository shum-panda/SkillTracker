import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../app/core/store.js";
import { buildSnapshot, mergeSnapshot, ensureUids, deleteEntryEverywhere } from "../app/core/sync.js";
import { newKey, seal, unseal } from "../app/core/seal.js";
import { makeCard } from "../app/core/cards.js";
import { newSched } from "../app/core/srs.js";
import { exportData, parseImport, applyImport } from "../app/core/backup.js";
import { GOOD } from "./fixtures.mjs";

const base = (createdAt, text, extra = {}) => ({ createdAt, topic: "", source: "typed", thumbs: [], text, analysis: GOOD,
  metrics: { words: 4, sentences: 1, mtld: 4, levelShare: 0, levelCounted: 4, avgLen: 4, subPerSentence: 0 },
  scores: { grammar: 1, structure: 1, diversity: 1, level: 1, complexity: 1, style: 1 }, model: { ocr: "", analysis: "m" },
  revisions: [], schemaVersion: 1, ...extra });

async function device() {
  return new MemoryStore();
}

test("Verschlüsselung: hin und zurück, falscher Schlüssel scheitert", async () => {
  const k = newKey();
  assert.match(k, /^[A-Za-z0-9_-]{43}$/);
  const box = await seal(k, { sdp: "v=0 …", n: 1 });
  assert.doesNotMatch(box, /sdp/);
  assert.deepEqual(await unseal(k, box), { sdp: "v=0 …", n: 1 });
  await assert.rejects(unseal(newKey(), box));
});

test("ensureUids vergibt fehlende IDs einmalig", async () => {
  const a = await device();
  await a.addEntry(base("2026-11-01T10:00:00Z", "One text here."));
  await a.addCard(makeCard({ type: "manual", front: "x", back: "y" }));
  await ensureUids(a);
  const [e] = await a.listEntries();
  const [c] = await a.listCards();
  assert.match(e.uid, /^[0-9a-f-]{36}$/);
  assert.ok(c.uid);
  await ensureUids(a);
  assert.equal((await a.listEntries())[0].uid, e.uid);
});

test("Zwei Geräte: Texte vereinigt, Verweise und Karten-Quellen umgeschrieben, nichts doppelt", async () => {
  const a = await device();
  const b = await device();
  const id1 = await a.addEntry(base("2026-11-01T10:00:00Z", "Text from A."));
  const id2 = await a.addEntry(base("2026-11-02T10:00:00Z", "Revision from A.", { revisionOf: id1 }));
  const orig = await a.getEntry(id1);
  orig.revisions = [{ createdAt: "2026-11-02T09:00:00Z", mode: "steps", tasks: [], revisedText: "x", resultEntryId: id2 }];
  await a.putEntry(orig);
  await a.addCard(makeCard({ type: "gap", front: "Markt", back: "market", sources: [id1] }));
  await b.addEntry({ text: "padding" }); // andere IDs auf B
  await b.addEntry(base("2026-11-03T10:00:00Z", "Text from B."));

  const snapA = await buildSnapshot(a);
  const r = await mergeSnapshot(b, snapA);
  assert.equal(r.entriesAdded, 2);
  assert.equal(r.cardsAdded, 1);
  const onB = await b.listEntries();
  const origB = onB.find((e) => e.text === "Text from A.");
  const revB = onB.find((e) => e.text === "Revision from A.");
  assert.equal(revB.revisionOf, origB.id);
  assert.equal(origB.revisions[0].resultEntryId, revB.id);
  const [cardB] = await b.listCards();
  assert.deepEqual(cardB.sources, [origB.id]);

  const again = await mergeSnapshot(b, snapA);
  assert.equal(again.entriesAdded, 0, "zweimal abgleichen erzeugt nichts doppelt");
  assert.equal((await b.listEntries()).length, 4);
  assert.equal((await b.listCards()).length, 1);

  await mergeSnapshot(a, await buildSnapshot(b));
  assert.equal((await a.listEntries()).length, 3, "A hat jetzt auch B's gültigen Text (der Platzhalter ohne Analyse wird nicht übertragen)");
});

test("Überarbeitungen werden vereinigt, Lernstand mit mehr Wiederholungen gewinnt", async () => {
  const a = await device();
  const b = await device();
  await a.addEntry(base("2026-11-01T10:00:00Z", "Shared text."));
  await a.addCard(makeCard({ type: "gap", front: "Markt", back: "market" }));
  await mergeSnapshot(b, await buildSnapshot(a));
  const ea = (await a.listEntries())[0];
  ea.revisions = [{ createdAt: "2026-11-05T10:00:00Z", mode: "whole", tasks: [], revisedText: "A" }];
  await a.putEntry(ea);
  const eb = (await b.listEntries())[0];
  eb.revisions = [{ createdAt: "2026-11-06T10:00:00Z", mode: "steps", tasks: [], revisedText: "B" }];
  await b.putEntry(eb);
  const cb = (await b.listCards())[0];
  await b.putCard({ ...cb, sched: { ...newSched(), state: "review", reps: 3, interval: 5, due: "2026-11-30T10:00:00.000Z" } });

  await mergeSnapshot(a, await buildSnapshot(b));
  const merged = (await a.listEntries())[0];
  assert.deepEqual(merged.revisions.map((r) => r.revisedText).sort(), ["A", "B"]);
  assert.equal((await a.listCards())[0].sched.reps, 3);
  const before = (await b.listCards())[0].sched.reps;
  await mergeSnapshot(b, await buildSnapshot(a));
  assert.equal((await b.listCards())[0].sched.reps, before, "weniger Wiederholungen überschreiben nicht");
});

test("Gelöschte Texte und Karten bleiben auf beiden Seiten gelöscht", async () => {
  const a = await device();
  const b = await device();
  await a.addEntry(base("2026-11-01T10:00:00Z", "Delete me."));
  await a.addEntry(base("2026-11-02T10:00:00Z", "Keep me."));
  await a.addCard(makeCard({ type: "gap", front: "Markt", back: "market" }));
  await mergeSnapshot(b, await buildSnapshot(a));
  const victim = (await b.listEntries()).find((e) => e.text === "Delete me.");
  await deleteEntryEverywhere(b, victim);
  const { deleteCard } = await import("../app/core/cards.js");
  await deleteCard(b, (await b.listCards())[0]);
  const r = await mergeSnapshot(a, await buildSnapshot(b), { confirmDeletions: async () => true });
  assert.equal(r.removed, 2, "ein Text und eine Karte");
  assert.deepEqual((await a.listEntries()).map((e) => e.text), ["Keep me."]);
  assert.equal((await a.listCards()).length, 0);
  await mergeSnapshot(b, await buildSnapshot(a));
  assert.equal((await b.listEntries()).length, 1, "kommt nicht zurück");
});

test("KI-Zugänge nur auf Wunsch, kaputte Daten werden verworfen", async () => {
  const a = await device();
  await a.setSetting("providers", [{ id: "p", type: "anthropic", name: "C", apiKey: "sk-secret", baseUrl: "", model: "claude-opus-5-5" }]);
  assert.equal((await buildSnapshot(a)).providers, undefined);
  assert.doesNotMatch(JSON.stringify(await buildSnapshot(a)), /sk-secret/);
  const withKeys = await buildSnapshot(a, { includeProviders: true });
  assert.equal(withKeys.providers[0].apiKey, "sk-secret");
  const b = await device();
  await mergeSnapshot(b, withKeys, { acceptProviders: true });
  assert.equal((await b.getSetting("providers"))[0].apiKey, "sk-secret");
  const c = await device();
  const r = await mergeSnapshot(c, { app: "skilltracker", kind: "sync", version: 1, entries: [{ uid: "x".repeat(10), text: "<script>" }, "junk"], cards: [{ type: "evil" }] });
  assert.equal(r.entriesAdded, 0);
  await assert.rejects(mergeSnapshot(c, { app: "other" }), /SkillTracker/);
});

test("Datei-Import überspringt Texte, die es (per uid) schon gibt", async () => {
  const a = await device();
  await a.addEntry(base("2026-11-01T10:00:00Z", "Once only."));
  await ensureUids(a);
  const file = await exportData(a);
  await applyImport(a, parseImport(file));
  assert.equal((await a.listEntries()).length, 1);
  const b = await device();
  await applyImport(b, parseImport(file));
  assert.equal((await b.listEntries())[0].uid, (await a.listEntries())[0].uid);
});

import { qrSvg, syncLink, parseSyncHash } from "../app/core/qr.js";

test("QR-Code und Abgleich-Link", () => {
  const link = syncLink("https://shum-panda.github.io/SkillTracker/#/settings", { room: "r".repeat(22), key: "k".repeat(43), relay: "https://sync.example.de" });
  assert.equal(link, `https://shum-panda.github.io/SkillTracker/#/sync?r=${"r".repeat(22)}&k=${"k".repeat(43)}&s=https%3A%2F%2Fsync.example.de`);
  assert.deepEqual(parseSyncHash(new URL(link).hash), { room: "r".repeat(22), key: "k".repeat(43), relay: "https://sync.example.de" });
  assert.equal(parseSyncHash("#/sync?r=x&k=y&s=javascript:alert(1)"), null);
  const svg = qrSvg(link);
  assert.match(svg, /^<svg class="qr" viewBox="0 0 (\d+) \1"/);
  assert.ok(svg.length > 2000);
});

test("Löschungen vom anderen Gerät nur nach Bestätigung; KI-Zugänge nur auf eigenen Wunsch", async () => {
  const a = await device();
  const b = await device();
  await a.addEntry(base("2026-11-01T10:00:00Z", "Mine."));
  await a.addCard(makeCard({ type: "gap", front: "Markt", back: "market" }));
  await ensureUids(a);
  const victimUid = (await a.listEntries())[0].uid;
  const evil = { app: "skilltracker", kind: "sync", version: 1, entries: [], cards: [],
    settings: { deletedEntryUids: [victimUid], deletedCardKeys: ["gap|market"] },
    providers: [{ id: "x1", type: "compatible", name: "Evil", apiKey: "", baseUrl: "https://evil.example/v1", model: "m" }] };
  let asked = null;
  const r = await mergeSnapshot(a, evil, { confirmDeletions: async (n) => { asked = n; return false; } });
  assert.deepEqual(asked, { entries: 1, cards: 1 });
  assert.equal(r.removed, 0);
  assert.equal((await a.listEntries()).length, 1);
  assert.equal((await a.listCards()).length, 1);
  assert.deepEqual((await a.getSetting("deletedEntryUids")) || [], [], "abgelehnte Grabsteine werden nicht gespeichert");
  assert.equal(await a.getSetting("providers"), undefined, "ohne eigene Zustimmung keine fremden KI-Zugänge");
  const ok = await mergeSnapshot(a, evil, { confirmDeletions: async () => true, acceptProviders: true });
  assert.equal(ok.removed, 2);
  assert.equal((await a.getSetting("providers")).length, 1);
  void b;
});

test("Abgleich-Link: Vermittler nur per https (außer lokal)", () => {
  const q = (s) => `#/sync?r=${"r".repeat(22)}&k=${"k".repeat(43)}&s=${encodeURIComponent(s)}`;
  assert.equal(parseSyncHash(q("http://evil.example")), null);
  assert.ok(parseSyncHash(q("http://127.0.0.1:8830")));
  assert.ok(parseSyncHash(q("https://sync.example.de")));
});
