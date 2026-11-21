// Karteikarten aus Texten: fehlende Wörter (gaps) und Wortschatz-Fehler. Gleiche Karten werden zusammengeführt.
import { locateErrors } from "./locate.js";
import { sentenceSpans } from "./revision.js";
import { newSched } from "./srs.js";
import { categoryById } from "./taxonomy.js";

const norm = (s) => String(s || "").replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

export function cardKey(c) {
  return c.type === "manual" ? `manual|${norm(c.front)}|${norm(c.back)}` : `${c.type}|${norm(c.back)}`;
}

function sentences(text) {
  const src = String(text || "");
  return sentenceSpans(src).map((s) => src.slice(s.start, s.end));
}

// Satz aus der verbesserten Fassung, in dem das englische Wort vorkommt – mit Lücke.
function clozeFrom(improved, english) {
  if (!english.trim()) return "";
  for (const s of sentences(improved)) {
    const hit = locateErrors(s, [{ quote: english }])[0];
    if (hit) return (s.slice(0, hit.start) + "____" + s.slice(hit.end)).replace(/\s+/g, " ");
  }
  return "";
}

function sentenceWith(text, quote) {
  for (const s of sentences(text)) if (locateErrors(s, [{ quote }]).length) return s.replace(/\s+/g, " ");
  return "";
}

export function makeCard(fields, now = new Date()) {
  const card = { type: "manual", front: "", back: "", note: "", context: "", sources: [], suspended: false,
    createdAt: now.toISOString(), sched: newSched(), ...fields };
  return { ...card, key: cardKey(card) };
}

export function cardsFromEntry(entry, now = new Date()) {
  const a = entry?.analysis;
  if (!a) return [];
  const out = [];
  for (const g of a.gaps || []) {
    const english = String(g.english || "").trim();
    const front = String(g.written || "").replace(/^\?+/, "").trim();
    if (!english || !front) continue;
    out.push(makeCard({ type: "gap", front, back: english, note: String(g.note || "").trim(),
      context: clozeFrom(a.improved_text, english), sources: [entry.id] }, now));
  }
  for (const e of a.errors || []) {
    if (categoryById(e.category)?.group !== "vocabulary" || !String(e.correction || "").trim()) continue;
    out.push(makeCard({ type: "vocab", front: e.quote, back: e.correction, note: String(e.explanation || "").trim(),
      context: sentenceWith(entry.text, e.quote), sources: [entry.id] }, now));
  }
  return out;
}

// existing: gespeicherte Karten (mit id). incoming: neue Kandidaten.
// → added: wirklich neue Karten, updated: vorhandene Karten mit ergänzten Quellen.
// deleted: Schlüssel bewusst gelöschter Karten – die werden nicht wieder erzeugt.
export function mergeCards(existing, incoming, deleted = new Set()) {
  const byKey = new Map(existing.map((c) => [c.key, c]));
  const added = [];
  const updated = new Map();
  for (const c of incoming) {
    if (deleted.has(c.key)) continue;
    const have = byKey.get(c.key);
    if (!have) {
      byKey.set(c.key, c);
      added.push(c);
      continue;
    }
    const extra = c.sources.filter((s) => !have.sources.includes(s));
    if (!extra.length) continue;
    have.sources = [...have.sources, ...extra];
    if (have.id !== undefined) updated.set(have.id, have);
  }
  return { added, updated: [...updated.values()] };
}

// Neue Karten eines Eintrags speichern (beim Bewerten und beim Nachtragen).
// Läufe werden hintereinander ausgeführt, damit sich zwei gleichzeitige nicht gegenseitig doppelte Karten anlegen.
let chain = Promise.resolve();
export function syncCards(store, entries, now = new Date()) {
  const run = chain.then(async () => {
    const existing = await store.listCards();
    const deleted = new Set((await store.getSetting("deletedCardKeys")) || []);
    const incoming = entries.flatMap((e) => cardsFromEntry(e, now));
    const { added, updated } = mergeCards(existing, incoming, deleted);
    for (const c of added) await store.addCard(c);
    for (const c of updated) await store.putCard(c);
    return added.length;
  });
  chain = run.catch(() => {});
  return run;
}

// Karte löschen und merken, damit sie nicht wieder erzeugt wird.
export async function deleteCard(store, card) {
  await store.deleteCard(card.id);
  if (card.type === "manual") return;
  const keys = new Set((await store.getSetting("deletedCardKeys")) || []);
  keys.add(card.key);
  await store.setSetting("deletedCardKeys", [...keys].slice(-5000));
}
