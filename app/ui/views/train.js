// Grammatik-Training: Schwächenprofil („Deine Baustellen“) und Übungsrunden je Fehlerart.
import { generateDrill, judgeRevision } from "../../core/ai.js";
import { checkExercise, ownExercises } from "../../core/drill.js";
import { categoryById } from "../../core/taxonomy.js";
import { weaknessProfile } from "../../core/weakness.js";
import { esc, fmtDate, spinner } from "../dom.js";
import { barSvg } from "../charts.js";

const TREND = { better: "wird besser", worse: "mehr geworden", flat: "" };
const ROUND_AI = 6;
const errorText = (e) => esc(e?.message || String(e)) + (e?.detail ? `<br><span class="small muted">${esc(e.detail)}</span>` : "");

export async function profileFor(store) {
  const [entries, drills] = await Promise.all([store.listEntries(), store.getSetting("drills")]);
  return weaknessProfile(entries, drills || []);
}

export function weaknessListHtml(list, { limit = Infinity } = {}) {
  const max = Math.max(...list.map((w) => w.score), 0.01);
  return `<ul class="weak-list">${list.slice(0, limit).map((w) => `<li>
    <div class="row between"><span><span class="group-key"><i class="${esc(w.group)}"></i></span><b>${esc(w.label)}</b>
      ${w.trend !== "flat" ? `<span class="chip trend-${w.trend}">${TREND[w.trend]}</span>` : ""}</span>
      <a class="btn small" href="#/train/${esc(w.id)}">Üben</a></div>
    <div class="bar">${barSvg(w.score, max)}</div>
    <p class="small muted">${w.errorCount} Fehler in deinen letzten Texten
      ${w.lastDrill ? ` · zuletzt geübt am ${esc(fmtDate(w.lastDrill.createdAt))}: ${w.lastDrill.correct}/${w.lastDrill.total}` : ""}</p>
  </li>`).join("")}</ul>`;
}

export async function render(root, ctx) {
  const list = await profileFor(ctx.store);
  root.innerHTML = `
    <div class="head"><a href="#/learn" class="small">← Lernen</a><p class="kicker">Grammatik-Training</p><h1>Deine Baustellen</h1>
      <p>Aus deinen letzten Texten, Überarbeitungen und Übungen: Diese Fehlerarten bremsen dich gerade am meisten.
      Neuere Texte zählen mehr. Eine Runde mischt deine eigenen Fehler mit neuen Übungen deiner KI.</p></div>
    ${list.length ? `<section class="card">${weaknessListHtml(list)}</section>`
      : '<div class="card"><p>Noch keine Grammatikfehler gefunden – schreib ein paar Texte, dann zeigt sich hier, was du üben solltest.</p><a class="btn primary" href="#/new">Neuer Text</a></div>'}
    <p class="small muted">Wortschatz übst du mit den Karteikarten.</p>`;
}

function exerciseHtml(ex, i, n, label) {
  const body = ex.type === "choose"
    ? `<p class="drill-prompt" lang="en">${esc(ex.prompt).replace(/_{3,}/g, '<span class="gap">___</span>')}</p>
       <div class="choices">${ex.options.map((o, k) => `<button class="btn choice" data-opt="${k}" lang="en">${esc(o)}</button>`).join("")}</div>`
    : ex.type === "fill"
      ? `<p class="drill-prompt" lang="en">${esc(ex.prompt).replace(/_{3,}/g, '<span class="gap">___</span>')}</p>
         <label for="answer" class="sr-only">Deine Antwort</label>
         <input type="text" id="answer" autocomplete="off" autocapitalize="off" spellcheck="false" lang="en" placeholder="Antwort">
         <div class="row"><button class="btn primary" id="check">Prüfen</button></div>`
      : `<label for="answer">Dein verbesserter Satz</label>
         <textarea id="answer" class="answer" rows="3" spellcheck="false" lang="en">${esc(ex.prompt)}</textarea>
         <div class="row"><button class="btn primary" id="check">Prüfen</button></div>`;
  return `
    <div class="head"><a href="#/train" class="small">← Baustellen</a>
      <p class="kicker">Übung ${i + 1}${n ? ` von ${n}` : ""} · ${esc(label)}${ex.source === "own" ? " · aus deinem Text" : ""}</p>
      <div class="progress"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" height="6" rx="3" width="${n ? Math.round((i / n) * 100) : 0}"/></svg></div>
      <h1>${esc(ex.instruction)}</h1></div>
    <section class="card stack">${body}<div id="feedback" aria-live="polite"></div></section>`;
}

export async function renderSession(root, ctx, [category]) {
  const cat = categoryById(category);
  if (!cat) {
    root.innerHTML = '<div class="card"><h2>Unbekannte Fehlerart</h2><a class="btn" href="#/train">Zurück</a></div>';
    return;
  }
  const store = ctx.store;
  const entries = await store.listEntries();
  const provider = ctx.demo ? null : await ctx.providerFor("analysis");
  const exercises = ownExercises(entries, category, 3);
  const results = [];
  let aiState = provider ? "loading" : "off";
  let aiError = null;
  let waiting = null; // Funktion, die bei Ankunft der KI-Übungen weiterzeigt
  let current = -1;
  const token = {};
  ctx.trainToken = token; // eine neue Runde macht alte Rückmeldungen wirkungslos

  if (provider) {
    generateDrill(provider, {
      category, level: entries.find((e) => e.analysis)?.analysis.cefr, examples: exercises.map((x) => x.prompt),
      topics: entries.map((e) => e.topic).filter(Boolean), count: ROUND_AI,
    }).then((list) => {
      if (ctx.trainToken !== token) return;
      exercises.push(...list);
      aiState = "done";
    }).catch((e) => {
      if (ctx.trainToken !== token) return;
      aiState = "error";
      aiError = e;
    }).finally(() => {
      if (ctx.trainToken === token && waiting) { const w = waiting; waiting = null; w(); }
    });
  }

  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    const total = results.length;
    const correct = results.filter(Boolean).length;
    if (total) {
      const drills = (await store.getSetting("drills")) || [];
      drills.push({ createdAt: new Date().toISOString(), category, total, correct });
      await store.setSetting("drills", drills.slice(-500)).catch(() => {});
    }
    root.innerHTML = `
      <div class="head"><p class="kicker">${esc(cat.label)}</p><h1>${total ? `${correct} von ${total} richtig` : "Keine Übungen"}</h1>
        ${aiState === "error" ? `<p class="note">Die KI-Übungen konnten nicht geladen werden: ${errorText(aiError)}</p>` : ""}
        ${aiState === "off" && !ctx.demo ? '<p class="muted">Mit einer verbundenen KI bekommst du zusätzlich neue Übungen zu dieser Fehlerart.</p>' : ""}</div>
      <section class="card"><h2>Merksatz</h2><p>${esc(cat.tip)}</p></section>
      <div class="row"><a class="btn primary" href="#/train/${esc(category)}" id="again">Noch eine Runde</a><a class="btn" href="#/train">Zu den Baustellen</a></div>`;
    root.querySelector("#again").onclick = (ev) => { ev.preventDefault(); renderSession(root, ctx, [category]); };
  };

  const next = () => {
    if (ctx.trainToken !== token || !root.isConnected && current >= 0) return;
    current++;
    if (current < exercises.length) return show(exercises[current]);
    if (aiState === "loading") {
      root.innerHTML = `<div class="head"><p class="kicker">${esc(cat.label)}</p><h1>Neue Übungen werden erstellt …</h1></div>
        <div class="row muted">${spinner}<span>Deine KI schreibt Übungen, die zu dir passen.</span></div>`;
      current--;
      waiting = next;
      return;
    }
    finish();
  };

  const show = (ex) => {
    const n = aiState === "loading" ? 0 : exercises.length; // Gesamtzahl erst, wenn die KI-Übungen da sind
    root.innerHTML = exerciseHtml(ex, current, n, cat.label);
    const fb = root.querySelector("#feedback");
    let answered = false;
    const done = (ok, given) => {
      if (answered) return;
      answered = true;
      results.push(ok);
      for (const b of root.querySelectorAll("button.choice, #check")) b.disabled = true;
      const input = root.querySelector("#answer");
      if (input) input.readOnly = true;
      fb.innerHTML = `<div class="${ok ? "ok-box" : "note"}"><b>${ok ? "Richtig!" : "Nicht ganz."}</b>
        ${ok ? "" : `<p>Lösung: <ins lang="en">${esc(ex.answer)}</ins></p>`}
        ${ex.explanation ? `<p class="small">${esc(ex.explanation)}</p>` : ""}
        <div class="row" id="after">${!ok && ex.type !== "choose" ? `${ex.type === "fix" && provider ? '<button class="btn small" id="ask">KI fragen</button>' : ""}
          <button class="btn small ghost" id="mine">Meine Antwort stimmt auch</button>` : ""}
          <button class="btn primary" id="next">Weiter</button></div><div id="ai"></div></div>`;
      root.querySelector("#next").onclick = (ev) => { ev.currentTarget.disabled = true; next(); };
      root.querySelector("#next").focus();
      root.querySelector("#mine")?.addEventListener("click", () => {
        results[results.length - 1] = true;
        root.querySelector("#mine").remove();
        root.querySelector("#ask")?.remove();
        fb.querySelector("b").textContent = "Als richtig gezählt.";
      });
      root.querySelector("#ask")?.addEventListener("click", async () => {
        const ask = root.querySelector("#ask");
        ask.disabled = true;
        const box = root.querySelector("#ai");
        box.innerHTML = `<div class="row muted small">${spinner}<span>KI prüft …</span></div>`;
        const idx = results.length - 1;
        try {
          const r = await judgeRevision(provider, { sentence: ex.prompt, answer: given, quote: ex.quote || ex.prompt, correction: ex.correction ?? ex.answer, category });
          if (!box.isConnected) return;
          box.innerHTML = `<p class="small"><b>KI:</b> ${esc(r.feedback)}</p>`;
          if (r.correct) {
            results[idx] = true;
            fb.querySelector("b").textContent = "Die KI sagt: richtig!";
            root.querySelector("#mine")?.remove();
          }
        } catch (e) {
          if (box.isConnected) box.innerHTML = `<p class="small">${errorText(e)}</p>`;
        }
        if (ask.isConnected) ask.remove();
      });
    };
    if (ex.type === "choose") {
      for (const b of root.querySelectorAll("button.choice")) {
        b.onclick = () => {
          const pick = ex.options[Number(b.dataset.opt)];
          const ok = checkExercise(ex, pick, category);
          b.classList.add(ok ? "picked-ok" : "picked-bad");
          if (!ok) root.querySelector(`button.choice[data-opt="${ex.options.indexOf(ex.answer)}"]`)?.classList.add("picked-ok");
          done(ok, pick);
        };
      }
    } else {
      const input = root.querySelector("#answer");
      input.focus();
      const check = () => {
        const v = input.value;
        if (!v.trim() || (ex.type === "fix" && v.trim() === ex.prompt.trim())) {
          fb.innerHTML = '<p class="note">Erst eine Antwort eingeben bzw. den Satz verändern.</p>';
          return;
        }
        done(checkExercise(ex, v, category), v.trim());
      };
      root.querySelector("#check").onclick = check;
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ex.type === "fill" || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); if (!answered) check(); }
      });
    }
  };

  if (!exercises.length && aiState === "off") {
    root.innerHTML = `<div class="head"><a href="#/train" class="small">← Baustellen</a><p class="kicker">${esc(cat.label)}</p>
      <h1>Keine Übungen verfügbar</h1><p>In deinen Texten gibt es dazu noch keine Sätze, und ${ctx.demo ? "in der Demo" : "ohne verbundene KI"} können keine neuen Übungen erstellt werden.</p></div>
      <section class="card"><h2>Merksatz</h2><p>${esc(cat.tip)}</p></section>`;
    return;
  }
  next();
}
