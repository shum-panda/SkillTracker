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

import net from "node:net";

test("Kaputte Anfrage bringt den Vermittler nicht zum Absturz", async () => {
  const port = server.address().port;
  await new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => s.write("GET http://[x/ HTTP/1.1\r\nHost: x\r\n\r\n"));
    s.on("data", () => s.end());
    s.on("close", resolve);
    s.on("error", resolve);
  });
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
});

test("Wer zuerst ablegt, gewinnt; abgebrochene Warteschlangen räumen auf", async () => {
  const room = "d".repeat(22);
  await relayPut(base, room, "offer", "erstes");
  await assert.rejects(relayPut(base, room, "offer", "zweites"), /409/);
  assert.equal(await relayGet(base, room, "offer", { wait: 0 }), "erstes");
  for (let i = 0; i < 5; i++) {
    const ac = new AbortController();
    const p = relayGet(base, `w${i}`.padEnd(22, "x"), "answer", { wait: 10, signal: ac.signal }).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await p;
  }
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(server.stats().waiters, 0);
});

test("X-Forwarded-For zählt nur mit TRUST_PROXY", async () => {
  const strict = createRelay({ perIpPerMin: 2 });
  await new Promise((r) => strict.listen(0, "127.0.0.1", r));
  const b = `http://127.0.0.1:${strict.address().port}`;
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${b}/r/${"e".repeat(22)}/offer?wait=0`, { headers: { "X-Forwarded-For": `10.0.0.${i}` } });
    codes.push(res.status);
  }
  strict.close();
  assert.deepEqual(codes, [204, 204, 429, 429], "gefälschte Absender helfen nicht");
});
