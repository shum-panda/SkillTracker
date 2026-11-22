import { test } from "node:test";
import assert from "node:assert/strict";
import { heatmapGrid, heatmapHtml, dayLabel } from "../app/ui/heatmap.js";
import { dayStats } from "../app/core/activity.js";

const weekdayOf = (day) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

test("Raster beginnt Montag und endet mit heute", () => {
  const g = heatmapGrid("2026-11-20", 20);
  assert.equal(g.columns.length, 20);
  const last = g.columns.at(-1).days;
  assert.equal(last.length, 7);
  assert.equal(last[4].day, "2026-11-20"); // Freitag
  assert.equal(last[4].future, false);
  assert.deepEqual(last.slice(5).map((d) => d.future), [true, true]);
  assert.equal(weekdayOf(g.columns[0].days[0].day), 0);
  assert.ok(g.columns.every((c) => c.days.every((d, i) => weekdayOf(d.day) === i && d.weekday === i)));
});

test("Monatsnamen an der Spalte mit dem Monatsersten", () => {
  const g = heatmapGrid("2026-12-10", 20);
  const dec = g.columns.find((c) => c.days.some((d) => d.day === "2026-12-01"));
  assert.equal(dec.month, "Dez");
  assert.equal(g.columns.filter((c) => c.month).length >= 4, true);
});

test("Zeitumstellung: lückenlos und ohne doppelte Tage", () => {
  const g = heatmapGrid("2026-03-30", 20);
  const all = g.columns.flatMap((c) => c.days.map((d) => d.day));
  assert.equal(new Set(all).size, 140);
  for (let i = 1; i < all.length; i++) {
    const diff = (Date.parse(`${all[i]}T00:00:00Z`) - Date.parse(`${all[i - 1]}T00:00:00Z`)) / 86400000;
    assert.equal(diff, 1);
  }
});

test("HTML: Stufen, Zusammenfassung, nichts Ungeschütztes", () => {
  const stats = dayStats([{ day: "2026-11-19", kind: "cards", count: 10, ms: 25 * 60000 }, { day: "2026-11-18", kind: "write" }]);
  const html = heatmapHtml(stats, "2026-11-20");
  assert.match(html, /role="img"/);
  assert.match(html, /data-day="2026-11-19"[^>]*class="[^"]*\bl4\b/);
  assert.match(html, /data-day="2026-11-18"[^>]*class="[^"]*\bl2\b/);
  assert.match(html, /class="[^"]*\btoday\b/);
  assert.match(html, /Als Liste/);
  assert.match(html, /<table/);
  const label = dayLabel("2026-11-19", { write: 1, cards: 22, drill: 0, revise: 0, speak: 0, minutes: 8, score: 13, units: 0 });
  assert.equal(label, "Do, 19. Nov · 1 Text · 22 Karten · 8 Min");
  assert.equal(dayLabel("2026-11-19", undefined), "Do, 19. Nov · nichts");
  assert.doesNotMatch(dayLabel("<b>", { write: "<i>" }), /</);
});
