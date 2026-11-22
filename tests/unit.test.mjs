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
