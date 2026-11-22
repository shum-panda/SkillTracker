// Erinnerungen im Browser: Weg A = Absender auf dem eigenen Server (Web Push, pünktlich),
// Weg B = im Gerät (Periodic Background Sync, nur Chrome/Android als installierte App, ungefähr).
import { esc } from "../core/html.js";
import { planForDay, planToday } from "../core/plan.js";
import { buildReminders } from "../core/reminders.js";
import { planData } from "./views/go.js";

export const DEFAULT_PUSH_URL = "https://push.91-98-206-40.sslip.io";

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function createReminders(ctx) {
  const supported = () => "serviceWorker" in navigator && "Notification" in globalThis;
  const pushUrl = async () => {
    const v = await ctx.store.getSetting("pushUrl");
    return (typeof v === "string" ? v : DEFAULT_PUSH_URL).replace(/\/+$/, "");
  };
  const setState = (st) => ctx.store.setSetting("pushState", { ...st, at: new Date().toISOString() });
  const secret = async () => {
    let s = await ctx.store.getSetting("pushSecret");
    if (!s) {
      s = b64u(crypto.getRandomValues(new Uint8Array(32)));
      await ctx.store.setSetting("pushSecret", s);
    }
    return s;
  };

  async function subscription(base) {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) throw new Error("Dieser Browser kann keine Push-Nachrichten empfangen.");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const res = await fetch(`${base}/v1/key`);
      if (!res.ok) throw new Error(`Absender antwortet nicht (${res.status}).`);
      const { publicKey } = await res.json();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
    }
    return sub.toJSON();
  }

  async function sendA(list) {
    const base = await pushUrl();
    if (!base) throw new Error("Kein Absender eingetragen.");
    const sub = await subscription(base);
    const res = await fetch(`${base}/v1/reminders`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: sub.keys }, secret: await secret(), reminders: list }),
    });
    if (!res.ok) throw new Error(`Absender lehnt ab (${res.status}).`);
  }

  async function wayB() {
    const reg = await navigator.serviceWorker.ready;
    if (!("periodicSync" in reg)) return false;
    try {
      const perm = await navigator.permissions?.query({ name: "periodic-background-sync" });
      if (perm && perm.state !== "granted") return false;
      await reg.periodicSync.register("lernplan", { minInterval: 12 * 3600 * 1000 });
      return true;
    } catch {
      return false;
    }
  }

  async function currentList(extra = []) {
    const data = await planData(ctx);
    const today = planToday(data);
    const upcoming = [1, 2, 3, 4, 5, 6, 7].map((d) => planForDay(data, d));
    return [...buildReminders({ profile: data.profile, today, upcoming, now: data.now }), ...extra].slice(0, 14);
  }

  async function refresh(extra = []) {
    if (ctx.demo || !supported()) return;
    if (Notification.permission !== "granted") {
      await setState({ way: "none", error: Notification.permission === "denied" ? "Benachrichtigungen sind im Browser blockiert." : "" });
      return;
    }
    const list = await currentList(extra);
    await ctx.store.setSetting("reminders", list);
    try {
      await sendA(list);
      await setState({ way: "A", lastSent: new Date().toISOString(), count: list.length });
    } catch (e) {
      const b = await wayB();
      await setState({ way: b ? "B" : "none", error: e.message });
    }
  }

  async function enable() {
    if (ctx.demo || !supported()) return false;
    const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    await refresh();
    return perm === "granted";
  }

  async function disable() {
    try {
      const base = await pushUrl();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager?.getSubscription();
      if (sub && base) {
        await fetch(`${base}/v1/reminders`, { method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, secret: await secret() }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      await reg.periodicSync?.unregister("lernplan").catch(() => {});
    } catch { /* egal */ }
    await ctx.store.setSetting("reminders", []);
    await setState({ way: "none", error: "" });
  }

  async function test() {
    const at = new Date(Date.now() + 60_000).toISOString();
    const t = { at, title: "Test-Erinnerung", body: "So sieht eine Erinnerung aus. Antippen öffnet die heutige Einheit.", url: "#/go/heute" };
    await refresh([t]);
    const st = await ctx.store.getSetting("pushState");
    if (st?.way !== "A") {
      // ohne Absender: solange die App offen ist, zeigt der Service Worker die Test-Erinnerung selbst
      setTimeout(async () => {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(t.title, { body: t.body, tag: "lernplan-test", data: { url: t.url }, icon: "icons/icon-192.png" });
      }, 60_000);
    }
    return st?.way || "none";
  }

  async function renderStatus(el) {
    if (!el) return;
    if (ctx.demo) { el.innerHTML = '<p class="small muted">In der Demo gibt es keine Erinnerungen.</p>'; return; }
    if (!supported()) { el.innerHTML = '<p class="note small">Dieser Browser kann keine Benachrichtigungen zeigen.</p>'; return; }
    const st = (await ctx.store.getSetting("pushState")) || { way: "none" };
    const url = await pushUrl();
    const perm = Notification.permission;
    const line = perm === "denied" ? "Benachrichtigungen sind im Browser blockiert – in den Website-Einstellungen erlauben."
      : perm !== "granted" ? "Benachrichtigungen sind noch nicht erlaubt."
      : st.way === "A" ? `Aktiv über deinen Absender (pünktlich). Zuletzt übermittelt: ${new Date(st.lastSent).toLocaleString("de-DE")}.`
      : st.way === "B" ? "Aktiv im Gerät – der Browser bestimmt den Zeitpunkt, also ungefähr, nicht pünktlich."
      : `Nicht aktiv${st.error ? `: ${st.error}` : ""}. Ohne Absender gehen Erinnerungen nur in Chrome auf Android als installierte App.`;
    el.innerHTML = `<p class="small ${st.way === "none" ? "note" : "muted"}">${esc(line)}</p>
      <div class="row">${perm !== "granted" ? '<button class="btn small primary violet" id="rem-enable">Benachrichtigungen erlauben</button>' : ""}
        <button class="btn small" id="rem-test" ${perm === "granted" ? "" : "disabled"}>Test-Erinnerung in 1 Minute</button>
        <button class="btn small" id="rem-off">Erinnerungen ausschalten</button></div>
      <details class="small"><summary>Absender</summary>
        <div class="field"><label for="push-url">Adresse des Absenders (leer = nur im Gerät)</label>
          <input type="url" id="push-url" value="${esc(url)}" placeholder="${esc(DEFAULT_PUSH_URL)}"></div>
        <p class="muted">Der Absender speichert nur die Push-Adresse dieses Geräts, dessen Schlüssel, einen Hash deines Geräte-Geheimnisses
        und die kurzen Erinnerungszeilen (z. B. „ca. 6 Min · 14 Karten“) – keine Texte, keine Karten.</p></details>`;
    const again = () => renderStatus(el);
    el.querySelector("#rem-enable")?.addEventListener("click", async () => { await enable(); again(); });
    el.querySelector("#rem-test").onclick = async () => { const way = await test(); ctx.toast(way === "none" ? "Test läuft – bitte die App offen lassen." : "Test-Erinnerung kommt in etwa einer Minute."); again(); };
    el.querySelector("#rem-off").onclick = async () => { await disable(); ctx.toast("Erinnerungen sind aus."); again(); };
    el.querySelector("#push-url").onchange = async (ev) => {
      const v = ev.target.value.trim().replace(/\/+$/, "");
      if (v && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(v) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) { ctx.toast("Bitte eine https-Adresse eintragen."); return; }
      await ctx.store.setSetting("pushUrl", v);
      await refresh();
      again();
    };
  }

  return { enable, disable, refresh, test, renderStatus, status: () => ctx.store.getSetting("pushState") };
}
