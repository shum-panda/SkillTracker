// SkillTracker-Vermittler: ein winziger Briefkasten für den Geräte-Abgleich (Node ≥ 20, keine Pakete).
// Er reicht nur verschlüsselte Verbindungsdaten weiter; die eigentlichen Daten laufen direkt von Gerät zu Gerät.
//   PUT /r/<raum>/<offer|answer>          Nachricht ablegen (≤ maxBody); wer zuerst ablegt, gewinnt (sonst 409)
//   GET /r/<raum>/<offer|answer>?wait=25  abholen, bis zu 25 s warten (sonst 204); abgeholt = gelöscht
//   GET /healthz
// Start: RELAY_ORIGINS=https://shum-panda.github.io PORT=8830 node server/relay.mjs
// Hinter einem Proxy (Caddy) zusätzlich TRUST_PROXY=1, damit die Begrenzung je Absender greift.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const ROOM = /^[A-Za-z0-9_-]{22,64}$/;
const SLOTS = new Set(["offer", "answer"]);

export function createRelay({
  origins = [], ttlMs = 180000, maxBody = 16 * 1024, maxBoxes = 1000, maxWaiters = 2000, perIpPerMin = 120, trustProxy = false,
} = {}) {
  const boxes = new Map();   // "raum/slot" -> { data, expires }
  const waiters = new Map(); // "raum/slot" -> Set(fn)
  let waiterCount = 0;
  const hits = new Map();    // ip -> { n, reset }

  const sweep = () => {
    const now = Date.now();
    for (const [k, v] of boxes) if (v.expires <= now) boxes.delete(k);
    for (const [ip, h] of hits) if (h.reset <= now) hits.delete(ip);
  };
  const timer = setInterval(sweep, Math.min(ttlMs, 30000));
  timer.unref();

  const cors = (req, res) => {
    const o = req.headers.origin;
    if (o && origins.includes(o)) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
  };

  const clientIp = (req) => {
    if (trustProxy) {
      const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (hops.length) return hops.at(-1); // der letzte Eintrag stammt vom eigenen Proxy
    }
    return req.socket.remoteAddress || "?";
  };

  const limited = (req) => {
    const ip = clientIp(req);
    const now = Date.now();
    const h = hits.get(ip) || { n: 0, reset: now + 60000 };
    if (h.reset <= now) { h.n = 0; h.reset = now + 60000; }
    h.n++;
    hits.set(ip, h);
    return h.n > perIpPerMin;
  };

  const take = (key) => {
    const box = boxes.get(key);
    boxes.delete(key);
    return box && box.expires > Date.now() ? box.data : null;
  };

  const removeWaiter = (key, fn) => {
    const set = waiters.get(key);
    if (!set?.delete(fn)) return;
    waiterCount--;
    if (!set.size) waiters.delete(key);
  };

  const handle = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    cors(req, res);
    let u;
    try {
      u = new URL(req.url, "http://relay");
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    if (u.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }).end("ok"); return; }
    const m = u.pathname.match(/^\/r\/([^/]+)\/([^/]+)$/);
    if (!m || !ROOM.test(m[1]) || !SLOTS.has(m[2])) { res.writeHead(400).end(); return; }
    if (limited(req)) { res.writeHead(429).end(); return; }
    const key = `${m[1]}/${m[2]}`;

    if (req.method === "PUT") {
      let size = 0;
      const chunks = [];
      let tooBig = false;
      req.on("data", (c) => {
        size += c.length;
        if (size > maxBody * 16) { req.destroy(); return; } // grob übergroß: Verbindung kappen
        if (size > maxBody) { tooBig = true; return; }
        chunks.push(c);
      });
      req.on("end", () => {
        if (tooBig) { res.writeHead(413).end(); return; }
        const existing = boxes.get(key);
        if (existing && existing.expires > Date.now()) { res.writeHead(409).end(); return; }
        const data = Buffer.concat(chunks).toString("utf8");
        const set = waiters.get(key);
        if (set?.size) {
          const [first] = set;
          first(data);
          res.writeHead(204).end();
          return;
        }
        if (boxes.size >= maxBoxes) { sweep(); if (boxes.size >= maxBoxes) { res.writeHead(503).end(); return; } }
        boxes.set(key, { data, expires: Date.now() + ttlMs });
        res.writeHead(204).end();
      });
      return;
    }

    if (req.method === "GET") {
      const data = take(key);
      if (data !== null) { res.writeHead(200, { "content-type": "text/plain" }).end(data); return; }
      const wait = Math.max(0, Math.min(25, Number(u.searchParams.get("wait")) || 0));
      if (!wait) { res.writeHead(204).end(); return; }
      const set = waiters.get(key) || new Set();
      if (set.size >= 2 || waiterCount >= maxWaiters) { res.writeHead(503).end(); return; }
      waiters.set(key, set);
      let t;
      const done = (msg) => {
        clearTimeout(t);
        removeWaiter(key, done);
        if (res.writableEnded || res.destroyed) {
          if (msg !== null) boxes.set(key, { data: msg, expires: Date.now() + ttlMs }); // Nachricht nicht verlieren
          return;
        }
        if (msg === null) res.writeHead(204).end();
        else res.writeHead(200, { "content-type": "text/plain" }).end(msg);
      };
      t = setTimeout(() => done(null), wait * 1000);
      set.add(done);
      waiterCount++;
      res.on("close", () => { if (!res.writableEnded) { clearTimeout(t); removeWaiter(key, done); } });
      return;
    }
    res.writeHead(405).end();
  };

  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });
  server.on("close", () => clearInterval(timer));
  server.stats = () => ({ boxes: boxes.size, waiters: waiterCount, rooms: waiters.size });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const origins = (process.env.RELAY_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const port = Number(process.env.PORT || 8830);
  createRelay({ origins, trustProxy: process.env.TRUST_PROXY === "1" }).listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`SkillTracker-Vermittler auf Port ${port}, erlaubt: ${origins.join(", ") || "(keine Herkunft – nur ohne Browser nutzbar)"}`));
}
