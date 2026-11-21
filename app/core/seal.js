// AES-GCM für die Verbindungsdaten beim Geräte-Abgleich. Der Schlüssel steht nur im QR-Code, der Vermittler sieht nichts.

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export function randomId(bytes = 16) {
  return b64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

export const newKey = () => randomId(32);

const importKey = (k) => crypto.subtle.importKey("raw", fromB64u(k), "AES-GCM", false, ["encrypt", "decrypt"]);

function toB64u(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function seal(keyB64, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(keyB64), data);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return toB64u(out);
}

export async function unseal(keyB64, box) {
  const bytes = fromB64u(String(box));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await importKey(keyB64), bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
