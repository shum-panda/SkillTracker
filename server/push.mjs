// SkillTracker-Absender für Erinnerungen (Node ≥ 20, keine Pakete). Speichert je Gerät nur Push-Adresse, Geräteschlüssel,
// Hash des Geräte-Geheimnisses und kurze Erinnerungszeilen – keine Texte, keine Karten.
//   GET    /v1/key                                   öffentlicher VAPID-Schlüssel
//   PUT    /v1/reminders  {subscription, secret, reminders}   Liste dieses Geräts ersetzen
//   DELETE /v1/reminders  {endpoint, secret}         abmelden
//   GET    /healthz
// Start: PUSH_VAPID=/etc/skilltracker-push/vapid.json PUSH_DATA=/var/lib/skilltracker-push/state.json \
//        PUSH_ORIGINS=https://shum-panda.github.io PORT=8840 node server/push.mjs
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sendPush, unb64u } from "./webpush.mjs";

const MAX_BODY = 8 * 1024;
const MAX_REMINDERS = 14;
const AHEAD_MS = 8 * 86400000;
const LATE_MS = 2 * 3600000;
const STALE_MS = 60 * 86400000;
const MAX_TRIES = 3;
const CHANGES_PER_MIN = 10;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
const HOSTS = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function checkEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1024) throw new HttpError(400, "endpoint fehlt");
  let u;
  try { u = new URL(endpoint); } catch { throw new HttpError(400, "endpoint ungültig"); }
  if (u.protocol !== "https:" || !HOSTS.some((re) => re.test(u.hostname))) throw new HttpError(400, "unbekannter Push-Dienst");
  return u.href;
}

function checkKeys(keys) {
  if (!isObj(keys) || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") throw new HttpError(400, "keys fehlen");
  const p = unb64u(keys.p256dh);
  const a = unb64u(keys.auth);
  if (p.length !== 65 || p[0] !== 4 || a.length !== 16) throw new HttpError(400, "keys ungültig");
  return { p256dh: keys.p256dh, auth: keys.auth };
}

function checkReminders(list, now) {
  if (!Array.isArray(list) || list.length > MAX_REMINDERS) throw new HttpError(400, "höchstens 14 Erinnerungen");
  return list.map((r) => {
    if (!isObj(r)) throw new HttpError(400, "Erinnerung ungültig");
    const at = Date.parse(r.at);
    if (!Number.isFinite(at) || at > now + AHEAD_MS || at < now - LATE_MS) throw new HttpError(400, "Zeitpunkt ungültig");
    if (typeof r.title !== "string" || !r.title || r.title.length > 60) throw new HttpError(400, "Titel ungültig");
    if (typeof r.body !== "string" || r.body.length > 140) throw new HttpError(400, "Text ungültig");
    if (typeof r.url !== "string" || !r.url.startsWith("#/go/") || r.url.length > 200) throw new HttpError(400, "Ziel ungültig");
    return { at: new Date(at).toISOString(), title: r.title, body: r.body, url: r.url, tries: 0 };
  }).sort((a, b) => a.at.localeCompare(b.at));
}

export function createPushServer({ dataFile, vapid, origins = [], fetch = globalThis.fetch, now = () => Date.now(), tickMs = 60000 } = {}) {
  let state = { subs: {} };
  if (dataFile && existsSync(dataFile)) {
    try { state = JSON.parse(readFileSync(dataFile, "utf8")); } catch { state = { subs: {} }; }
    if (!isObj(state.subs)) state = { subs: {} };
  }
  const save = () => {
    if (!dataFile) return;
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile + ".tmp", JSON.stringify(state));
    renameSync(dataFile + ".tmp", dataFile);
  };
  const changes = new Map(); // Gerät -> { n, reset }
  const limited = (id) => {
    const t = now();
    const c = changes.get(id) || { n: 0, reset: t + 60000 };
    if (c.reset <= t) { c.n = 0; c.reset = t + 60000; }
    c.n++;
    changes.set(id, c);
    return c.n > CHANGES_PER_MIN;
  };

  let timer = null;
  let ticking = null;
  const schedule = () => {
    if (!tickMs) return;
    clearTimeout(timer);
    const next = Math.min(...Object.values(state.subs).flatMap((s) => s.reminders.map((r) => Date.parse(r.at))), Infinity);
    const wait = Math.max(1000, Math.min(tickMs, next - now()));
    timer = setTimeout(() => tick().catch(() => {}), wait);
    timer.unref?.();
  };

  async function tick() {
    if (ticking) return ticking;
    ticking = (async () => {
      const t = now();
      let changed = false;
      for (const [id, s] of Object.entries(state.subs)) {
        if (t - s.updated > STALE_MS) { delete state.subs[id]; changed = true; continue; }
        for (const r of [...s.reminders]) {
          if (Date.parse(r.at) > t) continue;
          const drop = () => { const cur = state.subs[id]; if (cur) cur.reminders = cur.reminders.filter((x) => x !== r); changed = true; };
          if (t - Date.parse(r.at) > LATE_MS) { drop(); continue; }
          let status = 0;
          try {
            ({ status } = await sendPush({ subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload: { title: r.title, body: r.body, url: r.url, at: r.at }, vapid, fetch, now: t }));
          } catch { status = 0; }
          if (status >= 200 && status < 300) drop();
          else if (status === 404 || status === 410) { delete state.subs[id]; changed = true; break; }
          else { r.tries++; changed = true; if (r.tries >= MAX_TRIES) drop(); }
        }
      }
      if (changed) save();
    })();
    try { await ticking; } finally { ticking = null; schedule(); }
  }

  const cors = (req, res) => {
    const o = req.headers.origin;
    if (o && origins.includes(o)) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
  };

  const readJson = (req) => new Promise((resolve, reject) => {
    if (Number(req.headers["content-length"]) > MAX_BODY) { req.resume(); reject(new HttpError(413, "zu groß")); return; }
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c); // Rest nur noch lesen, nicht merken
    });
    req.on("end", () => {
      if (size > MAX_BODY) { reject(new HttpError(413, "zu groß")); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "kein JSON")); }
    });
    req.on("error", reject);
  });

  const server = createServer(async (req, res) => {
    try {
      cors(req, res);
      const path = new URL(req.url, "http://x").pathname;
      if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
      if (req.method === "GET" && path === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }).end("ok"); return; }
      if (req.method === "GET" && path === "/v1/key") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ publicKey: vapid.publicKey }));
        return;
      }
      if (path !== "/v1/reminders" || !["PUT", "DELETE"].includes(req.method)) { res.writeHead(404).end(); return; }
      const body = await readJson(req);
      if (!isObj(body)) throw new HttpError(400, "kein Objekt");
      const endpoint = checkEndpoint(req.method === "PUT" ? body.subscription?.endpoint : body.endpoint);
      if (typeof body.secret !== "string" || !SECRET_RE.test(body.secret)) throw new HttpError(400, "secret ungültig");
      const id = sha(endpoint);
      if (limited(id)) throw new HttpError(429, "zu viele Änderungen");
      const have = state.subs[id];
      if (have && have.secretHash !== sha(body.secret)) throw new HttpError(403, "falsches Geheimnis");
      if (req.method === "DELETE") {
        if (have) { delete state.subs[id]; save(); }
        res.writeHead(204).end();
        return;
      }
      const keys = checkKeys(body.subscription.keys);
      const reminders = checkReminders(body.reminders, now());
      state.subs[id] = { endpoint, ...keys, secretHash: sha(body.secret), updated: now(), reminders };
      save();
      schedule();
      res.writeHead(204).end();
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
      res.end(status === 500 ? "Fehler" : e.message);
    }
  });
  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });
  schedule();
  return {
    server, tick, state: () => state,
    close() { clearTimeout(timer); server.close(); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vapid = JSON.parse(readFileSync(process.env.PUSH_VAPID || "/etc/skilltracker-push/vapid.json", "utf8"));
  const origins = (process.env.PUSH_ORIGINS || "https://shum-panda.github.io").split(",").map((s) => s.trim()).filter(Boolean);
  const port = Number(process.env.PORT || 8840);
  const p = createPushServer({ dataFile: process.env.PUSH_DATA || "/var/lib/skilltracker-push/state.json", vapid, origins });
  p.server.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`SkillTracker-Erinnerungen auf Port ${port}, erlaubt: ${origins.join(", ")}`));
}
