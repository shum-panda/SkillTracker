/* Service Worker: App-Hülle und Wortliste offline. Anfragen an KI-Anbieter (fremde Adressen) werden nie angefasst. */
const CACHE = "skilltracker-v8";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "fonts/fonts.css", "icons/logo.svg", "icons/icon-192.png",
  "data/wordfreq-en.json",
  "ui/app.js", "ui/dom.js", "ui/charts.js", "ui/image.js", "ui/highlight.js",
  "ui/views/home.js", "ui/views/new.js", "ui/views/entry.js", "ui/views/history.js", "ui/views/settings.js", "ui/views/revise.js", "ui/views/learn.js", "ui/views/train.js", "ui/views/sync.js", "ui/peer.js", "ui/views/speak.js", "ui/audio.js",
  "ui/views/welcome.js", "ui/views/go.js", "ui/unit.js", "ui/heatmap.js", "ui/push.js",
  "core/activity.js", "core/profile.js", "core/plan.js", "core/reminders.js",
  "core/ai.js", "core/backup.js", "core/demo.js", "core/pages.js", "core/revision.js", "core/cards.js", "core/srs.js", "core/weakness.js", "core/drill.js", "core/sync.js", "core/seal.js", "core/relay-client.js", "core/qr.js", "vendor/qrcode.js", "core/speech.js", "core/wav.js", "core/providers/audio.js", "core/freq.js", "core/html.js", "core/locate.js", "core/metrics.js",
  "core/prompts.js", "core/schema.js", "core/scores.js", "core/stats.js", "core/store.js", "core/store-idb.js",
  "core/taxonomy.js", "core/text.js",
  "core/providers/index.js", "core/providers/anthropic.js", "core/providers/openai.js", "core/providers/gemini.js",
  "core/providers/errors.js", "core/providers/http.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Netz zuerst, damit neue Versionen sofort da sind; ohne Netz aus dem Cache.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});

// --- Erinnerungen (Teil 7) ---
const appUrl = (hash) => new URL("index.html" + (String(hash || "").startsWith("#/go/") ? hash : "#/go/heute"), self.registration.scope).href;

function show(r) {
  const day = String(r.at || new Date().toISOString()).slice(0, 10);
  return self.registration.showNotification(r.title || "Zeit zum Lernen", {
    body: r.body || "", tag: `lernplan-${day}`, data: { url: r.url || "#/go/heute" }, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
  });
}

self.addEventListener("push", (e) => {
  let r = {};
  try { r = e.data ? e.data.json() : {}; } catch { r = { body: e.data?.text() || "" }; }
  e.waitUntil(show(r));
});

// Antippen: offenes Fenster nach vorn holen und nur den Hash ändern (kein Neuladen), sonst die App öffnen.
self.openFromNotification = async (hash) => {
  const target = String(hash || "").startsWith("#/go/") ? String(hash) : "#/go/heute";
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const own = wins.find((w) => w.url.startsWith(self.registration.scope));
  if (own) {
    await own.focus().catch(() => {});
    const u = new URL(own.url);
    u.hash = target;
    try {
      await own.navigate(u.href);
    } catch {
      own.postMessage({ type: "go", url: u.href });
    }
    return "navigated";
  }
  await self.clients.openWindow(appUrl(target));
  return "opened";
};

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.openFromNotification(e.notification.data?.url));
});

// Weg B: der Browser weckt den Service Worker ab und zu – fällige, noch nicht gezeigte Erinnerung anzeigen.
function readSetting(key) {
  return new Promise((resolve) => {
    const req = indexedDB.open("skilltracker");
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      try {
        const get = req.result.transaction("settings").objectStore("settings").get(key);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    };
  });
}
function writeSetting(key, value) {
  return new Promise((resolve) => {
    const req = indexedDB.open("skilltracker");
    req.onerror = () => resolve();
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction("settings", "readwrite");
        tx.objectStore("settings").put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch { resolve(); }
    };
  });
}
self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "lernplan") return;
  e.waitUntil((async () => {
    const list = (await readSetting("reminders")) || [];
    const shown = new Set((await readSetting("remindersShown")) || []);
    const now = Date.now();
    const due = list.filter((r) => Date.parse(r.at) <= now && now - Date.parse(r.at) < 12 * 3600 * 1000 && !shown.has(r.at));
    const last = due.at(-1);
    if (!last) return;
    await show(last);
    for (const r of due) shown.add(r.at);
    await writeSetting("remindersShown", [...shown].slice(-30));
  })());
});
