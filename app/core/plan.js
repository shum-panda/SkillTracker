// Lernplan: wie lang die heutige Einheit ist und was hineinkommt. Feste Regeln, keine KI (offline, nachvollziehbar).
// Alle Tage sind Lerntage (Beginn 4 Uhr), Wochentage 0 = Montag.
import { addDays } from "./activity.js";
import { buildQueue, forecast, learningDayKey, learningDayStart, studiedNewToday, DEFAULT_NEW_PER_DAY } from "./srs.js";
import { weaknessProfile } from "./weakness.js";

const CAP = { relaxed: 1, steady: 1, ambitious: 1.3 };
// Zuwachs je aktivem Tag der letzten zwei Wochen. Ehrgeizig wächst schneller, damit die höhere Grenze erreichbar ist.
const STEP = { relaxed: 0.05, steady: 0.05, ambitious: 0.06 };
const START = { card: 12, drill: 120, revise: 180, speak: 120 };
const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const weekday = (now) => (learningDayStart(now).getDay() + 6) % 7;

function activeDays(activity) {
  const set = new Set();
  for (const e of activity || []) if (e?.day) set.add(e.day);
  return set;
}

export function sessionMinutes({ profile, activity = [], now = new Date() }) {
  const target = profile.minutes;
  const cap = CAP[profile.motivation] ?? 1;
  const step = STEP[profile.motivation] ?? 0.05;
  const today = learningDayKey(now);
  const days = activeDays(activity);
  let active14 = 0;
  for (let i = 1; i <= 14; i++) if (days.has(addDays(today, -i))) active14++;
  // Tage seit dem letzten aktiven Tag (heute aktiv → 0). Ab 3 Tagen Pause: wieder kurz einsteigen.
  let gap = null;
  for (let i = 0; i <= 400 && gap === null; i++) if (days.has(addDays(today, -i))) gap = i;
  let ramp = Math.min(cap, 0.5 + step * active14);
  if (gap === null || gap >= 3) ramp = 0.5;
  const lastUnits = (activity || []).filter((e) => e.kind === "unit" && e.unit).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-5);
  const abandoned = lastUnits.filter((e) => e.unit.status === "abandoned").length;
  ramp *= 1 - 0.1 * abandoned;
  return Math.max(3, Math.min(Math.round(target * cap), Math.round(target * ramp)));
}

export function writeDays(writesPerWeek) {
  return { 1: [0], 2: [0, 3], 3: [0, 2, 4], 5: [0, 1, 2, 3, 4] }[writesPerWeek] || [0, 3];
}

const isOwnText = (e) => e && e.revisionOf == null;

export function isWriteDay({ profile, entries = [], now = new Date() }) {
  const k = profile.writesPerWeek;
  const wd = weekday(now);
  const monday = addDays(learningDayKey(now), -wd);
  const thisWeek = entries.filter((e) => isOwnText(e) && e.createdAt && learningDayKey(new Date(e.createdAt)) >= monday).length;
  const scheduled = writeDays(k).filter((d) => d <= wd).length;
  return thisWeek < k && thisWeek < scheduled;
}

function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function estimates({ cardTimes = [], activity = [] }) {
  const card = median(cardTimes.filter(Number.isFinite));
  const of = (kind) => {
    const m = median((activity || []).filter((e) => e.kind === kind && Number.isFinite(e.ms) && e.ms > 0).slice(-20).map((e) => e.ms));
    return m ? Math.round(m / 1000) : START[kind];
  };
  return { card: card === null ? START.card : Math.max(5, Math.min(40, Math.round(card / 1000))), drill: of("drill"), revise: of("revise"), speak: of("speak") };
}

// Kandidaten für die Teile außer Karten
function candidates({ entries, drills, activity, now }) {
  const own = entries.filter((e) => e?.analysis && isOwnText(e)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const weak = weaknessProfile(entries, drills)[0] || null;
  const revise = own.find((e) => (e.analysis.errors || []).length && !(e.revisions || []).length) || null;
  const weekAgo = addDays(learningDayKey(now), -7);
  const spokeRecently = (activity || []).some((e) => e.kind === "speak" && e.day > weekAgo)
    || own.some((e) => (e.speaking || []).some((x) => x.createdAt && learningDayKey(new Date(x.createdAt)) > weekAgo));
  const speak = !spokeRecently ? own[0] || null : null;
  return { weak, revise, speak };
}

export function planToday({ profile, activity = [], cards = [], entries = [], drills = [], cardTimes = [], newPerDay = DEFAULT_NEW_PER_DAY, now = new Date() }) {
  const minutes = sessionMinutes({ profile, activity, now });
  const est = estimates({ cardTimes, activity });
  const today = learningDayKey(now);
  const done = (activity || []).some((e) => e.kind === "unit" && e.day === today && e.unit?.status === "done");
  const q = buildQueue(cards, now, { newPerDay, newToday: studiedNewToday(cards, now) });
  const available = q.due.length + q.fresh.length;
  const { weak, revise, speak } = candidates({ entries, drills, activity, now });
  const others = Boolean(weak || revise || speak);
  const parts = [];
  let left = minutes * 60;
  if (available) {
    const share = others ? 0.6 : 1;
    const count = Math.min(available, Math.max(Math.min(5, available), Math.floor((left * share) / est.card)));
    parts.push({ kind: "cards", seconds: count * est.card, count, link: "#/go/karten" });
    left -= count * est.card;
  }
  if (weak && left >= 90) {
    parts.push({ kind: "drill", seconds: est.drill, category: weak.id, label: weak.label, link: `#/go/uebung/${weak.id}` });
    left -= est.drill;
  }
  if (revise && left >= 150) {
    parts.push({ kind: "revise", seconds: est.revise, entryId: revise.id, link: `#/go/ueberarbeiten/${revise.id}` });
    left -= est.revise;
  }
  if (speak && left >= 90) {
    parts.push({ kind: "speak", seconds: est.speak, entryId: speak.id, link: `#/go/sprechen/${speak.id}` });
    left -= est.speak;
  }
  return { minutes, parts, writeDay: isWriteDay({ profile, entries, now }), done };
}

// Vorschau für einen der nächsten Tage (für Erinnerungstexte): Minuten nach heutigem Stand, fällige Karten aus der Vorschau.
export function planForDay(input, dayOffset) {
  const { profile, activity = [], cards = [], entries = [], newPerDay = DEFAULT_NEW_PER_DAY, now = new Date() } = input;
  const due = forecast(cards, now, dayOffset + 1)[dayOffset] || 0;
  const fresh = Math.min(newPerDay, cards.filter((c) => !c.suspended && c.sched?.state === "new").length);
  const later = new Date(now.getTime() + dayOffset * 86400000);
  return { minutes: sessionMinutes({ profile, activity, now }), cards: due + fresh, writeDay: isWriteDay({ profile, entries, now: later }) };
}

function daysText(list) {
  if (list.length === 5 && list.join() === "0,1,2,3,4") return "Montag bis Freitag";
  const names = list.map((d) => DAY_NAMES[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
}

export function recommendation(profile) {
  const cap = CAP[profile.motivation] ?? 1;
  const startMinutes = Math.max(3, Math.round(profile.minutes * 0.5));
  const maxMinutes = Math.round(profile.minutes * cap);
  const wd = writeDays(profile.writesPerWeek);
  const k = profile.writesPerWeek;
  const text = `Starte mit ${startMinutes} Minuten am Tag und ${k} ${k === 1 ? "Text" : "Texten"} pro Woche (${daysText(wd)}).`
    + (maxMinutes > startMinutes ? ` Wenn du dranbleibst, werden die Einheiten bis ${maxMinutes} Minuten länger.` : "")
    + " Nach ein paar Tagen Pause startest du wieder kurz.";
  return { startMinutes, maxMinutes, writeDays: wd, text };
}
