// Überarbeiten: Fehler als Aufgaben (Schritt für Schritt) oder den ganzen Text auf einmal; danach neu bewerten.
import { analyze, judgeRevision } from "../../core/ai.js";
import { computeMetrics } from "../../core/metrics.js";
import { computeScores, MIN_WORDS } from "../../core/scores.js";
import { locateErrors } from "../../core/locate.js";
import { applySentences, buildTasks, checkAnswer, expectedSentence, recommendMode, summarizeRevision, STEPS_FROM } from "../../core/revision.js";
import { categoryById, GROUPS } from "../../core/taxonomy.js";
import { errorGroupCounts } from "../../core/stats.js";
import { tokenize } from "../../core/text.js";
import { esc, spinner } from "../dom.js";
import { highlightHtml } from "../highlight.js";

const errorText = (e) => esc(e?.message || String(e)) + (e?.detail ? `<br><span class="small muted">${esc(e.detail)}</span>` : "");

export async function render(root, ctx, [idParam]) {
  const store = ctx.store;
  const e = await store.getEntry(Number(idParam));
  if (!e) {
    root.innerHTML = '<div class="card"><h2>Text nicht gefunden</h2><a class="btn" href="#/">Zur Übersicht</a></div>';
    return;
  }
  const provider = await ctx.providerFor("analysis");
  const errors = e.analysis.errors;
  const built = buildTasks(e.text, errors);
  const edits = {};          // Satz-Index → bearbeiteter Satz
  const results = [];        // {errorIndex, category, outcome, answer}
  let mode = null;
  let stepSeq = 0;
  const back = `<a href="#/e/${e.id}" class="small">← zurück zum Ergebnis</a>`;

  const current = (si) => (Object.hasOwn(edits, si) ? edits[si] : built.sentences[si].text);

  function choose() {
    const counts = errorGroupCounts(errors);
    const rec = recommendMode(errors.length);
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Überarbeiten</p><h1>${esc(e.topic || "Dein Text")}</h1>
        <p>${errors.length ? `${errors.length} ${"Fehler"} zum Verbessern.` : "Keine Fehler gefunden – du kannst den Text trotzdem umschreiben."}
        Die Lösungen siehst du nur, wenn du sie aufdeckst.</p></div>
      <div class="row">${Object.entries(GROUPS).map(([g, info]) => `<span class="group-key"><i class="${g}"></i>${esc(info.label)} ${counts[g]}</span>`).join("")}</div>
      <div class="grid two">
        <section class="card stack ${rec === "steps" ? "recommended" : ""}">
          ${rec === "steps" ? '<span class="chip level">empfohlen</span>' : ""}
          <h2>Schritt für Schritt</h2>
          <p class="muted">Ein Fehler nach dem anderen, nach Art sortiert – mit Tipps, wenn du sie brauchst.
          ${built.tasks.length} ${built.tasks.length === 1 ? "Aufgabe" : "Aufgaben"}.</p>
          <button class="btn primary" id="steps" ${built.tasks.length ? "" : "disabled"}>Los geht's</button>
        </section>
        <section class="card stack ${rec === "whole" ? "recommended" : ""}">
          ${rec === "whole" && errors.length ? '<span class="chip level">empfohlen</span>' : ""}
          <h2>Ganzer Text</h2>
          <p class="muted">Du schreibst den ganzen Text selbst neu. ${errors.length >= STEPS_FROM ? "Bei vielen Fehlern ist das schwer – Schritt für Schritt hilft mehr." : ""}</p>
          <button class="btn" id="whole">Ganzen Text überarbeiten</button>
        </section>
      </div>
      ${built.unplaced ? `<p class="small muted">${built.unplaced} Fehler stehen nicht wörtlich im Text und fehlen in den Aufgaben.</p>` : ""}`;
    root.querySelector("#steps").onclick = () => { mode = "steps"; step(0); };
    root.querySelector("#whole").onclick = () => { mode = "whole"; whole(); };
  }

  function step(k) {
    if (k >= built.tasks.length) return finish(applySentences(e.text, built.sentences, edits));
    const t = built.tasks[k];
    const err = errors[t.errorIndex];
    const cat = categoryById(t.category);
    const sentence = current(t.sentenceIndex);
    if (!locateErrors(sentence, [err]).length) {
      results.push({ errorIndex: t.errorIndex, category: t.category, outcome: "done", answer: sentence });
      return step(k + 1);
    }
    const token = ++stepSeq;  // späte Antworten (KI fragen) einer alten Aufgabe werden ignoriert
    let finished = false;
    let asking = false;
    let hints = 0;
    let shown = false;
    const spans = locateErrors(sentence, [err]);
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Aufgabe ${k + 1} von ${built.tasks.length} · ${esc(cat?.label)}</p>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${built.tasks.length}" aria-valuenow="${k}">
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" height="6" rx="3" width="${Math.round((k / built.tasks.length) * 100)}"/></svg></div>
        <h1>Verbessere den markierten Teil</h1></div>
      <section class="card stack">
        <p class="learner-text task-sentence" lang="en">${highlightHtml(sentence, spans, [err])}</p>
        <label for="answer">Dein verbesserter Satz</label>
        <textarea id="answer" class="answer" rows="3" spellcheck="false" lang="en">${esc(sentence)}</textarea>
        <div class="row">
          <button class="btn primary" id="check">Prüfen</button>
          <button class="btn" id="hint">Tipp</button>
          <button class="btn ghost" id="show">Lösung zeigen</button>
          <button class="btn ghost" id="skip">Überspringen</button>
        </div>
        <div id="help" aria-live="polite"></div>
        <div id="feedback" aria-live="polite"></div>
      </section>`;
    const $ = (id) => root.querySelector(`#${id}`);
    const answer = $("answer");
    answer.focus();
    const done = (outcome, text) => {
      edits[t.sentenceIndex] = text;
      results.push({ errorIndex: t.errorIndex, category: t.category, outcome, answer: text });
    };
    const next = () => step(k + 1);
    const success = (title, outcome, extra = "", text = answer.value.trim()) => {
      if (finished || token !== stepSeq) return;
      finished = true;
      done(outcome, text);
      for (const id of ["check", "hint", "show", "skip"]) $(id).disabled = true;
      answer.readOnly = true;
      $("feedback").innerHTML = `<div class="ok-box"><b>${esc(title)}</b>${extra}
        <p class="small">Korrektur: <del>${esc(err.quote)}</del> → <ins>${esc(err.correction)}</ins></p>
        <p class="small muted">${esc(err.explanation)}</p>
        <button class="btn primary" id="next">${k + 1 < built.tasks.length ? "Weiter" : "Zur Zusammenfassung"}</button></div>`;
      $("next").onclick = next;
      $("next").focus();
    };
    $("hint").onclick = () => {
      hints = Math.min(2, hints + 1);
      $("help").innerHTML = `<div class="hint-box"><p><b>Tipp 1 · ${esc(cat?.label)}:</b> ${esc(cat?.tip)}</p>
        ${hints >= 2 ? `<p><b>Tipp 2:</b> ${esc(err.explanation)}</p>` : ""}</div>`;
      if (hints >= 2) $("hint").disabled = true;
    };
    $("show").onclick = () => {
      shown = true;
      const expected = expectedSentence(sentence, t.quote, err.correction) ?? sentence;
      $("help").innerHTML = `<div class="hint-box"><p><b>Lösung:</b> <del>${esc(err.quote)}</del> → <ins>${esc(err.correction)}</ins></p>
        <p lang="en">${esc(expected)}</p><button class="btn small" id="take">Übernehmen</button></div>`;
      $("take").onclick = () => { answer.value = expected; $("check").click(); };
    };
    $("skip").onclick = () => {
      if (finished || asking) return;
      finished = true;
      results.push({ errorIndex: t.errorIndex, category: t.category, outcome: "skipped", answer: sentence });
      next();
    };
    $("check").onclick = () => {
      if (finished || asking) return;
      const res = checkAnswer(sentence, t.quote, err.correction, answer.value);
      const outcome = shown ? "shown" : hints ? "hint" : "solo";
      if (res === "exact" || res === "fixed") return success(shown ? "Übernommen." : "Richtig!", outcome);
      if (res === "unchanged") {
        $("feedback").innerHTML = '<p class="note">Du hast den markierten Teil noch nicht verändert.</p>';
        return;
      }
      $("feedback").innerHTML = `<div class="note"><p><b>Noch nicht ganz</b> – oder du hast eine andere richtige Lösung gefunden.</p>
        <div class="row">${provider ? '<button class="btn small" id="ask">KI fragen</button>' : ""}
        <button class="btn small ghost" id="self">Meine Lösung stimmt auch</button></div><div id="ai"></div></div>`;
      $("self").onclick = () => { if (!asking) success("Als richtig gezählt.", shown ? "shown" : "self"); };
      if (provider) {
        $("ask").onclick = async () => {
          if (asking || finished) return;
          asking = true;
          const asked = answer.value.trim();
          const lock = ["check", "show", "skip", "ask", "self"].map((id) => $(id)).filter(Boolean);
          for (const b of lock) b.disabled = true;
          answer.readOnly = true;
          const aiBox = $("ai");
          aiBox.innerHTML = `<div class="row muted small">${spinner}<span>KI prüft …</span></div>`;
          let verdict = null;
          try {
            verdict = await judgeRevision(provider, { sentence, answer: asked, quote: t.quote, correction: err.correction, category: t.category });
          } catch (er) {
            if (token === stepSeq) aiBox.innerHTML = `<p class="small">${errorText(er)}</p>`;
          }
          asking = false;
          if (token !== stepSeq || finished) return; // inzwischen weiter
          if (verdict?.correct) return success("Die KI sagt: richtig!", shown ? "shown" : "ai", `<p class="small">${esc(verdict.feedback)}</p>`, asked);
          if (verdict) aiBox.innerHTML = `<p class="small"><b>KI:</b> ${esc(verdict.feedback)}</p>`;
          for (const b of lock) b.disabled = false;
          answer.readOnly = false;
        };
      }
    };
    answer.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) $("check").click();
    });
  }

  function whole() {
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Ganzer Text</p><h1>Schreib deinen Text neu</h1>
        <p>Verbessere, was dir auffällt. Die Lösungen siehst du hier nicht – nur, wo etwas nicht stimmt, wenn du willst.</p></div>
      <div class="grid side">
        <section class="card stack">
          <label for="rewrite">Deine Überarbeitung</label>
          <textarea id="rewrite" spellcheck="false" lang="en">${esc(e.text)}</textarea>
          <div class="row"><button class="btn primary" id="done">Fertig</button></div>
        </section>
        <section class="card stack">
          <h2>Wo steckt was?</h2>
          <div class="row">${Object.entries(GROUPS).map(([g, info]) => `<span class="group-key"><i class="${g}"></i>${esc(info.label)} ${errorGroupCounts(errors)[g]}</span>`).join("")}</div>
          <ul class="points small">${[...new Set(errors.map((x) => x.category))].map((c) => `<li>${esc(categoryById(c)?.label)}</li>`).join("")}</ul>
          <label class="check"><input type="checkbox" id="marks"> Stellen im Original zeigen</label>
          <div id="orig" class="learner-text hidden" lang="en">${highlightHtml(e.text, locateErrors(e.text, errors), errors)}</div>
        </section>
      </div>`;
    root.querySelector("#marks").onchange = (ev) => root.querySelector("#orig").classList.toggle("hidden", !ev.target.checked);
    root.querySelector("#done").onclick = () => finish(root.querySelector("#rewrite").value);
  }

  function finish(revisedText) {
    const sum = summarizeRevision(results);
    const c = sum.counts;
    const solved = c.solo + c.hint + c.ai + c.self;
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Geschafft</p><h1>Deine überarbeitete Fassung</h1>
        ${mode === "steps" ? `<p>${solved} von ${built.tasks.length} selbst gelöst (${c.solo} ohne Hilfe, ${c.hint} mit Tipp${c.ai ? `, ${c.ai} von der KI bestätigt` : ""}${c.self ? `, ${c.self} selbst eingeschätzt` : ""})
          ${c.shown ? ` · ${c.shown} mit Lösung` : ""}${c.skipped ? ` · ${c.skipped} übersprungen` : ""}${c.done ? ` · ${c.done} schon miterledigt` : ""}.</p>` : ""}</div>
      ${sum.hard.length ? `<section class="card"><h2>Daran lohnt es sich zu üben</h2><ul class="points">${sum.hard.map((h) =>
        `<li><b>${esc(h.label)}</b> – ${esc(categoryById(h.id)?.tip)}</li>`).join("")}</ul></section>` : ""}
      <section class="card stack">
        <label for="final">Überarbeitete Fassung <span class="muted">(du kannst noch nachbessern)</span></label>
        <textarea id="final" spellcheck="false" lang="en">${esc(revisedText)}</textarea>
        <div id="status" role="status" aria-live="polite"></div>
        <div class="row">
          <button class="btn primary" id="rate" ${provider ? "" : "disabled"}>Neu bewerten lassen</button>
          <button class="btn" id="save">Nur speichern</button>
        </div>
        <p class="small muted">${provider ? "Neu bewerten legt einen neuen Text an und zeigt dir vorher gegen nachher." : "Zum Neubewerten brauchst du eine verbundene KI."}</p>
      </section>`;
    const $ = (id) => root.querySelector(`#${id}`);
    const status = $("status");
    const buttons = [$("rate"), $("save")];
    // Momentaufnahme vor jedem await – die Seite kann inzwischen verlassen worden sein.
    const record = () => ({ createdAt: new Date().toISOString(), mode, tasks: [...results], revisedText: $("final").value });
    const saveRevision = async (rec) => {
      const fresh = await store.getEntry(e.id);
      fresh.revisions = [...(fresh.revisions || []), rec];
      await store.putEntry(fresh);
    };
    $("save").onclick = async () => {
      for (const b of buttons) b.disabled = true;
      try {
        await saveRevision(record());
        ctx.toast("Überarbeitung gespeichert.");
        ctx.navigate(`#/e/${e.id}`);
      } catch (er) {
        status.innerHTML = `<p class="note">${errorText(er)}</p>`;
        buttons[1].disabled = false;
        buttons[0].disabled = !provider;
      }
    };
    $("rate").onclick = async () => {
      const text = $("final").value.trim();
      if (tokenize(text).length < MIN_WORDS) {
        status.innerHTML = `<p class="note">Zu kurz – mindestens ${MIN_WORDS} Wörter.</p>`;
        return;
      }
      const rec = { ...record(), revisedText: text };
      for (const b of buttons) b.disabled = true;
      status.innerHTML = `<div class="row muted">${spinner}<span>Wird bewertet … meist 10–40 Sekunden.</span></div>`;
      try {
        const [freq, analysis] = await Promise.all([ctx.loadFreq(), analyze(provider, text, e.topic)]);
        const metrics = computeMetrics(text, freq);
        const newId = await store.addEntry({
          createdAt: new Date().toISOString(), topic: e.topic, source: "typed", thumbs: [], text, analysis, metrics,
          scores: computeScores(metrics, analysis), model: { ocr: "", analysis: provider.model }, revisionOf: e.id,
          revisions: [], schemaVersion: 1,
        });
        await saveRevision({ ...rec, resultEntryId: newId });
        if (location.hash === `#/e/${e.id}/revise` && ctx.store === store) ctx.navigate(`#/e/${newId}`);
        else ctx.toast("Neubewertung fertig – zu finden in der Übersicht.");
      } catch (er) {
        if (document.body.contains(status)) {
          status.innerHTML = `<p class="note">${errorText(er)}<br>Deine Fassung bleibt im Feld.</p>`;
          for (const b of buttons) b.disabled = false;
        } else {
          ctx.toast(`Neubewertung fehlgeschlagen: ${er?.message || er}`);
        }
      }
    };
  }

  choose();
}
