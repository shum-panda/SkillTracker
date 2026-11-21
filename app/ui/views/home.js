// Übersicht: Spinnennetz aus den letzten Texten, letzte Einträge, Einstieg ohne KI.
import { AXES, averageScores } from "../../core/scores.js";
import { esc, fmtDate } from "../dom.js";
import { radarSvg } from "../charts.js";
import { learnSummary } from "./learn.js";

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

export async function render(root, ctx) {
  const entries = await ctx.store.listEntries();
  const providers = await ctx.providers();
  if (!entries.length) {
    root.innerHTML = welcome(providers.length > 0 || ctx.demo);
    return;
  }
  const recent = entries.slice(0, 5);
  const avg = averageScores(recent);
  const learnState = await learnSummary(ctx).catch(() => null);
  const toLearn = learnState ? learnState.due + learnState.fresh : 0;
  root.innerHTML = `
    <div class="head row between">
      <div><p class="kicker">Übersicht</p><h1>Deine Form</h1></div>
      <a class="btn primary" href="#/new">Neuer Text</a>
    </div>
    ${toLearn ? `<section class="card due-banner"><div><b>${toLearn} ${toLearn === 1 ? "Karte" : "Karten"} heute</b>
      <span class="small muted"> · ${learnState.due} fällig, ${learnState.fresh} neu</span></div>
      <a class="btn" href="#/learn/session">Jetzt lernen</a></section>` : ""}
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
}
