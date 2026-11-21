/* Service Worker: App-Hülle und Wortliste offline. Anfragen an KI-Anbieter (fremde Adressen) werden nie angefasst. */
const CACHE = "skilltracker-v7";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "fonts/fonts.css", "icons/logo.svg", "icons/icon-192.png",
  "data/wordfreq-en.json",
  "ui/app.js", "ui/dom.js", "ui/charts.js", "ui/image.js", "ui/highlight.js",
  "ui/views/home.js", "ui/views/new.js", "ui/views/entry.js", "ui/views/history.js", "ui/views/settings.js", "ui/views/revise.js", "ui/views/learn.js", "ui/views/train.js", "ui/views/sync.js", "ui/peer.js", "ui/views/speak.js", "ui/audio.js",
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
