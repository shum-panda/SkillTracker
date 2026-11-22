import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultProfile } from "../app/core/profile.js";
import { addDays } from "../app/core/activity.js";
import { learningDayKey, newSched } from "../app/core/srs.js";
import { sessionMinutes, writeDays, isWriteDay, estimates, planToday, planForDay, recommendation } from "../app/core/plan.js";
import { GOOD } from "./fixtures.mjs";

const NOW = new Date(2026, 10, 20, 18, 0); // Donnerstag
const TODAY = learningDayKey(NOW);
const prof = (o = {}) => ({ ...defaultProfile(), ...o });
// aktive Tage: offsets relativ zu heute (−1 = gestern)
const days = (offsets) => offsets.map((o, i) => ({ uid: `ev-${String(i).padStart(6, "0")}`, at: NOW.toISOString(), day: addDays(TODAY, o), kind: "write" }));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const units = (statuses) => statuses.map((status, i) => ({ uid: `un-${String(i).padStart(6, "0")}`, at: new Date(NOW.getTime() - (10 - i) * 3600000).toISOString(),
  day: addDays(TODAY, -1), kind: "unit", unit: { planned: 300, status } }));

test("neu: Hälfte der Wunschzeit, mindestens 3", () => {
  assert.equal(sessionMinutes({ profile: prof({ minutes: 10 }), activity: [], now: NOW }), 5);
  assert.equal(sessionMinutes({ profile: prof({ minutes: 5 }), activity: [], now: NOW }), 3);
});

test("wächst mit aktiven Tagen bis zur Wunschzeit, ehrgeizig darüber", () => {
  assert.equal(sessionMinutes({ profile: prof(), activity: days(range(-10, -1)), now: NOW }), 10);
  assert.equal(sessionMinutes({ profile: prof({ motivation: "ambitious" }), activity: days(range(-14, -1)), now: NOW }), 13);
  assert.equal(sessionMinutes({ profile: prof({ motivation: "relaxed" }), activity: days(range(-14, -1)), now: NOW }), 10);
});

test("Pause ab 3 Tagen setzt zurück", () => {
  assert.equal(sessionMinutes({ profile: prof(), activity: days(range(-16, -3)), now: NOW }), 5);
  assert.equal(sessionMinutes({ profile: prof(), activity: days(range(-16, -2)), now: NOW }), 10);
});

test("Abbrüche kürzen", () => {
  const activity = [...days(range(-10, -1)), ...units(["done", "abandoned", "done", "abandoned", "partial"])];
  assert.equal(sessionMinutes({ profile: prof(), activity, now: NOW }), 8);
});

test("writeDays", () => {
  assert.deepEqual(writeDays(1), [0]);
  assert.deepEqual(writeDays(2), [0, 3]);
  assert.deepEqual(writeDays(3), [0, 2, 4]);
  assert.deepEqual(writeDays(5), [0, 1, 2, 3, 4]);
});

const entry = (id, createdAt, extra = {}) => ({ id, createdAt, text: "Some text.", analysis: GOOD, metrics: { words: 50 }, revisions: [], speaking: [], ...extra });

test("Schreibtag: verpasster rückt nach", () => {
  const p = prof({ writesPerWeek: 2 });
  assert.equal(isWriteDay({ profile: p, entries: [], now: NOW }), true, "Donnerstag, noch kein Text");
  const tue = new Date(2026, 10, 17, 18, 0);
  assert.equal(isWriteDay({ profile: p, entries: [], now: tue }), true, "Montag verpasst");
  assert.equal(isWriteDay({ profile: p, entries: [entry(1, new Date(2026, 10, 16, 12).toISOString())], now: tue }), false);
  const wed = new Date(2026, 10, 18, 18, 0);
  assert.equal(isWriteDay({ profile: p, entries: [entry(1, new Date(2026, 10, 16, 12).toISOString())], now: wed }), false);
  const lastWeek = [entry(1, new Date(2026, 10, 12, 12).toISOString()), entry(2, new Date(2026, 10, 13, 12).toISOString())];
  assert.equal(isWriteDay({ profile: p, entries: lastWeek, now: NOW }), true, "Texte der Vorwoche zählen nicht");
});

const dueCards = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, key: `gap|w${i}`, type: "gap",
  sched: { ...newSched(), state: "review", interval: 3, reps: 2, due: new Date(NOW.getTime() - 3600000).toISOString() } }));
const withErrors = entry(7, new Date(2026, 10, 19, 12).toISOString(), {
  analysis: { ...GOOD, errors: [{ quote: "a", fix: "b", category: "article", severity: "major", explanation: "x" }] } });
const base = (o) => ({ profile: prof({ minutes: 10 }), activity: [], cards: [], entries: [], drills: [], cardTimes: [], newPerDay: 0, now: NOW, ...o });

test("Budget: Karten höchstens 60 %, dann Übung", () => {
  const plan = planToday(base({ cards: dueCards(40), entries: [withErrors] }));
  assert.equal(plan.minutes, 5);
  const [cards, drill, ...rest] = plan.parts;
  assert.equal(cards.kind, "cards");
  assert.equal(cards.count, 15);
  assert.equal(cards.link, "#/go/karten");
  assert.equal(drill.kind, "drill");
  assert.equal(drill.link, `#/go/uebung/${drill.category}`);
  assert.equal(rest.length, 0);
});

test("Nur Karten ohne Texte; mindestens 5 Karten", () => {
  assert.equal(planToday(base({ cards: dueCards(40) })).parts[0].count, 25);
  const slow = planToday(base({ profile: prof({ minutes: 5 }), cards: dueCards(40), entries: [withErrors], cardTimes: [40000, 40000, 40000] }));
  assert.equal(slow.minutes, 3);
  assert.equal(slow.parts[0].count, 5);
});

test("Ohne Karten: Übung, Überarbeiten, Aussprache nach Zeit", () => {
  const plan = planToday(base({ profile: prof({ minutes: 20 }), entries: [withErrors] }));
  assert.equal(plan.minutes, 10);
  assert.deepEqual(plan.parts.map((p) => p.kind), ["drill", "revise", "speak"]);
  assert.equal(plan.parts[1].link, "#/go/ueberarbeiten/7");
  assert.equal(plan.parts[2].link, "#/go/sprechen/7");
  const spoke = planToday(base({ profile: prof({ minutes: 20 }), entries: [withErrors],
    activity: [{ uid: "sp-00000001", at: NOW.toISOString(), day: addDays(TODAY, -2), kind: "speak" }] }));
  assert.deepEqual(spoke.parts.map((p) => p.kind), ["drill", "revise"], "Aussprache erst nach 7 Tagen wieder");
});

test("Leer und erledigt", () => {
  const empty = planToday(base({}));
  assert.equal(empty.parts.length, 0);
  assert.equal(empty.done, false);
  const done = planToday(base({ activity: [{ uid: "un-00000009", at: NOW.toISOString(), day: TODAY, kind: "unit", unit: { planned: 300, status: "done" } }] }));
  assert.equal(done.done, true);
});

test("estimates: Median und Grenzen", () => {
  assert.equal(estimates({ cardTimes: [], activity: [] }).card, 12);
  assert.equal(estimates({ cardTimes: [1000, 2000, 3000], activity: [] }).card, 5);
  assert.equal(estimates({ cardTimes: [60000, 60000, 60000], activity: [] }).card, 40);
  assert.equal(estimates({ cardTimes: [9000, 15000, 30000], activity: [] }).card, 15);
  const e = estimates({ cardTimes: [], activity: [{ kind: "drill", ms: 200000 }, { kind: "drill", ms: 100000 }, { kind: "drill", ms: 150000 }] });
  assert.deepEqual([e.drill, e.revise, e.speak], [150, 180, 120]);
});

test("planForDay: Karten aus der Vorschau", () => {
  const cards = dueCards(3).map((c, i) => ({ ...c, sched: { ...c.sched, due: new Date(2026, 10, 22, 10 + i).toISOString() } }));
  const d = planForDay(base({ cards }), 2);
  assert.equal(d.cards, 3);
  assert.equal(d.minutes, 5);
  assert.equal(typeof d.writeDay, "boolean");
});

test("recommendation", () => {
  const r = recommendation(prof({ minutes: 10, writesPerWeek: 2 }));
  assert.equal(r.startMinutes, 5);
  assert.equal(r.maxMinutes, 10);
  assert.deepEqual(r.writeDays, [0, 3]);
  assert.match(r.text, /5 Minuten/);
  assert.match(r.text, /Montag und Donnerstag/);
  assert.match(recommendation(prof({ writesPerWeek: 5, motivation: "ambitious" })).text, /Montag bis Freitag/);
  assert.equal(recommendation(prof({ minutes: 20, motivation: "ambitious" })).maxMinutes, 26);
});

test("4-Uhr-Grenze: Aktivität um 3:30 zählt für den Vortag", () => {
  const night = [{ uid: "ng-00000001", at: new Date(2026, 10, 20, 3, 30).toISOString(), day: learningDayKey(new Date(2026, 10, 20, 3, 30)), kind: "write" }];
  const early = new Date(2026, 10, 20, 3, 45);
  // Für "jetzt = 3:45 am 20." ist der Lerntag noch der 19.: Die Aktivität ist von heute, gestern nichts → Pause 0.
  assert.equal(sessionMinutes({ profile: prof(), activity: night, now: early }), 5);
  assert.equal(night[0].day, "2026-11-19");
});
