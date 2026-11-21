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

// Gerät A: Angebot ablegen, auf Antwort warten.
export async function host({ relay, room, key, signal, onStatus = () => {} }) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const dc = pc.createDataChannel("skilltracker", { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  await relayPut(relay, room, "offer", await seal(key, { sdp: pc.localDescription.toJSON() }), { signal });
  onStatus("waiting");
  const answer = await relayWait(relay, room, "answer", { signal });
  if (!answer) throw new Error("Kein Gerät hat sich innerhalb von 3 Minuten verbunden.");
  const { sdp } = await unseal(key, answer);
  onStatus("connecting");
  await pc.setRemoteDescription(sdp);
  return { pc, dc: await opened(dc, signal) };
}

// Gerät B: Angebot abholen, Antwort ablegen.
export async function join({ relay, room, key, signal, onStatus = () => {} }) {
  onStatus("fetching");
  const offer = await relayWait(relay, room, "offer", { signal, totalMs: 30000 });
  if (!offer) throw new Error("Der Code ist abgelaufen oder wurde schon benutzt – bitte am anderen Gerät einen neuen anzeigen.");
  const { sdp } = await unseal(key, offer);
  const pc = new RTCPeerConnection({ iceServers: [] });
  const channel = new Promise((resolve) => pc.addEventListener("datachannel", (ev) => resolve(ev.channel), { once: true }));
  await pc.setRemoteDescription(sdp);
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  await relayPut(relay, room, "answer", await seal(key, { sdp: pc.localDescription.toJSON() }), { signal });
  onStatus("connecting");
  const dc = await Promise.race([channel, new Promise((_, rej) => setTimeout(() => rej(new Error("Die Geräte haben sich nicht direkt erreicht. Sind beide im selben WLAN?")), OPEN_WAIT))]);
  return { pc, dc: await opened(dc, signal) };
}

// Beide Seiten: eigenen Stand schicken, fremden empfangen, zusammenführen, Ergebnis austauschen.
// snapshot: Text oder Promise darauf – die Empfänger werden sofort angemeldet, damit keine Nachricht verloren geht.
export function exchange(dc, snapshot, mergeFn, { onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let expected = -1;
    let myStats = null;
    let theirStats = null;
    const finish = () => { if (myStats && theirStats) resolve({ mine: myStats, theirs: theirStats }); };
    dc.addEventListener("close", () => { if (!(myStats && theirStats)) reject(new Error("Die Verbindung wurde getrennt.")); });
    dc.addEventListener("message", async (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === "meta" && Number.isInteger(msg.n) && msg.n >= 0 && msg.n < 20000) expected = msg.n;
      else if (msg.t === "c" && Number.isInteger(msg.i) && typeof msg.d === "string") {
        parts[msg.i] = msg.d;
        onProgress("receive", parts.filter((x) => x !== undefined).length, expected);
      } else if (msg.t === "end") {
        try {
          if (expected < 0 || parts.length !== expected || parts.some((x) => x === undefined)) throw new Error("Unvollständig übertragen.");
          myStats = await mergeFn(JSON.parse(parts.join("")));
          dc.send(JSON.stringify({ t: "merged", stats: myStats }));
          finish();
        } catch (e) {
          reject(e);
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
