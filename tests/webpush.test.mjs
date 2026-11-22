import { test } from "node:test";
import assert from "node:assert/strict";
import { b64u, unb64u, encryptPayload, vapidAuthorization, sendPush, generateVapidKeys } from "../server/webpush.mjs";

const subtle = globalThis.crypto.subtle;
// RFC 8291, Abschnitt 5 und Anhang A
const V = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function rfcKeyPair() {
  const pub = unb64u(V.asPublic);
  const jwk = { kty: "EC", crv: "P-256", d: V.asPrivate, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const privateKey = await subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await subtle.importKey("raw", pub, { name: "ECDH", namedCurve: "P-256" }, true, []);
  return { privateKey, publicKey };
}

test("RFC 8291 Anhang A: aes128gcm ergibt genau den Beispiel-Body", async () => {
  const body = await encryptPayload({ p256dh: V.uaPublic, auth: V.auth }, new TextEncoder().encode(V.plaintext),
    { salt: unb64u(V.salt), localKeyPair: await rfcKeyPair() });
  assert.equal(b64u(body), V.body);
});

test("b64u hin und zurück", () => {
  const bytes = new Uint8Array([0, 251, 255, 62, 63, 1]);
  assert.deepEqual(unb64u(b64u(bytes)), bytes);
  assert.doesNotMatch(b64u(bytes), /[+/=]/);
});

test("VAPID: Signatur mit dem öffentlichen Schlüssel prüfbar", async () => {
  const vapid = await generateVapidKeys("https://shum-panda.github.io/SkillTracker/");
  assert.equal(unb64u(vapid.publicKey).length, 65);
  const now = Date.UTC(2026, 10, 22, 12);
  const auth = await vapidAuthorization({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", publicKey: vapid.publicKey,
    privateJwk: vapid.privateJwk, subject: vapid.subject, now });
  const m = auth.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, auth);
  assert.equal(m[2], vapid.publicKey);
  const [h, p, sig] = m[1].split(".");
  const header = JSON.parse(new TextDecoder().decode(unb64u(h)));
  const payload = JSON.parse(new TextDecoder().decode(unb64u(p)));
  assert.deepEqual(header, { typ: "JWT", alg: "ES256" });
  assert.equal(payload.aud, "https://fcm.googleapis.com");
  assert.equal(payload.exp, now / 1000 + 12 * 3600);
  assert.match(payload.sub, /^https:\/\//);
  const key = await subtle.importKey("raw", unb64u(vapid.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(unb64u(sig).length, 64);
  assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, unb64u(sig), new TextEncoder().encode(`${h}.${p}`)));
});

test("sendPush: Header und verschlüsselter Body", async () => {
  const vapid = await generateVapidKeys("https://shum-panda.github.io/SkillTracker/");
  const ua = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = b64u(new Uint8Array(await subtle.exportKey("raw", ua.publicKey)));
  const auth = b64u(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  let seen;
  const fetch = async (url, init) => { seen = { url, init }; return { status: 201 }; };
  const payload = { title: "Zeit zum Lernen", body: "ca. 6 Min", url: "#/go/heute" };
  const r = await sendPush({ subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh, auth } }, payload, vapid, fetch });
  assert.equal(r.status, 201);
  assert.equal(seen.url, "https://fcm.googleapis.com/fcm/send/x");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Encoding"], "aes128gcm");
  assert.equal(seen.init.headers.TTL, "3600");
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
  assert.ok(seen.init.body.length >= 86 + JSON.stringify(payload).length + 1 + 16);
});
