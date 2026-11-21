// Export/Import als Datei. Importe sind fremde Daten: nur bekannte Felder, Typen geprüft, Analyse gegen das Schema.
import { ANALYSIS_SCHEMA, validate } from "./schema.js";
import { AXES } from "./scores.js";
import { PROVIDER_TYPES } from "./providers/index.js";
import { entryThumbs, MAX_PAGES } from "./pages.js";
import { categoryById } from "./taxonomy.js";
import { OUTCOMES } from "./revision.js";
import { makeCard, mergeCards } from "./cards.js";
import { newSched } from "./srs.js";

const APP = "skilltracker";
const VERSION = 1;
const METRIC_KEYS = ["words", "sentences", "mtld", "levelShare", "levelCounted", "avgLen", "subPerSentence"];
const SETTING_KEYS = ["providers", "ocrProvider", "analysisProvider", "showImproved", "theme"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const s = (v, max = 100000) => (typeof v === "string" ? v.slice(0, max) : "");

export async function exportData(store, { includeKeys = false } = {}) {
  const settings = {};
  for (const k of SETTING_KEYS) {
    const v = await store.getSetting(k);
    if (v !== undefined) settings[k] = v;
  }
  if (Array.isArray(settings.providers) && !includeKeys) {
    settings.providers = settings.providers.map((p) => ({ ...p, apiKey: "" }));
  }
  return { app: APP, version: VERSION, exportedAt: new Date().toISOString(), settings, entries: await store.listEntries(),
    cards: store.listCards ? await store.listCards() : [] };
}

const iso = (v) => {
  const d = new Date(v);
  return v && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};

function cleanSched(x) {
  if (!isObj(x) || !["new", "learning", "review"].includes(x.state)) return newSched();
  const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return { state: x.state, step: num(x.step, 0, 0, 1), due: iso(x.due), interval: num(x.interval, 0, 0, 36500),
    ease: num(x.ease, 2.5, 1.3, 5), reps: num(x.reps, 0, 0, 1e6), lapses: num(x.lapses, 0, 0, 1e6), firstStudied: iso(x.firstStudied) };
}

function cleanCard(c) {
  if (!isObj(c) || !["gap", "vocab", "manual"].includes(c.type)) return null;
  const front = s(c.front, 500).trim();
  const back = s(c.back, 500).trim();
  if (!front || !back) return null;
  return makeCard({ type: c.type, front, back, note: s(c.note, 2000), context: s(c.context, 2000),
    sources: (Array.isArray(c.sources) ? c.sources : []).filter(Number.isInteger).slice(0, 200),
    suspended: c.suspended === true, createdAt: iso(c.createdAt) || new Date().toISOString(), sched: cleanSched(c.sched) });
}

function cleanProvider(p) {
  if (!isObj(p) || !PROVIDER_TYPES[p.type] || !s(p.id)) return null;
  return { id: s(p.id, 64), type: p.type, name: s(p.name, 80), apiKey: s(p.apiKey, 400),
    baseUrl: p.type === "compatible" ? s(p.baseUrl, 400) : "", model: s(p.model, 200) };
}

// Wohin ein Schlüssel geschickt würde: Typ + Adresse. Ändert sich das, bleibt der alte Schlüssel nicht hängen.
const target = (p) => `${p.type}|${p.type === "compatible" ? String(p.baseUrl || "").replace(/\/+$/, "") : ""}`;

function cleanSettings(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  if (Array.isArray(raw.providers)) out.providers = raw.providers.map(cleanProvider).filter(Boolean);
  for (const k of ["ocrProvider", "analysisProvider"]) if (typeof raw[k] === "string") out[k] = s(raw[k], 64);
  if (typeof raw.showImproved === "boolean") out.showImproved = raw.showImproved;
  if (["auto", "light", "dark"].includes(raw.theme)) out.theme = raw.theme;
  return out;
}

function cleanEntry(e) {
  if (!isObj(e) || typeof e.text !== "string" || !e.text.trim()) return null;
  if (validate(ANALYSIS_SCHEMA, e.analysis).length) return null;
  if (!isObj(e.scores) || !AXES.every((a) => Number.isFinite(e.scores[a.key]))) return null;
  if (!isObj(e.metrics) || !METRIC_KEYS.every((k) => Number.isFinite(e.metrics[k]))) return null;
  const created = new Date(e.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return {
    createdAt: created.toISOString(),
    topic: s(e.topic, 200),
    source: e.source === "photo" ? "photo" : "typed",
    thumbs: entryThumbs(e).filter((t) => typeof t === "string" && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(t))
      .slice(0, MAX_PAGES),
    text: s(e.text),
    analysis: e.analysis,
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, e.metrics[k]])),
    scores: Object.fromEntries(AXES.map((a) => [a.key, Math.max(0, Math.min(100, Math.round(e.scores[a.key])))])),
    model: { ocr: s(e.model?.ocr, 200), analysis: s(e.model?.analysis, 200) },
    revisions: (Array.isArray(e.revisions) ? e.revisions : []).map(cleanRevision).filter(Boolean).slice(0, 50),
    schemaVersion: 1,
    // nur für den Import: alte IDs, werden in applyImport auf neue umgeschrieben und dann entfernt
    _oldId: Number.isInteger(e.id) ? e.id : null,
    _revisionOf: Number.isInteger(e.revisionOf) ? e.revisionOf : null,
  };
}

function cleanRevision(r) {
  if (!isObj(r) || !["steps", "whole"].includes(r.mode)) return null;
  const created = new Date(r.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const tasks = (Array.isArray(r.tasks) ? r.tasks : []).filter((t) => isObj(t) && Number.isInteger(t.errorIndex)
    && categoryById(t.category) && OUTCOMES.includes(t.outcome))
    .map((t) => ({ errorIndex: t.errorIndex, category: t.category, outcome: t.outcome, answer: s(t.answer, 2000) }));
  return { createdAt: created.toISOString(), mode: r.mode, tasks, revisedText: s(r.revisedText),
    _resultOld: Number.isInteger(r.resultEntryId) ? r.resultEntryId : null };
}

export function parseImport(obj) {
  if (!isObj(obj) || obj.app !== APP) throw new Error("Das ist keine SkillTracker-Sicherung.");
  if (obj.version !== VERSION) throw new Error(`Unbekannte Version der Sicherung (${String(obj.version)}).`);
  const raw = Array.isArray(obj.entries) ? obj.entries : [];
  const entries = raw.map(cleanEntry).filter(Boolean);
  const settings = cleanSettings(obj.settings);
  return {
    settings, entries, skipped: raw.length - entries.length,
    cards: (Array.isArray(obj.cards) ? obj.cards : []).map(cleanCard).filter(Boolean).slice(0, 20000),
    hasKeys: (settings.providers || []).some((p) => p.apiKey),
  };
}

export async function applyImport(store, parsed, { withKeys = false } = {}) {
  const { providers, ...rest } = parsed.settings;
  if (providers) {
    const current = (await store.getSetting("providers")) || [];
    const byId = new Map(current.map((p) => [p.id, p]));
    for (const p of providers) {
      const old = byId.get(p.id);
      const keep = old && target(old) === target(p) ? old.apiKey || "" : "";
      byId.set(p.id, { ...p, apiKey: withKeys && p.apiKey ? p.apiKey : keep });
    }
    await store.setSetting("providers", [...byId.values()]);
  }
  for (const [k, v] of Object.entries(rest)) await store.setSetting(k, v);
  // Erst alle Einträge anlegen (neue IDs), dann Verweise zwischen Original und Überarbeitung umschreiben.
  const idMap = new Map();
  const added = [];
  for (const e of parsed.entries) {
    const { _oldId, _revisionOf, ...rest } = e;
    const clean = { ...rest, revisions: rest.revisions.map(({ _resultOld, ...r }) => r) };
    const id = await store.addEntry(clean);
    if (_oldId !== null) idMap.set(_oldId, id);
    added.push({ id, entry: e });
  }
  for (const { id, entry } of added) {
    const links = entry._revisionOf !== null || entry.revisions.some((r) => r._resultOld !== null);
    if (!links) continue;
    const stored = await store.getEntry(id);
    if (idMap.has(entry._revisionOf)) stored.revisionOf = idMap.get(entry._revisionOf);
    stored.revisions = stored.revisions.map((r, i) => {
      const old = entry.revisions[i]._resultOld;
      return idMap.has(old) ? { ...r, resultEntryId: idMap.get(old) } : r;
    });
    await store.putEntry(stored);
  }
  // Karten: Quellen auf neue IDs, unbekannte Quellen weg; gleiche Karten zusammenführen.
  if (store.listCards && parsed.cards?.length) {
    const incoming = parsed.cards.map((c) => ({ ...c, sources: c.sources.filter((id) => idMap.has(id)).map((id) => idMap.get(id)) }));
    const { added: newCards, updated } = mergeCards(await store.listCards(), incoming);
    for (const c of newCards) await store.addCard(c);
    for (const c of updated) await store.putCard(c);
  }
  return { added: parsed.entries.length, skipped: parsed.skipped };
}
