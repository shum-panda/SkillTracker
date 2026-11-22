// Übersicht: Spinnennetz aus den letzten Texten, letzte Einträge, Einstieg ohne KI.
import { AXES, averageScores } from "../../core/scores.js";
import { esc, fmtDate } from "../dom.js";
import { radarSvg } from "../charts.js";
import { planToday } from "../../core/plan.js";
import { dayStats } from "../../core/activity.js";
import { learningDayKey } from "../../core/srs.js";
import { heatmapHtml, bindHeatmap } from "../heatmap.js";
import { partLabel } from "../unit.js";
import { planData } from "./go.js";

export function entryListHtml(entries) {
  return `<ul class="entries">${entries.map((e) => `<li><a href="#/e/${e.id}">
    <span class="mini">${radarSvg(AXES, e.scores, null, { size: 44, labels: false, title: "Form dieses Textes" })}</span>
    <span class="body"><span class="t">${esc(e.topic || e.text.slice(0, 60))}</span>
    <span class="meta">${esc(fmtDate(e.createdAt))} · ${esc(e.metrics.words)} Wörter${e.source === "photo" ? " · Foto" : ""}</span></span>
    <span class="chip level">${esc(e.analysis.cefr)}</span></a></li>`).join("")}</ul>`;
}

function welcome(hasProvider) {
  return `<section class="card hero">
    <div>
      <p class="kicker">Englisch durch Schreiben</p>
      <h1>Schreib. Lass es lesen. Sieh deine Form.</h1>
      <p class="muted">Schreib einen kurzen englischen Text – am besten von Hand – und fotografiere ihn. Deine eigene KI liest ihn
      ein und bewertet Grammatik, Satzbau, Wortschatz und Stil. Fehlt dir ein Wort, schreib es einfach auf Deutsch.</p>
      <ol class="steps">
        <li>${hasProvider ? "KI ist verbunden" : "Eigene KI verbinden (Claude, OpenAI, Gemini oder lokal)"}</li>
        <li>Text schreiben und fotografieren oder eintippen</li>
        <li>Fehler ansehen, verbesserte Fassung laut lesen, nächsten Text schreiben</li>
      </ol>
      <div class="row">
        ${hasProvider ? '<a class="btn primary" href="#/new">Ersten Text schreiben</a>' : '<a class="btn primary" href="#/settings">KI verbinden</a>'}
        <a class="btn" href="#/demo">Demo ansehen</a>
      </div>
    </div>
    <div class="radar-wrap">${radarSvg(AXES, { grammar: 72, structure: 64, diversity: 58, level: 40, complexity: 52, style: 61 }, null,
      { title: "Beispiel eines Spinnennetzes" })}</div>
  </section>`;
}

function todayHtml(plan, data) {
  const can = plan.parts.length > 0;
  const learn = can
    ? `<a class="btn big violet" href="#/go/heute"><b>Lernen</b><span>ca. ${esc(plan.minutes)} Min</span></a>`
    : `<a class="btn big disabled-link" href="#/new" aria-disabled="true"><b>Nichts fällig</b><span>Text schreiben?</span></a>`;
  const hasProfile = Boolean(data.hasProfile);
  let planBody;
  if (!hasProfile) {
    planBody = '<p class="muted">Lass dir einen Lernplan einrichten: Er sagt dir jeden Tag, was dran ist – am Anfang kurz, dann länger.</p><a class="btn small" href="#/willkommen">Lernplan einrichten (1 Minute)</a>';
  } else if (plan.done) {
    planBody = '<p><b>Heute geschafft ✓</b></p><p class="small muted">Du kannst trotzdem weiterlernen.</p>'
      + (can ? '<a class="btn small" href="#/go/heute">Weiterlernen</a>' : "");
  } else if (can) {
    planBody = `<ul class="plan-parts">${plan.parts.map((p) => `<li><span>${esc(partLabel(p))}</span><span class="small muted">ca. ${esc(Math.max(1, Math.round(p.seconds / 60)))} Min</span></li>`).join("")}</ul>`;
  } else {
    planBody = '<p class="muted">Gerade ist nichts fällig. Schreib einen Text – daraus entstehen neue Karten und Übungen.</p><a class="small" href="#/train">Frei üben</a>';
  }
  return `<div class="quick">
      <a class="btn big primary" href="#/new"><b>Text schreiben</b><span>Foto oder tippen</span></a>
      ${learn}
    </div>
    <section class="card plan-card">
      <div class="row between"><h2>Heute</h2>${plan.writeDay && hasProfile ? '<span class="chip violet">Heute ist Schreibtag</span>' : ""}</div>
      ${planBody}
    </section>`;
}

export async function render(root, ctx) {
  const data = await planData(ctx);
  const entries = data.entries;
  const providers = await ctx.providers();
  data.hasProfile = Boolean(await ctx.store.getSetting("profile"));
  if (!entries.length && !data.hasProfile && !ctx.demo) {
    ctx.replace("#/willkommen");
    return;
  }
  const plan = planToday(data);
  const today = learningDayKey(data.now);
  const weeks = (globalThis.innerWidth || 0) >= 900 ? 26 : 20;
  const heat = `<section class="card"><div class="row between"><h2>Aktivität</h2></div>${heatmapHtml(dayStats(data.activity), today, { weeks })}</section>`;
  if (!entries.length) {
    root.innerHTML = todayHtml(plan, data) + heat + welcome(providers.length > 0 || ctx.demo);
    bindHeatmap(root);
    return;
  }
  const recent = entries.slice(0, 5);
  const avg = averageScores(recent);
  root.innerHTML = `
    ${todayHtml(plan, data)}
    ${heat}
    <div class="grid side">
      <section class="card">
        <div class="radar-wrap">${radarSvg(AXES, avg, null, { title: "Schnitt der letzten Texte" })}</div>
        <p class="muted small">Schnitt der letzten ${recent.length} ${recent.length === 1 ? "Text" : "Texte"}.</p>
      </section>
      <section class="card">
        <div class="stat-row">
          <div class="stat"><b>${entries.length}</b><span>Texte</span></div>
          <div class="stat"><b>${esc(entries.reduce((s, e) => s + e.metrics.words, 0))}</b><span>Wörter geschrieben</span></div>
          <div class="stat"><b>${esc(entries[0].analysis.cefr)}</b><span>zuletzt (Schätzung)</span></div>
        </div>
        <table class="scores"><tbody>${AXES.map((a) => `<tr><td>${esc(a.label)}</td><td class="num">${avg[a.key]}</td></tr>`).join("")}</tbody></table>
        ${entries[0].analysis.focus.length ? `<h3 class="focus-title">Daran arbeiten</h3><ul class="points">${entries[0].analysis.focus
          .map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      </section>
    </div>
    <section class="card">
      <div class="row between"><h2>Letzte Texte</h2>${entries.length > 1 ? '<a href="#/history">Verlauf ansehen</a>' : ""}</div>
      ${entryListHtml(entries.slice(0, 8))}
    </section>`;
  bindHeatmap(root);
}
