import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGo, unitStatus, sessionShouldEnd, partTarget } from "../app/ui/unit.js";

const entries = [{ id: 3 }, { id: 7 }];
const plan = { minutes: 5, parts: [{ kind: "cards", count: 10, seconds: 120, link: "#/go/karten" }, { kind: "drill", category: "article", seconds: 120, link: "#/go/uebung/article" }] };

test("resolveGo: alle Formen", () => {
  assert.equal(resolveGo("karten", { entries, plan }).hash, "#/learn/session");
  assert.equal(resolveGo("uebung/article", { entries, plan }).hash, "#/train/article");
  assert.equal(resolveGo("ueberarbeiten/7", { entries, plan }).hash, "#/e/7/revise");
  assert.equal(resolveGo("sprechen/3", { entries, plan }).hash, "#/e/3/speak");
  assert.equal(resolveGo("schreiben", { entries, plan }).hash, "#/new");
  assert.equal(resolveGo("heute", { entries, plan }).hash, "#/learn/session", "heute startet mit dem ersten Teil");
});

test("resolveGo: veraltete Ziele führen zum Plan für heute", () => {
  for (const path of ["ueberarbeiten/999", "sprechen/abc", "uebung/unbekannt", "quatsch", "", "karten/x"]) {
    const r = resolveGo(path, { entries, plan });
    assert.equal(r.hash, "#/go/heute", path);
    assert.match(r.note, /gibt es nicht mehr/);
  }
  const empty = resolveGo("heute", { entries, plan: { minutes: 5, parts: [] } });
  assert.equal(empty.hash, "#/new");
  assert.match(empty.note, /Text/);
});

test("partTarget", () => {
  assert.equal(partTarget(plan.parts[1], entries), "#/train/article");
});

test("unitStatus", () => {
  assert.equal(unitStatus(3, 3), "done");
  assert.equal(unitStatus(1, 3), "partial");
  assert.equal(unitStatus(0, 3), "abandoned");
});

test("sessionShouldEnd: Höchstzahl oder leere Schlange, nie endlos", () => {
  assert.equal(sessionShouldEnd({ graded: 10, limit: 10, queueLeft: 4 }), true);
  assert.equal(sessionShouldEnd({ graded: 3, limit: 10, queueLeft: 0 }), true);
  assert.equal(sessionShouldEnd({ graded: 3, limit: 10, queueLeft: 2 }), false);
  assert.equal(sessionShouldEnd({ graded: 3, limit: null, queueLeft: 2 }), false);
  // "Nochmal" legt die Karte zurück in die Schlange, zählt aber als Bewertung
  let graded = 0;
  let queue = 1;
  for (let i = 0; i < 50 && !sessionShouldEnd({ graded, limit: 5, queueLeft: queue }); i++) { graded++; queue = 1; }
  assert.equal(graded, 5);
});

// --- Korrektur aus der Prüfung: App während einer Einheit geschlossen ---
import { MemoryStore } from "../app/core/store.js";
import { startUnit, recoverUnit } from "../app/ui/unit.js";

test("Einheit offen beim Schließen: beim nächsten Start als abgebrochen bzw. teilweise gezählt", async () => {
  const store = new MemoryStore();
  const ctx = { store, demo: false, unit: null, replace() {}, reminders: null };
  const unit = startUnit(ctx, plan, entries);
  assert.ok(await store.getSetting("unitOpen"), "offene Einheit gemerkt");
  // App wird geschlossen: nichts weiter passiert. Nächster Start:
  assert.equal(await recoverUnit(store), "abandoned");
  const ev = (await store.listActivity()).find((e) => e.kind === "unit");
  assert.deepEqual(ev.unit, { planned: 300, status: "abandoned" });
  assert.equal(await store.getSetting("unitOpen"), null);
  assert.equal(await recoverUnit(store), null, "nur einmal");
  // ein Teil geschafft → teilweise
  const ctx2 = { store, demo: false, unit: null, replace() {}, reminders: null };
  const u2 = startUnit(ctx2, plan, entries);
  u2.partDone("cards");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await recoverUnit(store), "partial");
  // fertig → nichts offen
  const ctx3 = { store, demo: false, unit: null, replace() {}, reminders: null };
  const u3 = startUnit(ctx3, plan, entries);
  u3.partDone("cards"); u3.partDone("drill");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await recoverUnit(store), null);
  void unit;
});
