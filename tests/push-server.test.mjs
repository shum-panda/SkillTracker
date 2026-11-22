import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPushServer } from "../server/push.mjs";
import { b64u, generateVapidKeys } from "../server/webpush.mjs";

const ORIGIN = "https://shum-panda.github.io";
const vapid = await generateVapidKeys("https://shum-panda.github.io/SkillTracker/");
const ua = await globalThis.crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const keys = { p256dh: b64u(new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", ua.publicKey))), auth: b64u(new Uint8Array(16).fill(7)) };
const SECRET = b64u(new Uint8Array(32).fill(1));
const T0 = Date.UTC(2026, 10, 22, 12);

async function setup({ status = 201 } = {}) {
  const dataFile = join(mkdtempSync(join(tmpdir(), "push-")), "state.json");
  let now = T0;
  const calls = [];
  const fetch = async (url) => { calls.push(url); return { status: typeof status === "function" ? status(calls.length) : status }; };
  const p = createPushServer({ dataFile, vapid, origins: [ORIGIN], fetch, now: () => now, tickMs: 0 });
  await new Promise((r) => p.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${p.server.address().port}`;
  const call = (method, path, body, headers = {}) => fetch_(base + path, { method, headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return { p, base, call, calls, dataFile, setNow: (t) => { now = t; }, close: () => p.close() };
}
const fetch_ = globalThis.fetch;
const sub = (endpoint = "https://fcm.googleapis.com/fcm/send/abc") => ({ endpoint, keys });
const rem = (minutes, o = {}) => ({ at: new Date(T0 + minutes * 60000).toISOString(), title: "Zeit zum Lernen", body: "ca. 5 Min", url: "#/go/heute", ...o });

test("Schlüssel abholen, anmelden, fällige senden und entfernen", async () => {
  const s = await setup();
  try {
    assert.equal((await (await s.call("GET", "/v1/key")).json()).publicKey, vapid.publicKey);
    assert.equal(await (await s.call("GET", "/healthz")).text(), "ok");
    assert.equal((await s.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(1), rem(120)] })).status, 204);
    s.setNow(T0 + 2 * 60000);
    await s.p.tick();
    assert.deepEqual(s.calls, ["https://fcm.googleapis.com/fcm/send/abc"]);
    const state = JSON.parse(readFileSync(s.dataFile, "utf8"));
    const [dev] = Object.values(state.subs);
    assert.equal(dev.reminders.length, 1);
    assert.notEqual(dev.secretHash, SECRET, "Geheimnis nur als Hash");
    assert.equal(JSON.stringify(state).includes(SECRET), false);
  } finally { s.close(); }
});

test("410 löscht das Gerät; 500 drei Versuche, dann weg; alte nicht senden", async () => {
  const gone = await setup({ status: 410 });
  try {
    await gone.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(1), rem(60)] });
    gone.setNow(T0 + 2 * 60000);
    await gone.p.tick();
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(gone.dataFile, "utf8")).subs), []);
  } finally { gone.close(); }
  const err = await setup({ status: 500 });
  try {
    await err.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(1)] });
    for (let i = 0; i < 4; i++) { err.setNow(T0 + (2 + i) * 60000); await err.p.tick(); }
    assert.equal(err.calls.length, 3);
    const [dev] = Object.values(JSON.parse(readFileSync(err.dataFile, "utf8")).subs);
    assert.equal(dev.reminders.length, 0);
  } finally { err.close(); }
  const late = await setup();
  try {
    await late.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(1)] });
    late.setNow(T0 + 3 * 3600000);
    await late.p.tick();
    assert.equal(late.calls.length, 0, "mehr als 2 h verpasst: verwerfen");
  } finally { late.close(); }
});

test("Geheimnis schützt Ändern und Abmelden", async () => {
  const s = await setup();
  try {
    await s.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(5)] });
    const other = b64u(new Uint8Array(32).fill(2));
    assert.equal((await s.call("PUT", "/v1/reminders", { subscription: sub(), secret: other, reminders: [] })).status, 403);
    assert.equal((await s.call("DELETE", "/v1/reminders", { endpoint: sub().endpoint, secret: other })).status, 403);
    assert.equal((await s.call("DELETE", "/v1/reminders", { endpoint: sub().endpoint, secret: SECRET })).status, 204);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(s.dataFile, "utf8")).subs), []);
  } finally { s.close(); }
});

test("Grenzen", async () => {
  const s = await setup();
  try {
    const put = (o) => s.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(5)], ...o });
    assert.equal((await put({ reminders: Array.from({ length: 15 }, (_, i) => rem(i + 1)) })).status, 400);
    assert.equal((await put({ reminders: [rem(5, { url: "https://evil.example" })] })).status, 400);
    assert.equal((await put({ reminders: [rem(5, { title: "x".repeat(61) })] })).status, 400);
    assert.equal((await put({ reminders: [rem(5, { body: "x".repeat(141) })] })).status, 400);
    assert.equal((await put({ reminders: [rem(9 * 24 * 60)] })).status, 400, "mehr als 8 Tage voraus");
    assert.equal((await put({ subscription: sub("https://example.com/x") })).status, 400);
    assert.equal((await put({ subscription: sub("http://fcm.googleapis.com/fcm/send/x") })).status, 400);
    assert.equal((await put({ subscription: { endpoint: sub().endpoint, keys: { p256dh: "kurz", auth: keys.auth } } })).status, 400);
    assert.equal((await put({ secret: "zu-kurz" })).status, 400);
    assert.equal((await s.call("PUT", "/v1/reminders", "x".repeat(9000))).status, 413);
    assert.equal((await s.call("PUT", "/v1/reminders", "{kaputt")).status, 400);
    assert.equal((await put({ subscription: sub("https://updates.push.services.mozilla.com/wpush/v2/x") })).status, 204);
    assert.equal((await put({ subscription: sub("https://web.push.apple.com/abc") })).status, 204);
  } finally { s.close(); }
});

test("höchstens 10 Änderungen pro Minute je Gerät", async () => {
  const s = await setup();
  try {
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await s.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(5)] })).status);
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(204));
    assert.equal(codes[10], 429);
  } finally { s.close(); }
});

test("CORS nur für erlaubte Herkunft", async () => {
  const s = await setup();
  try {
    const ok = await s.call("OPTIONS", "/v1/reminders", undefined, { "access-control-request-method": "PUT" });
    assert.equal(ok.headers.get("access-control-allow-origin"), ORIGIN);
    const bad = await s.call("GET", "/v1/key", undefined, { origin: "https://evil.example" });
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
  } finally { s.close(); }
});

test("Neustart kennt das Gerät; 60 Tage ohne Änderung wird es gelöscht", async () => {
  const s = await setup();
  await s.call("PUT", "/v1/reminders", { subscription: sub(), secret: SECRET, reminders: [rem(5)] });
  s.close();
  let now = T0;
  const again = createPushServer({ dataFile: s.dataFile, vapid, origins: [ORIGIN], fetch: async () => ({ status: 201 }), now: () => now, tickMs: 0 });
  try {
    assert.equal(Object.keys(again.state().subs).length, 1);
    now = T0 + 61 * 86400000;
    await again.tick();
    assert.equal(Object.keys(again.state().subs).length, 0);
  } finally { again.close(); }
});
