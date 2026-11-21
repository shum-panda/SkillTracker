// QR-Code als SVG (für den Abgleich-Link). Nutzt qrcode-generator (MIT, app/vendor).
import qrcode from "../vendor/qrcode.js";

export function qrSvg(text, { margin = 2, title = "QR-Code" } = {}) {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x + margin} ${y + margin}h1v1h-1z`;
  }
  const size = n + margin * 2;
  return `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${title.replace(/[<>&"]/g, "")}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// Abgleich-Link aus Raum, Schlüssel und Vermittler – und zurück.
export function syncLink(appUrl, { room, key, relay }) {
  const u = new URL(appUrl);
  u.hash = `#/sync?r=${encodeURIComponent(room)}&k=${encodeURIComponent(key)}&s=${encodeURIComponent(relay)}`;
  return u.toString();
}

export function parseSyncHash(hash) {
  const q = new URLSearchParams(String(hash).split("?")[1] || "");
  const room = q.get("r") || "";
  const key = q.get("k") || "";
  const relay = q.get("s") || "";
  // Vermittler nur per https – http nur für einen lokalen Test-Vermittler.
  const okRelay = /^https:\/\/[^\s]+$/.test(relay) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?$/.test(relay);
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(room) || !/^[A-Za-z0-9_-]{43}$/.test(key) || !okRelay) return null;
  return { room, key, relay };
}
