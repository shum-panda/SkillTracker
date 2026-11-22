// Web Push ohne Bibliothek: Verschlüsselung nach RFC 8291 (aes128gcm, RFC 8188) und VAPID nach RFC 8292 (ES256).
// Nur WebCrypto – läuft in Node ≥ 20.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export function b64u(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64u(text) {
  return new Uint8Array(Buffer.from(String(text).replace(/-/g, "+").replace(/_/g, "/"), "base64"));
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hmac(key, data) {
  const k = await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await subtle.sign("HMAC", k, data));
}

// HKDF in einem Schritt (Ausgabe ≤ 32 Byte): Extract(salt, ikm), dann Expand(info) – wie in RFC 8291 beschrieben.
async function hkdf(salt, ikm, info, length) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

const RECORD_SIZE = 4096;

export async function encryptPayload({ p256dh, auth }, plaintext, { salt, localKeyPair } = {}) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("p256dh ist kein P-256-Schlüssel");
  if (authSecret.length !== 16) throw new Error("auth muss 16 Byte lang sein");
  const local = localKeyPair || (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await subtle.exportKey("raw", local.publicKey));
  const uaKey = await subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const s = salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(s, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(s, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  if (plaintext.length + 1 + 16 > RECORD_SIZE) throw new Error("Nachricht zu lang");
  const key = await subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);
  return concat(s, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export async function generateVapidKeys(subject) {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    publicKey: b64u(new Uint8Array(await subtle.exportKey("raw", pair.publicKey))),
    privateJwk: await subtle.exportKey("jwk", pair.privateKey),
    subject,
  };
}

export async function vapidAuthorization({ endpoint, publicKey, privateJwk, subject, now = Date.now() }) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await subtle.importKey("jwk", { ...privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`)));
  return `vapid t=${header}.${payload}.${b64u(sig)}, k=${publicKey}`;
}

export async function sendPush({ subscription, payload, vapid, fetch = globalThis.fetch, ttl = 3600, now = Date.now() }) {
  const body = await encryptPayload(subscription.keys, enc.encode(JSON.stringify(payload)));
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: "normal",
      Authorization: await vapidAuthorization({ endpoint: subscription.endpoint, ...vapid, now }),
    },
    body,
  });
  return { status: res.status };
}
