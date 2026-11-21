// Verlauf: eine kleine Linie je Achse (Small Multiples) und die häufigsten Fehlerarten.
import { AXES } from "../../core/scores.js";
import { topCategories } from "../../core/stats.js";
import { esc, fmtDate, fmtShort } from "../dom.js";
import { barSvg, lineSvg } from "../charts.js";
import { entryListHtml } from "./home.js";

export async function render(root, ctx) {
  const entries = await ctx.store.listEntries();
  if (entries.length < 2) {
    root.innerHTML = `<div class="head"><p class="kicker">Verlauf</p><h1>Dein Verlauf</h1></div>
      <div class="card"><p>Ab zwei Texten siehst du hier, wie sich jede Achse entwickelt.</p>
      <a class="btn primary" href="#/new">Neuer Text</a></div>`;
    return;
  }
  const chrono = [...entries].reverse();
  const speakPts = entries.flatMap((e) => (e.speaking || []).map((s) => ({ date: s.createdAt, value: s.score, label: `${fmtShort(s.createdAt)} · ${e.topic || "Text"}` })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const top = topCategories(entries, 6);
  const maxCount = top[0]?.count || 1;
  root.innerHTML = `
    <div class="head"><p class="kicker">Verlauf</p><h1>Wo du besser wirst</h1>
      <p>${entries.length} Texte seit dem ${esc(fmtDate(chrono[0].createdAt))} – jede Linie ist eine Achse, 0–100.</p></div>
    <div class="multiples">${AXES.map((a) => {
      const pts = chrono.map((e) => ({ date: e.createdAt, value: e.scores[a.key], label: `${fmtShort(e.createdAt)} · ${e.topic || "Text"}` }));
      const first = pts[0].value;
      const last = pts.at(-1).value;
      const d = last - first;
      return `<section class="card"><h3>${esc(a.label)} <span class="mono">${d > 0 ? "+" : ""}${d} seit Beginn</span></h3>
        ${lineSvg(pts, { title: `Verlauf ${a.label}` })}</section>`;
    }).join("")}</div>
    ${speakPts.length >= 2 ? `<section class="card"><h3>Aussprache <span class="mono small muted">nicht im Spinnennetz – es bewertet das Schreiben</span></h3>
      ${lineSvg(speakPts, { title: "Verlauf Aussprache", width: 640, height: 140 })}</section>` : ""}
    <div class="grid two" >
      <section class="card">
        <h2>Häufigste Fehlerarten</h2>
        ${top.length ? `<ul class="topcats">${top.map((c) => `<li><div class="lbl"><span>${esc(c.label)}</span><b>${c.count}</b></div>
          <div class="bar">${barSvg(c.count, maxCount)}</div></li>`).join("")}</ul>
          <p class="small muted">Gezielt üben: <a href="#/train">Deine Baustellen</a>.</p>` : '<p class="muted">Bisher keine Fehler – beeindruckend.</p>'}
      </section>
      <section class="card"><h2>Alle Texte</h2>${entryListHtml(entries)}</section>
    </div>`;
}
