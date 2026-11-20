// Ergebnis eines Textes: Spinnennetz, Werte, Fazit, markierter Text, fehlende Wörter, verbesserte Fassung.
import { AXES, averageScores, reliability } from "../../core/scores.js";
import { locateErrors } from "../../core/locate.js";
import { categoryById, GROUPS } from "../../core/taxonomy.js";
import { errorGroupCounts } from "../../core/stats.js";
import { confirmDialog, esc, fmtDate, openModal, closeModal } from "../dom.js";
import { barSvg, radarSvg } from "../charts.js";
import { highlightHtml } from "../highlight.js";

function errorDetail(e) {
  const cat = categoryById(e.category);
  return `<p class="fix"><del>${esc(e.quote)}</del> → <ins>${esc(e.correction)}</ins></p>
    <p class="small"><span class="group-key"><i class="${esc(cat?.group)}"></i>${esc(cat?.label)} · ${esc(GROUPS[cat?.group]?.label)}</span>
    ${e.severity === "major" ? ' · <b>wichtig</b>' : ""}</p>
    <p>${esc(e.explanation)}</p>`;
}

export async function render(root, ctx, [idParam]) {
  const e = await ctx.store.getEntry(Number(idParam));
  if (!e) {
    root.innerHTML = '<div class="card"><h2>Text nicht gefunden</h2><a class="btn" href="#/">Zur Übersicht</a></div>';
    return;
  }
  const all = await ctx.store.listEntries();
  const before = all.filter((x) => x.createdAt < e.createdAt).slice(0, 5);
  const avg = averageScores(before);
  const a = e.analysis;
  const spans = locateErrors(e.text, a.errors);
  const placed = new Set(spans.map((s) => s.index));
  const counts = errorGroupCounts(a.errors);
  const showImproved = (await ctx.store.getSetting("showImproved")) !== false;
  const rel = reliability(e.metrics.words);

  root.innerHTML = `
    <div class="head">
      <p class="kicker">${esc(fmtDate(e.createdAt))} · ${esc(e.metrics.words)} Wörter${e.source === "photo" ? " · Foto" : ""}</p>
      <div class="row between"><h1>${esc(e.topic || "Dein Text")}</h1><span class="chip level" title="geschätztes Niveau">${esc(a.cefr)}</span></div>
      <p>${esc(a.summary)}</p>
    </div>
    ${rel === "short" ? '<p class="note">Kurzer Text – Wortvielfalt und Wortniveau schwanken bei unter 50 Wörtern stark.</p>' : ""}
    <div class="grid side">
      <section class="card">
        <div class="radar-wrap">${radarSvg(AXES, e.scores, avg, { title: "Spinnennetz dieses Textes" })}</div>
        <div class="legend"><span><span class="key"></span>dieser Text</span>${avg ? `<span><span class="key b"></span>dein Schnitt davor (${before.length})</span>` : ""}</div>
      </section>
      <section class="card">
        <table class="scores">
          <thead><tr><th>Achse</th><th></th><th>Wert</th>${avg ? "<th>Δ</th>" : ""}</tr></thead>
          <tbody>${AXES.map((ax) => {
            const d = avg ? e.scores[ax.key] - avg[ax.key] : null;
            return `<tr><td>${esc(ax.label)} <button class="how" data-how="${ax.key}" aria-label="Wie wird ${esc(ax.label)} berechnet?">?</button>
              <span class="src">${esc(ax.source)}</span></td>
              <td><div class="bar">${barSvg(e.scores[ax.key])}</div></td>
              <td class="num">${e.scores[ax.key]}</td>${avg ? `<td class="delta">${d > 0 ? "+" : ""}${d}</td>` : ""}</tr>`;
          }).join("")}</tbody>
        </table>
        <div class="grid two" >
          <div><h3>Stärken</h3><ul class="points">${a.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
          <div><h3>Daran arbeiten</h3><ul class="points">${a.focus.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
        </div>
        <p class="small muted">Stil: ${esc(a.style.comment)}</p>
      </section>
    </div>

    <section class="card">
      <div class="row between"><h2>Dein Text</h2>
        <div class="row">${Object.entries(GROUPS).map(([g, info]) =>
          `<span class="group-key"><i class="${g}"></i>${esc(info.label)} ${counts[g]}</span>`).join("")}</div></div>
      <p class="small muted">${a.errors.length ? "Tippe auf eine Markierung für Korrektur und Erklärung." : "Keine Fehler gefunden – stark!"}</p>
      <div class="learner-text" id="ltext">${highlightHtml(e.text, spans, a.errors)}</div>
      <div id="detail" class="err-detail hidden" aria-live="polite"></div>
    </section>

    <div class="grid two">
      <section class="card">
        <h2>Alle Fehler (${a.errors.length})</h2>
        ${a.errors.length ? `<ul class="err-list">${a.errors.map((er, i) => {
          const cat = categoryById(er.category);
          return `<li><button data-err="${i}"><span class="group-key"><i class="${esc(cat?.group)}"></i>${esc(cat?.label)}</span><br>
            <del>${esc(er.quote)}</del> → <ins>${esc(er.correction)}</ins>${placed.has(i) ? "" : ' <span class="small muted">(im Text nicht gefunden)</span>'}</button></li>`;
        }).join("")}</ul>` : '<p class="muted">Keine.</p>'}
      </section>
      <section class="card">
        <h2>Fehlende Wörter (${a.gaps.length})</h2>
        ${a.gaps.length ? `<ul class="gap-list">${a.gaps.map((g) => `<li><span class="de">${esc(g.written)}</span> → <span class="en">${esc(g.english)}</span>
          ${g.note ? `<span class="small muted">${esc(g.note)}</span>` : ""}</li>`).join("")}</ul>
          <p class="small muted">Diese Wörter werden später automatisch zu Karteikarten.</p>`
          : '<p class="muted">Keine – oder du hast keine deutschen Platzhalter benutzt.</p>'}
      </section>
    </div>

    ${showImproved ? `<section class="card"><details class="improved"><summary>Verbesserte Fassung zum Nachsprechen</summary>
      <p class="improved-text" lang="en">${esc(a.improved_text)}</p>
      <p class="small muted">Erst selbst überlegen, dann aufklappen und laut lesen.</p></details></section>` : ""}

    <section class="card">
      <div class="row between">
        <div class="small muted">Bewertet mit ${esc(e.model.analysis)}${e.model.ocr ? ` · eingelesen mit ${esc(e.model.ocr)}` : ""}</div>
        <button class="btn small danger" id="delete">Text löschen</button>
      </div>
      ${e.thumb ? `<details><summary class="small">Foto ansehen</summary><img class="thumb" alt="Foto des Textes" src="${esc(e.thumb)}"></details>` : ""}
    </section>`;

  const detail = root.querySelector("#detail");
  const select = (i) => {
    for (const m of root.querySelectorAll("mark.err")) m.classList.toggle("active", m.dataset.i === String(i));
    detail.innerHTML = errorDetail(a.errors[i]);
    detail.classList.remove("hidden");
  };
  root.querySelector("#ltext").addEventListener("click", (ev) => {
    const m = ev.target.closest("mark.err");
    if (m) select(Number(m.dataset.i));
  });
  root.querySelector("#ltext").addEventListener("keydown", (ev) => {
    const m = ev.target.closest("mark.err");
    if (m && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      select(Number(m.dataset.i));
    }
  });
  for (const b of root.querySelectorAll("[data-err]")) {
    b.onclick = () => {
      const i = Number(b.dataset.err);
      if (placed.has(i)) {
        select(i);
        root.querySelector(`mark[data-i="${i}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      } else {
        openModal(`${errorDetail(a.errors[i])}<div class="actions"><button class="btn" id="close">Schließen</button></div>`);
        document.getElementById("close").onclick = closeModal;
      }
    };
  }
  for (const b of root.querySelectorAll("[data-how]")) {
    b.onclick = () => {
      const ax = AXES.find((x) => x.key === b.dataset.how);
      openModal(`<h2>${esc(ax.label)}</h2><p class="small muted">${esc(ax.source)}</p><p>${esc(ax.how)}</p>
        <div class="actions"><button class="btn" id="close">Schließen</button></div>`);
      document.getElementById("close").onclick = closeModal;
    };
  }
  root.querySelector("#delete").onclick = async () => {
    if (!(await confirmDialog("Text löschen?", "Der Text und seine Bewertung werden von diesem Gerät gelöscht.", { ok: "Löschen", danger: true }))) return;
    await ctx.store.deleteEntry(e.id);
    ctx.toast("Gelöscht.");
    ctx.navigate("#/");
  };
}
