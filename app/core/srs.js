// Lernplan: vereinfachtes SM-2 (wie Anki). Bewertung: again | hard | good | easy.

const MIN = 60000;
const DAY = 86400000;
export const DEFAULT_NEW_PER_DAY = 10;
const LEARN_AHEAD = 20 * MIN;

export function newSched() {
  return { state: "new", step: 0, due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0, firstStudied: null };
}

const at = (now, ms) => new Date(now.getTime() + ms).toISOString();
const round2 = (x) => Math.round(x * 100) / 100;

export function schedule(s, grade, now = new Date()) {
  const n = { ...newSched(), ...s, reps: (s.reps || 0) + 1, firstStudied: s.firstStudied || now.toISOString() };
  if (n.state === "new" || n.state === "learning") {
    if (grade === "again") return { ...n, state: "learning", step: 0, due: at(now, MIN) };
    if (grade === "hard") return { ...n, state: "learning", due: at(now, 6 * MIN) };
    if (grade === "good" && n.step === 0) return { ...n, state: "learning", step: 1, due: at(now, 10 * MIN) };
    const interval = grade === "easy" ? Math.max(4, n.interval) : Math.max(1, n.interval);
    return { ...n, state: "review", step: 0, interval, due: at(now, interval * DAY) };
  }
  // Wiederholung
  if (grade === "again") {
    const interval = Math.max(1, Math.round(n.interval * 0.5));
    return { ...n, state: "learning", step: 1, interval, lapses: n.lapses + 1, ease: Math.max(1.3, round2(n.ease - 0.2)), due: at(now, 10 * MIN) };
  }
  let interval;
  let ease = n.ease;
  if (grade === "hard") {
    interval = Math.round(n.interval * 1.2);
    ease = Math.max(1.3, round2(n.ease - 0.15));
  } else if (grade === "easy") {
    const good = Math.max(n.interval + 1, Math.round(n.interval * n.ease));
    interval = Math.max(good + 1, Math.round(n.interval * n.ease * 1.3));
    ease = Math.min(MAX_EASE, round2(n.ease + 0.15));
  } else {
    interval = Math.round(n.interval * n.ease);
  }
  interval = Math.min(MAX_INTERVAL, Math.max(n.interval + 1, interval));
  return { ...n, interval, ease, due: at(now, interval * DAY) };
}

const MAX_EASE = 5;
const MAX_INTERVAL = 36500;
const active = (c) => !c.suspended && c.sched;
const time = (iso) => new Date(iso).getTime();

// Ein Lerntag beginnt um 4 Uhr (wie bei Anki): Wer nach Mitternacht lernt, ist noch im alten Tag.
const DAY_STARTS_AT = 4;
function learningDayStart(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_STARTS_AT);
  if (d.getTime() < s.getTime()) s.setDate(s.getDate() - 1);
  return s;
}
const nextDayStart = (s) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, DAY_STARTS_AT).getTime();

// In wie vielen Lerntagen eine Karte dran ist (0 = heute, auch überfällig).
export function dueDayIndex(due, now) {
  let start = learningDayStart(now);
  const t = time(due);
  let i = 0;
  while (t >= nextDayStart(start) && i < 400) {
    start = new Date(nextDayStart(start));
    i++;
  }
  return i;
}

// Was heute in die Sitzung kommt: fällige (lernende zuerst), neue bis zum Tageslimit, lernende bald fällige (vorziehbar).
// Wiederholungen sind fällig, sobald ihr Lerntag begonnen hat; lernende Karten erst zur genauen Zeit.
export function buildQueue(cards, now, { newPerDay = DEFAULT_NEW_PER_DAY, newToday = 0 } = {}) {
  const t = now.getTime();
  const endOfDay = nextDayStart(learningDayStart(now));
  const list = cards.filter(active);
  const isDue = (c) => c.sched.due && (c.sched.state === "review" ? time(c.sched.due) < endOfDay : time(c.sched.due) <= t);
  const due = list.filter((c) => c.sched.state !== "new" && isDue(c))
    .sort((a, b) => (a.sched.state === "learning" ? 0 : 1) - (b.sched.state === "learning" ? 0 : 1) || time(a.sched.due) - time(b.sched.due));
  const fresh = list.filter((c) => c.sched.state === "new").sort((a, b) => a.id - b.id)
    .slice(0, Math.max(0, newPerDay - newToday));
  const ahead = list.filter((c) => c.sched.state === "learning" && time(c.sched.due) > t && time(c.sched.due) <= t + LEARN_AHEAD)
    .sort((a, b) => time(a.sched.due) - time(b.sched.due));
  return { due, fresh, ahead };
}

// Wie viele Karten an den nächsten n Lerntagen fällig werden (Tag 0 = heute inkl. Überfälliger).
export function forecast(cards, now, n = 7) {
  const out = Array(n).fill(0);
  for (const c of cards.filter(active)) {
    if (c.sched.state === "new" || !c.sched.due) continue;
    const d = dueDayIndex(c.sched.due, now);
    if (d < n) out[d]++;
  }
  return out;
}

export function studiedNewToday(cards, now) {
  const base = learningDayStart(now).getTime();
  return cards.filter((c) => c.sched?.firstStudied && learningDayStart(new Date(c.sched.firstStudied)).getTime() === base).length;
}

// Wie lange bis zur nächsten Wiederholung, wenn man so bewertet („10 Min.“, „4 Tage“, „3 Mon.“).
export function intervalLabel(s, grade, now = new Date()) {
  const ms = time(schedule(s, grade, now).due) - now.getTime();
  const d = ms / DAY;
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} Min.`;
  if (d < 1) return `${Math.round(ms / (60 * MIN))} Std.`;
  if (d < 31) return `${Math.round(d)} ${Math.round(d) === 1 ? "Tag" : "Tage"}`;
  if (d < 365) return `${Math.round(d / 30)} Mon.`;
  return `${(d / 365).toFixed(1).replace(".", ",")} J.`;
}
