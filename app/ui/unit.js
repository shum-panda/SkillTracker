// Geplante Lerneinheit: mehrere Teile nacheinander (Karten, Übung, Überarbeiten, Aussprache) und direkte Sprünge (#/go/…).
import { categoryById } from "../core/taxonomy.js";
import { recordActivity } from "../core/activity.js";

const GONE = "Das Ziel gibt es nicht mehr – hier ist dein Plan für heute.";
const KIND_LABEL = { cards: "Karten", drill: "Grammatik", revise: "Überarbeiten", speak: "Aussprache" };

export const partLabel = (p) => (p.kind === "drill" && p.label ? `Grammatik – ${p.label}` : KIND_LABEL[p.kind] || p.kind)
  + (p.kind === "cards" && p.count ? ` (${p.count})` : "");

const hasEntry = (entries, id) => /^\d+$/.test(id) && entries.some((e) => e.id === Number(id));

// Pfad hinter #/go/ → Ziel-Hash. Unbekannt oder veraltet → Plan für heute mit Hinweis.
export function resolveGo(path, { entries = [], plan = null } = {}) {
  const [what, arg, extra] = String(path || "").split("/");
  if (extra !== undefined) return { hash: "#/go/heute", note: GONE };
  if (what === "heute" && arg === undefined) {
    const first = plan?.parts?.[0];
    if (!first) return { hash: "#/new", note: "Heute steht nichts an – schreib doch einen neuen Text." };
    return resolveGo(first.link.replace(/^#\/go\//, ""), { entries, plan: null });
  }
  if (what === "karten" && arg === undefined) return { hash: "#/learn/session" };
  if (what === "schreiben" && arg === undefined) return { hash: "#/new" };
  if (what === "uebung" && arg && categoryById(arg)) return { hash: `#/train/${arg}` };
  if (what === "ueberarbeiten" && hasEntry(entries, arg)) return { hash: `#/e/${arg}/revise` };
  if (what === "sprechen" && hasEntry(entries, arg)) return { hash: `#/e/${arg}/speak` };
  return { hash: "#/go/heute", note: GONE };
}

export const partTarget = (part, entries) => resolveGo(part.link.replace(/^#\/go\//, ""), { entries }).hash;

export function unitStatus(partsDone, total) {
  if (total && partsDone >= total) return "done";
  return partsDone > 0 ? "partial" : "abandoned";
}

export function sessionShouldEnd({ graded, limit, queueLeft }) {
  if (Number.isFinite(limit) && limit > 0 && graded >= limit) return true;
  return queueLeft <= 0;
}

// Startet eine Einheit und hängt sie an ctx. Teile laufen in den normalen Ansichten; die melden sich mit partDone().
export function startUnit(ctx, plan, entries) {
  const store = ctx.store;
  const parts = plan.parts.map((p) => ({ ...p, target: partTarget(p, entries) }));
  const startedAt = new Date().toISOString();
  // Offene Einheit merken: Wer die App einfach schließt, bricht sie ab – das zählt beim nächsten Start (recoverUnit).
  const remember = (value) => { if (!ctx.demo && ctx.store === store) store.setSetting("unitOpen", value).catch(() => {}); };
  const unit = {
    plan, parts, index: 0, done: 0, summary: "", finished: false,
    current() { return parts[this.index] || null; },
    // Gehört dieser Hash zur Einheit? (aktueller Teil oder Zwischenseite)
    allows(hash) {
      if (hash.startsWith("#/go/")) return true;
      const cur = this.current();
      return Boolean(cur && (hash === cur.target || hash.startsWith(cur.target + "?")));
    },
    partDone(kind, summary = "") {
      const cur = this.current();
      if (ctx.unit !== this || !cur || cur.kind !== kind) return false;
      this.done++;
      this.index++;
      this.summary = summary;
      if (this.index < parts.length) remember({ startedAt, planned: plan.minutes * 60, done: this.done, total: parts.length });
      if (this.index >= parts.length) this.finish("done");
      ctx.replace("#/go/weiter");
      return true;
    },
    finish(status) {
      if (this.finished) return;
      this.finished = true;
      remember(null);
      if (!ctx.demo && ctx.store === store) {
        recordActivity(store, { kind: "unit", unit: { planned: plan.minutes * 60, status } })
          .then(() => ctx.reminders?.refresh?.())
          .catch(() => {});
      }
      if (status !== "done" && ctx.unit === this) ctx.unit = null;
    },
    abandon() {
      this.finish(unitStatus(this.done, parts.length));
      if (ctx.unit === this) ctx.unit = null;
    },
  };
  ctx.unit = unit;
  remember({ startedAt, planned: plan.minutes * 60, done: 0, total: parts.length });
  return unit;
}

// Beim Start: Einheit, die beim letzten Mal offen blieb (App geschlossen), als abgebrochen bzw. teilweise eintragen.
export async function recoverUnit(store) {
  const saved = await store.getSetting("unitOpen");
  if (!saved) return null;
  await store.setSetting("unitOpen", null);
  const status = unitStatus(saved.done || 0, saved.total || 0);
  if (status === "done") return null;
  await recordActivity(store, { kind: "unit", at: saved.startedAt, unit: { planned: saved.planned || 0, status } }).catch(() => {});
  return status;
}

export function unitBarHtml(unit, esc) {
  const cur = unit.current();
  if (!cur) return "";
  return `<div class="unit-bar" role="status"><span class="kicker violet">Teil ${unit.index + 1} von ${unit.parts.length}</span>
    <b>${esc(partLabel(cur))}</b><span class="small muted">ca. ${esc(Math.max(1, Math.round(cur.seconds / 60)))} Min</span>
    <a class="btn small link" href="#/" id="unit-stop">Einheit beenden</a></div>`;
}
