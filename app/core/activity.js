// Aktivitäts-Tagebuch: was an welchem Lerntag passiert ist (für Heatmap, Serie und die Länge der Lerneinheiten).
// Ereignis: { uid, at (ISO), day ("YYYY-MM-DD", Lerntag ab 4 Uhr), kind, count?, ms?, unit?, backfill? }
import { learningDayKey } from "./srs.js";

export const KINDS = ["write", "cards", "drill", "revise", "speak", "unit"];
export const CARD_SECONDS = 12;        // Karten ohne gemessene Dauer
const MAX_EVENTS = 5000;
const MAX_AGE_MS = 2 * 365 * 86400000;
const MAX_CARD_TIMES = 200;

const randomUid = () => globalThis.crypto.randomUUID();

async function sha256hex(text) {
  const d = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeEvent({ kind, count, ms, unit, at = new Date() }, uid) {
  if (!KINDS.includes(kind)) throw new Error(`Unbekannte Aktivität: ${kind}`);
  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) throw new Error("Ungültiger Zeitpunkt");
  const ev = { uid, at: when.toISOString(), day: learningDayKey(when), kind };
  if (Number.isFinite(count)) ev.count = Math.max(0, Math.round(count));
  if (Number.isFinite(ms)) ev.ms = Math.max(0, Math.round(ms));
  if (unit) ev.unit = { planned: Math.max(0, Math.round(unit.planned || 0)), status: unit.status };
  return ev;
}

export async function recordActivity(store, fields) {
  const ev = makeEvent(fields, randomUid());
  await store.addActivity(ev);
  return ev;
}

// Antwortzeiten der letzten Karten (ms) – Grundlage für die geschätzte Zeit pro Karte.
export async function recordCardTimes(store, msList) {
  const list = [...((await store.getSetting("cardTimes")) || []), ...msList.filter((x) => Number.isFinite(x) && x >= 0)];
  await store.setSetting("cardTimes", list.slice(-MAX_CARD_TIMES));
}

// Einmalig: schon Vorhandenes (Texte, Überarbeitungen, Aussprache, Übungen, erstes Lernen einer Karte) nachtragen.
// Die uid hängt nur von den Daten ab, damit zwei Geräte für denselben Text dasselbe Ereignis erzeugen.
export async function backfillActivity(store) {
  if (await store.getSetting("activityBackfilled")) return 0;
  const items = [];
  for (const e of await store.listEntries()) {
    if (e.createdAt) items.push({ kind: "write", at: e.createdAt, src: e.createdAt });
    for (const r of e.revisions || []) if (r.createdAt) items.push({ kind: "revise", at: r.createdAt, src: `${e.createdAt}|${r.mode}` });
    for (const x of e.speaking || []) if (x.createdAt) items.push({ kind: "speak", at: x.createdAt, src: `${e.createdAt}|${x.method}` });
  }
  for (const d of (await store.getSetting("drills")) || []) if (d.createdAt) items.push({ kind: "drill", at: d.createdAt, src: d.category, count: d.total });
  for (const c of await store.listCards()) {
    if (c.sched?.firstStudied) items.push({ kind: "cards", at: c.sched.firstStudied, src: c.key, count: 1 });
  }
  let n = 0;
  for (const it of items) {
    let ev;
    try {
      ev = makeEvent(it, "bf-" + (await sha256hex(`${it.kind}|${it.src}|${it.at}`)).slice(0, 32));
    } catch {
      continue;
    }
    ev.backfill = true;
    await store.addActivity(ev);
    n++;
  }
  await store.setSetting("activityBackfilled", true);
  return n;
}

export async function pruneActivity(store, now = new Date()) {
  const all = await store.listActivity();
  const cutoff = now.getTime() - MAX_AGE_MS;
  const old = all.filter((e) => new Date(e.at).getTime() < cutoff);
  const keep = all.filter((e) => new Date(e.at).getTime() >= cutoff);
  const extra = keep.length > MAX_EVENTS ? keep.slice(0, keep.length - MAX_EVENTS) : [];
  const drop = [...old, ...extra].map((e) => e.uid);
  if (drop.length) await store.deleteActivity(drop);
  return drop.length;
}

// Pro Lerntag: Zähler, Lernminuten und Stärke (Minuten + 5 je Text + 2 je Übung, Überarbeitung, Aussprache).
export function dayStats(events) {
  const out = new Map();
  for (const e of events || []) {
    if (!e?.day) continue;
    let d = out.get(e.day);
    if (!d) out.set(e.day, (d = { write: 0, cards: 0, drill: 0, revise: 0, speak: 0, units: 0, ms: 0 }));
    if (e.kind === "unit") {
      d.units++;
      continue;
    }
    if (e.kind === "cards") {
      d.cards += e.count || 0;
      d.ms += Number.isFinite(e.ms) ? e.ms : (e.count || 0) * CARD_SECONDS * 1000;
    } else if (d[e.kind] !== undefined) {
      d[e.kind]++;
      if (Number.isFinite(e.ms)) d.ms += e.ms;
    }
  }
  for (const d of out.values()) {
    d.minutes = Math.round(d.ms / 60000);
    d.score = d.minutes + 5 * d.write + 2 * (d.drill + d.revise + d.speak);
    delete d.ms;
  }
  return out;
}

export function levelOf(score) {
  if (!(score > 0)) return 0;
  if (score < 5) return 1;
  if (score < 10) return 2;
  if (score < 20) return 3;
  return 4;
}

// Tage als "YYYY-MM-DD" verschieben (rechnet in UTC, damit Zeitumstellungen keine Rolle spielen).
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const active = (stats, day) => (stats.get(day)?.score || 0) > 0 || (stats.get(day)?.units || 0) > 0;

export function streaks(stats, today) {
  let current = 0;
  let day = active(stats, today) ? today : addDays(today, -1);
  while (active(stats, day)) {
    current++;
    day = addDays(day, -1);
  }
  let longest = 0;
  for (const d of [...stats.keys()].sort()) {
    if (!active(stats, d) || active(stats, addDays(d, -1))) continue;
    let n = 0;
    let x = d;
    while (active(stats, x)) {
      n++;
      x = addDays(x, 1);
    }
    longest = Math.max(longest, n);
  }
  return { current, longest: Math.max(longest, current) };
}
