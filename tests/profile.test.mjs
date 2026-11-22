import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultProfile, cleanProfile, GOALS, MOTIVATIONS, MINUTES, WRITES } from "../app/core/profile.js";

test("defaultProfile: Standardwerte, Prüfung mit 3 Texten", () => {
  const p = defaultProfile();
  assert.equal(p.goal, "daily");
  assert.equal(p.motivation, "steady");
  assert.equal(p.minutes, 10);
  assert.equal(p.writesPerWeek, 2);
  assert.deepEqual(p.reminder, { enabled: true, time: "19:00", days: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(p.examDate, null);
  assert.equal(p.level, null);
  assert.ok(!Number.isNaN(Date.parse(p.updatedAt)));
  assert.equal(defaultProfile("exam").writesPerWeek, 3);
  assert.deepEqual([GOALS.length, MOTIVATIONS.length, MINUTES.length, WRITES.length], [4, 3, 3, 4]);
});

test("cleanProfile: nur gültige Werte", () => {
  const p = defaultProfile();
  assert.deepEqual(cleanProfile(p), p);
  assert.equal(cleanProfile({ ...p, minutes: 7 }), null);
  assert.equal(cleanProfile({ ...p, goal: "hack" }), null);
  assert.equal(cleanProfile({ ...p, reminder: { ...p.reminder, time: "24:00" } }), null);
  assert.equal(cleanProfile({ ...p, reminder: { ...p.reminder, days: [0, 0, 8] } }), null);
  assert.equal(cleanProfile({ ...p, examDate: "morgen" }), null);
  assert.equal(cleanProfile({ ...p, level: "Z9" }), null);
  assert.equal(cleanProfile("x"), null);
  const exam = { ...p, goal: "exam", examDate: "2027-03-01", level: "B2" };
  assert.deepEqual(cleanProfile(exam), exam);
});
