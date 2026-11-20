// Die sechs Achsen (0–100). Gezählte Achsen kommen aus den Metriken, Grammatik/Satzbau aus der Fehlerliste
// der KI nach fester Formel, nur der Stil ist eine reine KI-Einschätzung.
import { categoryById } from "./taxonomy.js";

export const AXES = [
  { key: "grammar", label: "Grammatik", source: "KI-Fehler",
    how: "Grammatikfehler je 100 Wörter (leicht = 1, schwer = 2), umgerechnet mit 100·e^(−d/8). Keine Fehler = 100." },
  { key: "structure", label: "Satzbau", source: "KI-Fehler",
    how: "Satzbau-Fehler (Wortstellung, Frageform, fehlende Wörter …) je 100 Wörter, umgerechnet mit 100·e^(−d/4)." },
  { key: "diversity", label: "Wortvielfalt", source: "gezählt",
    how: "MTLD: wie lange du schreibst, bevor sich Wörter stark wiederholen. MTLD 30 = 0, MTLD 110 = 100." },
  { key: "level", label: "Wortniveau", source: "gezählt",
    how: "Anteil seltenerer Wörter (seltener als Alltagswörter laut wordfreq). 25 % und mehr = 100." },
  { key: "complexity", label: "Komplexität", source: "gezählt",
    how: "Halb Satzlänge (6 Wörter = 0, 22 = 100), halb Nebensätze je Satz (because, which, although … 1,2 = 100)." },
  { key: "style", label: "Stil", source: "KI",
    how: "Einschätzung der KI: abwechslungsreiche Satzanfänge, Verbindungswörter, passende Tonlage, Wendungen." },
];

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));

function density(errors, group, words) {
  let weight = 0;
  for (const e of errors || []) {
    if (categoryById(e.category)?.group !== group) continue;
    weight += e.severity === "major" ? 2 : 1;
  }
  return (weight * 100) / Math.max(words, 1);
}

export function computeScores(metrics, analysis) {
  const words = metrics.words || 0;
  return {
    grammar: clamp(100 * Math.exp(-density(analysis.errors, "grammar", words) / 8)),
    structure: clamp(100 * Math.exp(-density(analysis.errors, "structure", words) / 4)),
    diversity: clamp(((metrics.mtld - 30) / 80) * 100),
    level: clamp((metrics.levelShare / 0.25) * 100),
    complexity: clamp(0.5 * ((metrics.avgLen - 6) / 16) * 100 + 0.5 * (metrics.subPerSentence / 1.2) * 100),
    style: clamp(analysis.style?.score),
  };
}

export const MIN_WORDS = 10;
export const RELIABLE_WORDS = 50;

export function reliability(words) {
  if (words < MIN_WORDS) return "too_short";
  return words < RELIABLE_WORDS ? "short" : "ok";
}

export function averageScores(entries) {
  const list = entries.filter((e) => e?.scores);
  if (!list.length) return null;
  const out = {};
  for (const { key } of AXES) out[key] = Math.round(list.reduce((s, e) => s + (e.scores[key] || 0), 0) / list.length);
  return out;
}
