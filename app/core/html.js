// Escape für alles, was ins HTML eingefügt wird (KI-Antworten, Texte, Importe).
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => MAP[c]);
}

// Nur echte https-Links; alles andere wird zu "#".
export function safeHttpsUrl(url) {
  const s = typeof url === "string" ? url : "";
  return /^https:\/\/[^\s]+$/i.test(s) ? s : "#";
}
