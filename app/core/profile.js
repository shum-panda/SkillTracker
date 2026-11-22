// Lernprofil aus dem Onboarding: Ziel, Niveau, Motivation, Zeit, Texte pro Woche, Erinnerungen.
export const GOALS = ["daily", "exam", "work", "travel"];
export const LEVELS = ["A2", "B1", "B2", "C1"];
export const MOTIVATIONS = ["relaxed", "steady", "ambitious"];
export const MINUTES = [5, 10, 20];
export const WRITES = [1, 2, 3, 5];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]; // 0 = Montag

export const GOAL_LABEL = { daily: "Alltag", exam: "Schule/Prüfung", work: "Beruf", travel: "Reisen" };
export const MOTIVATION_LABEL = { relaxed: "locker", steady: "dranbleiben", ambitious: "ehrgeizig" };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultProfile(goal = "daily") {
  return {
    goal: GOALS.includes(goal) ? goal : "daily", examDate: null, level: null, motivation: "steady", minutes: 10,
    writesPerWeek: goal === "exam" ? 3 : 2, reminder: { enabled: true, time: "19:00", days: [...ALL_DAYS] },
    updatedAt: new Date().toISOString(),
  };
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function cleanProfile(raw) {
  if (!isObj(raw) || !isObj(raw.reminder)) return null;
  const { goal, examDate, level, motivation, minutes, writesPerWeek, reminder, updatedAt } = raw;
  if (!GOALS.includes(goal) || !MOTIVATIONS.includes(motivation) || !MINUTES.includes(minutes) || !WRITES.includes(writesPerWeek)) return null;
  if (examDate !== null && !(typeof examDate === "string" && DATE_RE.test(examDate) && !Number.isNaN(Date.parse(examDate)))) return null;
  if (level !== null && !LEVELS.includes(level)) return null;
  if (typeof reminder.enabled !== "boolean" || typeof reminder.time !== "string" || !TIME_RE.test(reminder.time)) return null;
  const days = reminder.days;
  if (!Array.isArray(days) || !days.every((d) => ALL_DAYS.includes(d)) || new Set(days).size !== days.length) return null;
  const at = new Date(updatedAt);
  if (Number.isNaN(at.getTime())) return null;
  return { goal, examDate, level, motivation, minutes, writesPerWeek,
    reminder: { enabled: reminder.enabled, time: reminder.time, days: [...days].sort((a, b) => a - b) }, updatedAt: at.toISOString() };
}
