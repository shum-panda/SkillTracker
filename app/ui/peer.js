// Direkte Verbindung zweier Geräte (WebRTC-DataChannel). Verbindungsdaten laufen verschlüsselt über den Vermittler.
import { relayPut, relayWait } from "../core/relay-client.js";
import { seal, unseal } from "../core/seal.js";

const CHUNK = 16 * 1024;
const ICE_WAIT = 4000;
const OPEN_WAIT = 25000;

function gathered(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ICE_WAIT); // ohne Trickle: nach kurzer Zeit mit dem arbeiten, was da ist
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
    });
  });
}

function opened(dc, signal) {
  if (dc.readyState === "open") return Promise.resolve(dc);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Die Geräte haben sich nicht direkt erreicht. Sind beide im selben WLAN? In Gäste- oder Uni-Netzen klappt das oft nicht – dann Export/Import nutzen.")), OPEN_WAIT);
    dc.addEventListener("open", () => { clearTimeout(t); resolve(dc); }, { once: true });
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("aborted", "AbortError")); });
  });
}

const unreadable = () => new Error("Die Verbindungsdaten passen nicht zum Code – bitte am anderen Gerät einen neuen anzeigen.");

// Bei Fehler oder Abbruch die Verbindung immer schließen.
async function guarded(pc, signal, fn) {
  const close = () => { try { pc.close(); } catch { /* egal */ } };
  signal?.addEventListener("abort", close, { once: true });
  try {
    return await fn();
  } catch (e) {
    close();
    throw e;
  }
}

// Gerät A: Angebot ablegen, auf Antwort warten.
export function host({ relay, room, key, signal, onStatus = () => {} }) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  return guarded(pc, signal, async () => {
    const dc = pc.createDataChannel("skilltracker", { ordered: true });
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    await relayPut(relay, room, "offer", await seal(key, { sdp: pc.localDescription.toJSON() }), { signal });
    onStatus("waiting");
    const answer = await relayWait(relay, room, "answer", { signal });
    if (!answer) throw new Error("Kein Gerät hat sich innerhalb von 3 Minuten verbunden.");
    const { sdp } = await unseal(key, answer).catch(() => { throw unreadable(); });
    onStatus("connecting");
    await pc.setRemoteDescription(sdp);
    return { pc, dc: await opened(dc, signal) };
  });
}

// Gerät B: Angebot abholen, Antwort ablegen.
export async function join({ relay, room, key, signal, onStatus = () => {} }) {
  onStatus("fetching");
  const offer = await relayWait(relay, room, "offer", { signal, totalMs: 30000 });
  if (!offer) throw new Error("Der Code ist abgelaufen oder wurde schon benutzt – bitte am anderen Gerät einen neuen anzeigen.");
  const { sdp } = await unseal(key, offer).catch(() => { throw unreadable(); });
  const pc = new RTCPeerConnection({ iceServers: [] });
  return guarded(pc, signal, async () => {
    const channel = new Promise((resolve) => pc.addEventListener("datachannel", (ev) => resolve(ev.channel), { once: true }));
    await pc.setRemoteDescription(sdp);
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    await relayPut(relay, room, "answer", await seal(key, { sdp: pc.localDescription.toJSON() }), { signal });
    onStatus("connecting");
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("Die Geräte haben sich nicht direkt erreicht. Sind beide im selben WLAN?")), OPEN_WAIT); });
    try {
      const dc = await Promise.race([channel, timeout]);
      return { pc, dc: await opened(dc, signal) };
    } finally {
      clearTimeout(timer);
    }
  });
}

const MAX_CHUNKS = 4000;          // × 16 KB ≈ 64 MB
const MAX_CHARS = 64 * 1024 * 1024;
const IDLE_MS = 60000;

// Beide Seiten: eigenen Stand schicken, fremden empfangen, zusammenführen, Ergebnis austauschen.
// snapshot: Text oder Promise darauf – die Empfänger werden sofort angemeldet, damit keine Nachricht verloren geht.
export function exchange(dc, snapshot, mergeFn, { onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let parts = null;
    let received = 0;
    let chars = 0;
    let expected = -1;
    let merging = false;
    let myStats = null;
    let theirStats = null;
    let settled = false;
    let idle;
    const stop = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      fn(value);
    };
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => { stop(reject, new Error("Das andere Gerät antwortet nicht mehr.")); try { dc.close(); } catch { /* egal */ } }, IDLE_MS);
    };
    bump();
    const finish = () => { if (myStats && theirStats) stop(resolve, { mine: myStats, theirs: theirStats }); };
    const bad = (why) => { stop(reject, new Error(why)); try { dc.close(); } catch { /* egal */ } };
    dc.addEventListener("close", () => stop(reject, new Error("Die Verbindung wurde getrennt.")));
    dc.addEventListener("message", async (ev) => {
      if (settled || typeof ev.data !== "string" || ev.data.length > 64 * 1024) return;
      bump();
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if ((merging || myStats) && msg.t !== "merged") return; // nach dem Empfang nur noch die Rückmeldung
      if (msg.t === "meta") {
        if (expected >= 0 || !Number.isInteger(msg.n) || msg.n < 0 || msg.n > MAX_CHUNKS) return bad("Ungültige Daten vom anderen Gerät.");
        expected = msg.n;
        parts = new Array(expected);
      } else if (msg.t === "c") {
        if (!parts || !Number.isInteger(msg.i) || msg.i < 0 || msg.i >= expected || typeof msg.d !== "string" || parts[msg.i] !== undefined) return;
        chars += msg.d.length;
        if (chars > MAX_CHARS) return bad("Zu viele Daten vom anderen Gerät.");
        parts[msg.i] = msg.d;
        received++;
        onProgress("receive", received, expected);
      } else if (msg.t === "end") {
        if (!parts || received !== expected) return bad("Unvollständig übertragen.");
        merging = true;
        clearTimeout(idle); // die Rückfrage zu Löschungen darf dauern
        try {
          myStats = await mergeFn(JSON.parse(parts.join("")));
          parts = null;
          dc.send(JSON.stringify({ t: "merged", stats: myStats }));
          merging = false;
          bump();
          finish();
        } catch (e) {
          stop(reject, e);
        }
      } else if (msg.t === "merged") {
        theirStats = msg.stats || {};
        finish();
      }
    });
    (async () => {
      const snapshotText = await snapshot;
      const n = Math.ceil(snapshotText.length / CHUNK);
      dc.bufferedAmountLowThreshold = 256 * 1024;
      dc.send(JSON.stringify({ t: "meta", n }));
      for (let i = 0; i < n; i++) {
        if (dc.bufferedAmount > 1024 * 1024) await new Promise((r) => dc.addEventListener("bufferedamountlow", r, { once: true }));
        dc.send(JSON.stringify({ t: "c", i, d: snapshotText.slice(i * CHUNK, (i + 1) * CHUNK) }));
        onProgress("send", i + 1, n);
      }
      dc.send(JSON.stringify({ t: "end" }));
    })().catch(reject);
  });
}
