// Erinnerungen für die nächsten 7 Tage aus Lernprofil und Plan – in Ortszeit, damit 19:00 auch nach der Zeitumstellung 19:00 ist.
// Gezählt wird in Lerntagen (Beginn 4 Uhr) wie im Lernplan: Um 0:30 ist noch "gestern", eine Erinnerung um 1:30 gehört zum
// laufenden Lerntag.
import { learningDayStart } from "./srs.js";

const MAX_AHEAD_MS = 8 * 86400000 - 3600000; // der Absender nimmt höchstens 8 Tage im Voraus an
const MAX_BODY = 140;

function body({ minutes, cards, label, writeDay }) {
  const parts = [`ca. ${minutes} Min`];
  if (cards) parts.push(`${cards} ${cards === 1 ? "Karte" : "Karten"}`);
  if (label) parts.push(label);
  if (writeDay) parts.push("heute Schreibtag");
  const text = parts.join(" · ");
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text;
}

/**
 * @param {object} o
 * @param {object} o.profile   Lernprofil (reminder: { enabled, time, days })
 * @param {object} o.today     planToday(...)
 * @param {object[]} o.upcoming planForDay(..., 1..7)
 * @param {Date} o.now
 * @returns {{at:string,title:string,body:string,url:string}[]}
 */
export function buildReminders({ profile, today, upcoming = [], now = new Date() }) {
  const r = profile?.reminder;
  if (!r?.enabled) return [];
  const [hh, mm] = r.time.split(":").map(Number);
  const out = [];
  const start = learningDayStart(now);
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (hh < 4 ? 1 : 0), hh, mm);
    if (at - now > MAX_AHEAD_MS) continue;
    const weekday = (day.getDay() + 6) % 7;
    if (!r.days.includes(weekday)) continue;
    let info;
    if (offset === 0) {
      if (at <= now || today?.done) continue;
      const parts = today?.parts || [];
      info = { minutes: today.minutes, cards: parts.find((p) => p.kind === "cards")?.count || 0,
        label: parts.find((p) => p.kind === "drill")?.label || "", writeDay: today.writeDay };
    } else {
      const d = upcoming[offset - 1];
      if (!d) continue;
      info = { minutes: d.minutes, cards: d.cards, label: "", writeDay: d.writeDay };
    }
    out.push({ at: at.toISOString(), title: "Zeit zum Lernen", body: body(info), url: "#/go/heute" });
  }
  return out;
}
