process.env.TZ = "Europe/Berlin";
const { test } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const { buildReminders } = await import("../app/core/reminders.js");
const { defaultProfile } = await import("../app/core/profile.js");

const today = (o = {}) => ({ minutes: 6, parts: [{ kind: "cards", count: 14, seconds: 168 }], writeDay: false, done: false, ...o });
const upcoming = Array.from({ length: 7 }, () => ({ minutes: 6, cards: 10, writeDay: false }));
const NOW = new Date(2026, 10, 20, 18, 0); // Freitag 20.11., 18:00

test("7 Tage plus heute um 19:00", () => {
  const list = buildReminders({ profile: defaultProfile(), today: today(), upcoming, now: NOW });
  assert.equal(list.length, 8);
  assert.equal(list[0].at, new Date(2026, 10, 20, 19, 0).toISOString());
  assert.equal(list[7].at, new Date(2026, 10, 27, 19, 0).toISOString());
  assert.ok(list.every((r) => r.title === "Zeit zum Lernen" && r.url === "#/go/heute"));
  assert.equal(list[1].body, "ca. 6 Min · 10 Karten");
});

test("heute nicht, wenn erledigt oder die Zeit vorbei ist", () => {
  assert.equal(buildReminders({ profile: defaultProfile(), today: today({ done: true }), upcoming, now: NOW }).length, 7);
  assert.equal(buildReminders({ profile: defaultProfile(), today: today(), upcoming, now: new Date(2026, 10, 20, 19, 30) }).length, 7);
});

test("nur gewählte Wochentage", () => {
  const p = defaultProfile();
  p.reminder.days = [0, 3]; // Mo, Do
  const list = buildReminders({ profile: p, today: today(), upcoming, now: NOW });
  assert.deepEqual(list.map((r) => new Date(r.at).getDay()), [1, 4]); // Mo 23.11., Do 26.11.
});

test("Zeitumstellung: 19:00 bleibt 19:00 Ortszeit", () => {
  const now = new Date(2026, 2, 27, 12, 0); // Fr 27.03.2026, Umstellung am So 29.03.
  const list = buildReminders({ profile: defaultProfile(), today: today(), upcoming, now });
  assert.equal(list[0].at, "2026-03-27T18:00:00.000Z");
  assert.equal(list[2].at, "2026-03-29T17:00:00.000Z");
  assert.ok(list.every((r) => new Date(r.at).getHours() === 19));
});

test("Text: Minuten, Karten, Übung, Schreibtag; höchstens 140 Zeichen", () => {
  const t = today({ parts: [{ kind: "cards", count: 14 }, { kind: "drill", label: "Artikel" }], writeDay: true });
  const [first] = buildReminders({ profile: defaultProfile(), today: t, upcoming, now: NOW });
  assert.equal(first.body, "ca. 6 Min · 14 Karten · Artikel · heute Schreibtag");
  const long = today({ parts: [{ kind: "drill", label: "x".repeat(300) }] });
  assert.ok(buildReminders({ profile: defaultProfile(), today: long, upcoming, now: NOW })[0].body.length <= 140);
});

test("aus = keine Erinnerungen", () => {
  const p = defaultProfile();
  p.reminder.enabled = false;
  assert.deepEqual(buildReminders({ profile: p, today: today(), upcoming, now: NOW }), []);
});
