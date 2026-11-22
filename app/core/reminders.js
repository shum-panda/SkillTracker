// Erinnerungen für die nächsten 7 Tage aus Lernprofil und Plan – in Ortszeit, damit 19:00 auch nach der Zeitumstellung 19:00 ist.
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
  for (let offset = 0; offset <= 7; offset++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hh, mm);
    const weekday = (at.getDay() + 6) % 7;
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
