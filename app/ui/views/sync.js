// Geräte verbinden: QR-Code anzeigen (Gerät A) oder über den Link beitreten (Gerät B), dann beidseitig abgleichen.
import { buildSnapshot, mergeSnapshot } from "../../core/sync.js";
import { newKey, randomId } from "../../core/seal.js";
import { parseSyncHash, qrSvg, syncLink } from "../../core/qr.js";
import { confirmDialog, esc, spinner } from "../dom.js";
import { exchange, host, join } from "../peer.js";

const STATUS = {
  waiting: "Warte auf das andere Gerät … Scanne den Code mit der Kamera-App deines Handys.",
  fetching: "Verbindungsdaten werden abgeholt …",
  connecting: "Verbinde direkt im WLAN …",
};

function resultHtml(mine, theirs) {
  const line = (s) => `${s.entriesAdded || 0} Texte neu, ${s.entriesUpdated || 0} ergänzt, ${s.cardsAdded || 0} Karten neu, ${s.cardsUpdated || 0} Karten aktualisiert${s.removed ? `, ${s.removed} gelöscht` : ""}`;
  return `<div class="ok-box"><b>Abgeglichen</b><p>Dieses Gerät: ${esc(line(mine))}.</p><p class="small">Anderes Gerät: ${esc(line(theirs))}.</p></div>`;
}

export async function render(root, ctx) {
  const store = ctx.store;
  if (ctx.demo) {
    root.innerHTML = '<div class="card"><h2>In der Demo nicht verfügbar</h2><p>Verlasse die Demo, um deine Geräte zu verbinden.</p></div>';
    return;
  }
  const params = parseSyncHash(location.hash);
  const ownRelay = (await store.getSetting("relayUrl")) || "";
  const relay = params?.relay || ownRelay;
  const relayHost = (() => { try { return new URL(relay).host; } catch { return ""; } })();
  const foreignRelay = params && ownRelay && params.relay.replace(/\/+$/, "") !== ownRelay.replace(/\/+$/, "");
  const controller = new AbortController();
  window.addEventListener("hashchange", () => controller.abort(), { once: true });
  let pc = null;
  const cleanup = () => { try { pc?.close(); } catch { /* egal */ } };
  controller.signal.addEventListener("abort", cleanup);

  root.innerHTML = `
    <div class="head"><a href="#/settings" class="small">← Einstellungen</a><p class="kicker">Geräte verbinden</p>
      <h1>${params ? "Mit dem anderen Gerät abgleichen" : "Handy und PC abgleichen"}</h1>
      <p>Die Daten gehen direkt im WLAN von Gerät zu Gerät. Der Vermittler reicht nur verschlüsselte Verbindungsdaten weiter.
      Beide Geräte behalten alles und bekommen dazu, was ihnen fehlt.</p></div>
    ${!relay ? `<div class="note">Es ist noch kein Vermittler eingetragen. Trag in den <a href="#/settings">Einstellungen</a> die Adresse deines
      Vermittlers ein (läuft auf deinem Server, siehe Anleitung). Bis dahin: Export/Import als Datei.</div>` : ""}
    <section class="card stack" id="box">
      ${params ? `<p class="small">Vermittler: <span class="mono">${esc(relayHost)}</span>${foreignRelay
        ? " – <b>nicht dein eingetragener Vermittler.</b> Nur fortfahren, wenn der Code von deinem eigenen Gerät stammt." : ""}</p>` : ""}
      <label class="check"><input type="checkbox" id="keys"> KI-Zugänge (mit Schlüsseln) austauschen</label>
      <p class="small muted">Nur ankreuzen, wenn beide Geräte dir gehören. Fremde KI-Zugänge werden nur übernommen, wenn auch hier angekreuzt ist.</p>
      <div class="row"><button class="btn primary" id="go" ${relay ? "" : "disabled"}>${params ? "Verbinden und abgleichen" : "QR-Code anzeigen"}</button></div>
    </section>
    <div id="out" aria-live="polite"></div>`;

  const out = root.querySelector("#out");
  const status = (s) => { out.innerHTML = `<div class="row muted">${spinner}<span>${esc(STATUS[s] || s)}</span></div>`; };
  const fail = (e) => {
    if (e?.name === "AbortError") return;
    cleanup();
    out.innerHTML = `<p class="note">${esc(e?.message || e)}</p>`;
    root.querySelector("#go").disabled = false;
  };

  root.querySelector("#go").onclick = async () => {
    root.querySelector("#go").disabled = true;
    const includeProviders = root.querySelector("#keys").checked;
    try {
      let link;
      let conn;
      if (params) {
        conn = await join({ ...params, signal: controller.signal, onStatus: status });
      } else {
        const room = randomId(16);
        const key = newKey();
        link = syncLink(location.href, { room, key, relay });
        const pending = host({ relay, room, key, signal: controller.signal, onStatus: (s) => {
          if (s !== "waiting") return status(s);
          root.querySelector("#box").innerHTML = `<div class="qr-wrap">${qrSvg(link, { title: "QR-Code zum Verbinden" })}</div>
            <p class="small muted">Gilt 3 Minuten und nur einmal. Kein Handy zur Hand? Link am anderen Gerät öffnen:</p>
            <div class="row"><input type="text" id="link" readonly value="${esc(link)}"><button class="btn small" id="copy">Kopieren</button></div>`;
          root.querySelector("#copy").onclick = () => navigator.clipboard?.writeText(link).then(() => ctx.toast("Link kopiert."));
          status("waiting");
        } });
        conn = await pending;
      }
      pc = conn.pc;
      const snapshot = buildSnapshot(store, { includeProviders }).then((s) => JSON.stringify(s));
      const confirmDeletions = ({ entries, cards }) => confirmDialog("Löschungen übernehmen?",
        `Auf dem anderen Gerät wurden ${entries} Text(e) und ${cards} Karte(n) gelöscht, die es hier noch gibt. Sollen sie auch hier ` +
        "gelöscht werden? „Abbrechen“ behält sie – alles andere wird trotzdem abgeglichen.", { ok: "Auch hier löschen", danger: true });
      const res = await exchange(conn.dc, snapshot,
        (snap) => mergeSnapshot(store, snap, { confirmDeletions, acceptProviders: includeProviders }), {
        onProgress: (dir, i, n) => { out.innerHTML = `<div class="row muted">${spinner}<span>${dir === "send" ? "Sende" : "Empfange"} … ${n > 0 ? Math.round((i / n) * 100) : 0} %</span></div>`; },
      });
      ctx.cardsSync = null;
      cleanup();
      root.querySelector("#box").classList.add("hidden");
      out.innerHTML = resultHtml(res.mine, res.theirs) + '<div class="row"><a class="btn primary" href="#/">Zur Übersicht</a></div>';
    } catch (e) {
      fail(e);
    }
  };
}
