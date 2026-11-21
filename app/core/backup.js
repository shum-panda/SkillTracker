// Export/Import als Datei. Importe sind fremde Daten: nur bekannte Felder, Typen geprüft, Analyse gegen das Schema.
import { ANALYSIS_SCHEMA, validate } from "./schema.js";
import { AXES } from "./scores.js";
import { PROVIDER_TYPES } from "./providers/index.js";
import { entryThumbs, MAX_PAGES } from "./pages.js";

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
  return { app: APP, version: VERSION, exportedAt: new Date().toISOString(), settings, entries: await store.listEntries() };
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
    schemaVersion: 1,
  };
}

export function parseImport(obj) {
  if (!isObj(obj) || obj.app !== APP) throw new Error("Das ist keine SkillTracker-Sicherung.");
  if (obj.version !== VERSION) throw new Error(`Unbekannte Version der Sicherung (${String(obj.version)}).`);
  const raw = Array.isArray(obj.entries) ? obj.entries : [];
  const entries = raw.map(cleanEntry).filter(Boolean);
  const settings = cleanSettings(obj.settings);
  return {
    settings, entries, skipped: raw.length - entries.length,
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
  for (const e of parsed.entries) await store.addEntry(e);
  return { added: parsed.entries.length, skipped: parsed.skipped };
}
