import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRelay } from "../server/relay.mjs";
import { relayPut, relayGet } from "../app/core/relay-client.js";

let server;
let base;
before(async () => {
  server = createRelay({ origins: ["https://app.example"], ttlMs: 400, maxBody: 1024 });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const ROOM = "a".repeat(22);

test("ablegen und abholen; einmal abgeholt ist weg", async () => {
  await relayPut(base, ROOM, "offer", "geheim-1");
  assert.equal(await relayGet(base, ROOM, "offer", { wait: 1 }), "geheim-1");
  assert.equal(await relayGet(base, ROOM, "offer", { wait: 0 }), null);
});

test("Warten bis die Nachricht kommt", async () => {
  const room = "b".repeat(22);
  const pending = relayGet(base, room, "answer", { wait: 5 });
  setTimeout(() => relayPut(base, room, "answer", "spät"), 150);
  assert.equal(await pending, "spät");
});

test("Ablauf, Größenlimit, ungültige Räume, CORS", async () => {
  const room = "c".repeat(22);
  await relayPut(base, room, "offer", "x");
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await relayGet(base, room, "offer", { wait: 0 }), null, "nach Ablauf weg");
  await assert.rejects(relayPut(base, room, "offer", "y".repeat(2000)), /413/);
  let res = await fetch(`${base}/r/short/offer`, { method: "PUT", body: "x" });
  assert.equal(res.status, 400);
  res = await fetch(`${base}/r/${room}/hack`, { method: "PUT", body: "x" });
  assert.equal(res.status, 400);
  res = await fetch(`${base}/r/${room}/offer`, { method: "OPTIONS", headers: { Origin: "https://app.example" } });
  assert.equal(res.headers.get("access-control-allow-origin"), "https://app.example");
  res = await fetch(`${base}/r/${room}/offer`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
});
