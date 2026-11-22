import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../app/core/store.js";
import { learningDayKey } from "../app/core/srs.js";
import {
  KINDS, recordActivity, recordCardTimes, backfillActivity, pruneActivity, dayStats, levelOf, streaks,
} from "../app/core/activity.js";

test("learningDayKey und recordActivity: Lerntag beginnt um 4 Uhr", async () => {
  assert.equal(learningDayKey(new Date(2026, 10, 20, 3, 30)), "2026-11-19");
  assert.equal(learningDayKey(new Date(2026, 10, 20, 4, 0)), "2026-11-20");
  const s = new MemoryStore();
  const ev = await recordActivity(s, { kind: "write", at: new Date(2026, 10, 20, 3, 30) });
  assert.equal(ev.day, "2026-11-19");
  assert.match(ev.uid, /^[A-Za-z0-9-]{8,64}$/);
  assert.deepEqual((await s.listActivity()).map((e) => e.uid), [ev.uid]);
  await assert.rejects(recordActivity(s, { kind: "hack" }));
  assert.ok(KINDS.includes("unit"));
});

test("dayStats zählt Minuten und Stärke", () => {
  const day = "2026-11-19";
  const stats = dayStats([
    { day, kind: "cards", count: 10, ms: 120000 },
    { day, kind: "write" },
    { day, kind: "drill" },
    { day: "2026-11-18", kind: "cards", count: 10 },
  ]);
  const d = stats.get(day);
  assert.equal(d.minutes, 2);
  assert.equal(d.cards, 10);
  assert.equal(d.write, 1);
  assert.equal(d.score, 2 + 5 + 2);
  assert.equal(stats.get("2026-11-18").minutes, 2, "12 s je Karte ohne Dauer");
});

test("levelOf Grenzen", () => {
  assert.deepEqual([0, 1, 4, 5, 9, 10, 19, 20, 99].map(levelOf), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("streaks: aktuelle und längste Serie", () => {
  const days = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-17", "2026-11-18", "2026-11-19"];
  const stats = dayStats(days.map((day) => ({ day, kind: "write" })));
  assert.deepEqual(streaks(stats, "2026-11-19"), { current: 3, longest: 5 });
  assert.equal(streaks(stats, "2026-11-20").current, 3, "heute noch nichts – gestern reicht");
  assert.equal(streaks(stats, "2026-11-21").current, 0);
});

async function filled() {
  const s = new MemoryStore();
  for (const [c, r, sp] of [["2026-11-01T10:00:00.000Z", "2026-11-02T10:00:00.000Z", "2026-11-03T10:00:00.000Z"],
    ["2026-11-05T10:00:00.000Z", "2026-11-06T10:00:00.000Z", "2026-11-07T10:00:00.000Z"]]) {
    await s.addEntry({ createdAt: c, text: "x", revisions: [{ createdAt: r, mode: "tasks" }], speaking: [{ createdAt: sp, method: "self", score: 60 }] });
  }
  await s.setSetting("drills", [{ createdAt: "2026-11-08T10:00:00.000Z", category: "articles", total: 3, correct: 2 }]);
  await s.addCard({ key: "gap|hello", type: "gap", sched: { state: "review", firstStudied: "2026-11-09T10:00:00.000Z" } });
  await s.addCard({ key: "gap|never", type: "gap", sched: { state: "new", firstStudied: null } });
  return s;
}

test("backfillActivity: einmalig und auf jedem Gerät mit denselben uids", async () => {
  const a = await filled();
  assert.equal(await backfillActivity(a), 8);
  assert.equal(await backfillActivity(a), 0);
  const b = await filled();
  await backfillActivity(b);
  const ua = (await a.listActivity()).map((e) => e.uid).sort();
  const ub = (await b.listActivity()).map((e) => e.uid).sort();
  assert.deepEqual(ua, ub);
  const evs = await a.listActivity();
  assert.ok(evs.every((e) => e.backfill === true && e.ms === undefined && e.uid.startsWith("bf-")));
  assert.deepEqual(evs.map((e) => e.kind).sort(), ["cards", "drill", "revise", "revise", "speak", "speak", "write", "write"]);
});

test("pruneActivity: älter als 2 Jahre weg, höchstens 5000", async () => {
  const s = new MemoryStore();
  const now = new Date(2026, 10, 20, 12);
  await recordActivity(s, { kind: "write", at: new Date(2024, 9, 1, 12) });
  for (let i = 0; i < 5003; i++) await s.addActivity({ uid: `x-${String(i).padStart(8, "0")}`, at: new Date(2026, 0, 1, 12, 0, i).toISOString(), day: "2026-01-01", kind: "cards", count: 1 });
  const removed = await pruneActivity(s, now);
  assert.equal(removed, 4);
  const left = await s.listActivity();
  assert.equal(left.length, 5000);
  assert.equal(left[0].uid, "x-00000003", "die ältesten fallen weg");
});

test("recordCardTimes behält die letzten 200", async () => {
  const s = new MemoryStore();
  await recordCardTimes(s, Array.from({ length: 150 }, (_, i) => i));
  await recordCardTimes(s, Array.from({ length: 100 }, (_, i) => 1000 + i));
  const t = await s.getSetting("cardTimes");
  assert.equal(t.length, 200);
  assert.equal(t[0], 50);
  assert.equal(t.at(-1), 1099);
});

test("MemoryStore: Aktivität löschen und clearAll", async () => {
  const s = new MemoryStore();
  const e = await recordActivity(s, { kind: "cards", count: 3, ms: 30000 });
  await recordActivity(s, { kind: "write" });
  await s.deleteActivity([e.uid]);
  assert.equal((await s.listActivity()).length, 1);
  await s.clearAll();
  assert.deepEqual(await s.listActivity(), []);
});
