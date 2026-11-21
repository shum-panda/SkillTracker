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
    interval = Math.round(n.interval * n.ease * 1.3);
    ease = round2(n.ease + 0.15);
  } else {
    interval = Math.round(n.interval * n.ease);
  }
  interval = Math.max(n.interval + 1, interval);
  return { ...n, interval, ease, due: at(now, interval * DAY) };
}

const active = (c) => !c.suspended && c.sched;
const time = (iso) => new Date(iso).getTime();

// Was heute in die Sitzung kommt: fällige (lernende zuerst), neue bis zum Tageslimit, lernende bald fällige (vorziehbar).
export function buildQueue(cards, now, { newPerDay = DEFAULT_NEW_PER_DAY, newToday = 0 } = {}) {
  const t = now.getTime();
  const list = cards.filter(active);
  const due = list.filter((c) => c.sched.state !== "new" && c.sched.due && time(c.sched.due) <= t)
    .sort((a, b) => (a.sched.state === "learning" ? 0 : 1) - (b.sched.state === "learning" ? 0 : 1) || time(a.sched.due) - time(b.sched.due));
  const fresh = list.filter((c) => c.sched.state === "new").sort((a, b) => a.id - b.id)
    .slice(0, Math.max(0, newPerDay - newToday));
  const ahead = list.filter((c) => c.sched.state === "learning" && time(c.sched.due) > t && time(c.sched.due) <= t + LEARN_AHEAD)
    .sort((a, b) => time(a.sched.due) - time(b.sched.due));
  return { due, fresh, ahead };
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// Wie viele Karten an den nächsten n Tagen fällig werden (Tag 0 = heute inkl. Überfälliger).
export function forecast(cards, now, n = 7) {
  const out = Array(n).fill(0);
  const base = startOfDay(now);
  for (const c of cards.filter(active)) {
    if (c.sched.state === "new" || !c.sched.due) continue;
    const d = Math.max(0, Math.floor((time(c.sched.due) - base) / DAY));
    if (d < n) out[d]++;
  }
  return out;
}

export function studiedNewToday(cards, now) {
  const base = startOfDay(now);
  return cards.filter((c) => c.sched?.firstStudied && startOfDay(new Date(c.sched.firstStudied)) === base).length;
}
