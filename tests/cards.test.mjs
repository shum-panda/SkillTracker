import { test } from "node:test";
import assert from "node:assert/strict";
import { cardsFromEntry, mergeCards, cardKey } from "../app/core/cards.js";
import { schedule, newSched, buildQueue, forecast, studiedNewToday, DEFAULT_NEW_PER_DAY } from "../app/core/srs.js";
import { MemoryStore } from "../app/core/store.js";
import { exportData, parseImport, applyImport } from "../app/core/backup.js";
import { GOOD } from "./fixtures.mjs";

const NOW = new Date("2026-11-21T10:00:00Z");
const min = (m) => new Date(NOW.getTime() + m * 60000).toISOString();
const days = (d) => new Date(NOW.getTime() + d * 86400000).toISOString();

const entry = {
  id: 5, text: "On Saturday he go to the Wochenmarkt. I make a photo of the ?Fernweh poster.",
  analysis: { ...GOOD,
    errors: [
      { quote: "he go", correction: "he goes", category: "subject_verb_agreement", severity: "major", explanation: "s" },
      { quote: "make a photo", correction: "take a photo", category: "collocation", severity: "minor", explanation: "Man sagt take a photo." },
    ],
    gaps: [{ written: "Wochenmarkt", english: "farmers' market", note: "auch weekly market" },
      { written: "?Fernweh", english: "wanderlust", note: "" }],
    improved_text: "On Saturday he goes to the farmers' market. I take a photo of the poster." },
};

test("Karten aus einem Text: Lücken und Wortschatz-Fehler, keine Grammatik", () => {
  const cards = cardsFromEntry(entry, NOW);
  assert.equal(cards.length, 3);
  const [g1, g2, v] = cards;
  assert.equal(g1.type, "gap");
  assert.equal(g1.front, "Wochenmarkt");
  assert.equal(g1.back, "farmers' market");
  assert.equal(g1.context, "On Saturday he goes to the ____.");
  assert.equal(g1.note, "auch weekly market");
  assert.deepEqual(g1.sources, [5]);
  assert.equal(g1.sched.state, "new");
  assert.equal(g2.front, "Fernweh", "Fragezeichen-Markierung entfernt");
  assert.equal(g2.context, "", "kommt in der verbesserten Fassung nicht vor");
  assert.equal(v.type, "vocab");
  assert.equal(v.front, "make a photo");
  assert.equal(v.back, "take a photo");
  assert.equal(v.context, "I make a photo of the ?Fernweh poster.");
  assert.equal(v.note, "Man sagt take a photo.");
});

test("mergeCards: gleicher Schlüssel → nur Quelle ergänzen", () => {
  const existing = cardsFromEntry(entry, NOW).map((c, i) => ({ ...c, id: i + 1 }));
  const again = cardsFromEntry({ ...entry, id: 9 }, NOW);
  const { added, updated } = mergeCards(existing, again);
  assert.equal(added.length, 0);
  assert.equal(updated.length, 3);
  assert.deepEqual(updated[0].sources, [5, 9]);
  const twice = mergeCards(existing, cardsFromEntry(entry, NOW));
  assert.equal(twice.updated.length, 0, "dieselbe Quelle nicht doppelt");
  assert.equal(cardKey({ type: "gap", back: " Farmers' Market " }), "gap|farmers' market");
});

test("Lernplan: neue Karte durch die Lernschritte", () => {
  let s = newSched();
  s = schedule(s, "good", NOW);
  assert.deepEqual([s.state, s.step, s.due], ["learning", 1, min(10)]);
  assert.equal(s.firstStudied, NOW.toISOString());
  const g2 = schedule(s, "good", NOW);
  assert.deepEqual([g2.state, g2.interval, g2.due], ["review", 1, days(1)]);
  assert.equal(schedule(newSched(), "again", NOW).due, min(1));
  assert.equal(schedule(newSched(), "hard", NOW).due, min(6));
  const easy = schedule(newSched(), "easy", NOW);
  assert.deepEqual([easy.state, easy.interval, easy.due], ["review", 4, days(4)]);
});

test("Lernplan: Wiederholungen mit Faktor", () => {
  const r = { state: "review", step: 0, due: NOW.toISOString(), interval: 10, ease: 2.5, reps: 3, lapses: 0, firstStudied: "x" };
  const good = schedule(r, "good", NOW);
  assert.deepEqual([good.interval, good.ease, good.due], [25, 2.5, days(25)]);
  const hard = schedule(r, "hard", NOW);
  assert.deepEqual([hard.interval, hard.ease], [12, 2.35]);
  const easy = schedule(r, "easy", NOW);
  assert.deepEqual([easy.interval, easy.ease], [33, 2.65]);
  const again = schedule(r, "again", NOW);
  assert.deepEqual([again.state, again.interval, again.lapses, again.due], ["learning", 5, 1, min(10)]);
  assert.equal(again.ease, 2.3);
  const back = schedule(again, "good", NOW);
  assert.deepEqual([back.state, back.interval], ["review", 5], "nach dem Wiederlernen zurück zum halbierten Intervall");
  assert.equal(schedule({ ...r, ease: 1.35 }, "again", NOW).ease, 1.3);
  assert.equal(schedule({ ...r, interval: 1, ease: 1.3 }, "hard", NOW).interval, 2, "mindestens ein Tag mehr");
});

test("Warteschlange: fällige zuerst, neue bis zum Tageslimit, pausierte nie", () => {
  const c = (id, sched, extra = {}) => ({ id, sched, suspended: false, ...extra });
  const cards = [
    c(1, { ...newSched() }),
    c(2, { ...newSched() }),
    c(3, { state: "review", due: min(-60), interval: 3, ease: 2.5 }),
    c(4, { state: "review", due: days(2), interval: 3, ease: 2.5 }),
    c(5, { state: "learning", step: 1, due: min(5), interval: 0, ease: 2.5 }),
    c(6, { state: "review", due: min(-1), interval: 3, ease: 2.5 }, { suspended: true }),
    c(7, { state: "learning", step: 0, due: min(-2), interval: 0, ease: 2.5 }),
  ];
  const q = buildQueue(cards, NOW, { newPerDay: 1, newToday: 0 });
  assert.deepEqual(q.due.map((x) => x.id), [7, 3]);
  assert.deepEqual(q.fresh.map((x) => x.id), [1]);
  assert.deepEqual(q.ahead.map((x) => x.id), [5], "lernende Karte innerhalb von 20 Minuten");
  assert.equal(buildQueue(cards, NOW, { newPerDay: 1, newToday: 1 }).fresh.length, 0);
  assert.equal(DEFAULT_NEW_PER_DAY, 10);
});

test("Vorschau und heute gelernte neue Karten", () => {
  const cards = [
    { sched: { state: "review", due: min(30) } }, { sched: { state: "review", due: days(1) } },
    { sched: { state: "review", due: days(1.2) } }, { sched: { state: "review", due: days(9) } }, { sched: newSched() },
    { sched: { state: "review", due: days(3) }, suspended: true },
  ];
  assert.deepEqual(forecast(cards, NOW, 4), [1, 2, 0, 0]);
  const studied = [{ sched: { firstStudied: NOW.toISOString() } }, { sched: { firstStudied: days(-1) } }, { sched: newSched() }];
  assert.equal(studiedNewToday(studied, NOW), 1);
});

test("Speicher und Sicherung: Karten werden exportiert, geprüft importiert, Quellen umgeschrieben", async () => {
  const s = new MemoryStore();
  const card = { ...cardsFromEntry(entry, NOW)[0], sources: [5] };
  const cid = await s.addCard(card);
  assert.equal((await s.getCard(cid)).front, "Wochenmarkt");
  assert.equal((await s.listCards()).length, 1);
  const data = await exportData(s);
  assert.equal(data.cards.length, 1);
  const base = { id: 5, createdAt: "2026-11-01T10:00:00Z", topic: "", source: "typed", text: "Hello there my friend.", analysis: GOOD,
    metrics: { words: 4, sentences: 1, mtld: 4, levelShare: 0, levelCounted: 4, avgLen: 4, subPerSentence: 0 },
    scores: { grammar: 1, structure: 1, diversity: 1, level: 1, complexity: 1, style: 1 }, model: { ocr: "", analysis: "" } };
  const parsed = parseImport({ app: "skilltracker", version: 1, entries: [base],
    cards: [{ ...card, sources: [5, 77] }, { type: "evil", front: "<x>" }, { ...card, type: "manual", key: "manual|x", front: "", back: "y" }] });
  assert.equal(parsed.cards.length, 1);
  const t = new MemoryStore();
  await t.addEntry({ text: "vorher" });
  await applyImport(t, parsed);
  const [imported] = await t.listCards();
  const newEntry = (await t.listEntries()).find((e) => e.text === "Hello there my friend.");
  assert.deepEqual(imported.sources, [newEntry.id]);
  await t.deleteCard(imported.id);
  assert.equal((await t.listCards()).length, 0);
});
