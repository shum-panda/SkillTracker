import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../app/core/store.js";
import { defaultProfile } from "../app/core/profile.js";
import { createReminders } from "../app/ui/push.js";

const b64u = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const KEY_NEW = new Uint8Array(65).fill(9); KEY_NEW[0] = 4;
const KEY_OLD = new Uint8Array(65).fill(3); KEY_OLD[0] = 4;

function fakeEnv({ existingKey = null, putStatus = [204] } = {}) {
  const log = [];
  let n = 0;
  const makeSub = (key, endpoint) => ({
    endpoint, options: { applicationServerKey: key.buffer },
    toJSON() { return { endpoint, keys: { p256dh: "p", auth: "a" } }; },
    async unsubscribe() { log.push(`unsubscribe ${endpoint}`); current = null; return true; },
  });
  let current = existingKey ? makeSub(existingKey, "https://fcm.googleapis.com/fcm/send/old") : null;
  const reg = {
    pushManager: {
      async getSubscription() { return current; },
      async subscribe({ applicationServerKey }) { n++; current = makeSub(new Uint8Array(applicationServerKey), `https://fcm.googleapis.com/fcm/send/new${n}`); log.push(`subscribe ${current.endpoint}`); return current; },
    },
    periodicSync: { async register() { log.push("periodic register"); }, async unregister() { log.push("periodic unregister"); } },
  };
  const puts = [...putStatus];
  const fetch = async (url, init = {}) => {
    if (url.endsWith("/v1/key")) return { ok: true, status: 200, json: async () => ({ publicKey: b64u(KEY_NEW) }) };
    const body = init.body ? JSON.parse(init.body) : {};
    log.push(`${init.method} ${body.subscription?.endpoint || body.endpoint}`);
    const status = init.method === "PUT" ? puts.shift() ?? 204 : 204;
    return { ok: status < 300, status };
  };
  return { log, env: { navigator: { serviceWorker: { ready: Promise.resolve(reg) }, permissions: { query: async () => ({ state: "granted" }) } }, fetch, Notification: { permission: "granted" } } };
}

async function ctxWith() {
  const store = new MemoryStore();
  await store.setSetting("profile", defaultProfile());
  return { store, demo: false, toast() {} };
}

test("Anmeldung mit altem Schlüssel wird erneuert", async () => {
  const { log, env } = fakeEnv({ existingKey: KEY_OLD });
  const ctx = await ctxWith();
  await createReminders(ctx, env).refresh();
  assert.deepEqual(log.filter((l) => !l.startsWith("periodic")), [
    "unsubscribe https://fcm.googleapis.com/fcm/send/old", "subscribe https://fcm.googleapis.com/fcm/send/new1", "PUT https://fcm.googleapis.com/fcm/send/new1"]);
  assert.equal((await ctx.store.getSetting("pushState")).way, "A");
});

test("gleicher Schlüssel: Anmeldung bleibt", async () => {
  const { log, env } = fakeEnv({ existingKey: KEY_NEW });
  await createReminders(await ctxWith(), env).refresh();
  assert.deepEqual(log.filter((l) => !l.startsWith("periodic")), ["PUT https://fcm.googleapis.com/fcm/send/old"]);
});

test("403 vom Absender (z. B. nach Löschen): neu anmelden und einmal wiederholen", async () => {
  const { log, env } = fakeEnv({ existingKey: KEY_NEW, putStatus: [403, 204] });
  const ctx = await ctxWith();
  await createReminders(ctx, env).refresh();
  assert.deepEqual(log.filter((l) => !l.startsWith("periodic")), ["PUT https://fcm.googleapis.com/fcm/send/old",
    "unsubscribe https://fcm.googleapis.com/fcm/send/old", "subscribe https://fcm.googleapis.com/fcm/send/new1", "PUT https://fcm.googleapis.com/fcm/send/new1"]);
  assert.equal((await ctx.store.getSetting("pushState")).way, "A");
});

test("Weg A klappt: Weg B wird abgemeldet", async () => {
  const { log, env } = fakeEnv({ existingKey: KEY_NEW });
  await createReminders(await ctxWith(), env).refresh();
  assert.ok(log.includes("periodic unregister"));
  assert.ok(!log.includes("periodic register"));
});

test("Ausschalten schaltet auch das Profil aus – kein Wiederkommen beim nächsten Start", async () => {
  const { log, env } = fakeEnv({ existingKey: KEY_NEW });
  const ctx = await ctxWith();
  const r = createReminders(ctx, env);
  await r.disable();
  assert.equal((await ctx.store.getSetting("profile")).reminder.enabled, false);
  assert.ok(log.some((l) => l.startsWith("DELETE")));
  log.length = 0;
  await r.refresh();
  assert.deepEqual(log.filter((l) => l.startsWith("subscribe")), [], "keine neue Anmeldung");
  assert.deepEqual(await ctx.store.getSetting("reminders"), []);
});
