// Aussprechen üben: Satz für Satz anhören, selbst sprechen, sich anhören, bewerten (selbst oder automatisch).
import { transcribeAudio } from "../../core/providers/audio.js";
import { alignWords, selfScore, speakingSentences, splitWords, summarizeSpeaking, SPEECH_TYPES } from "../../core/speech.js";
import { esc, spinner } from "../dom.js";
import { blobToWav, canRecognize, canRecord, canSpeak, MAX_SECONDS, speak, startRecording, stopSpeaking } from "../audio.js";

const SOURCES = { improved: "Verbesserte Fassung", revision: "Deine Überarbeitung", own: "Dein eigener Text" };
const errorText = (e) => esc(e?.message || String(e)) + (e?.detail ? `<br><span class="small muted">${esc(e.detail)}</span>` : "");

// Satz mit grün/rot markierten Wörtern (Wörter wie bei alignWords; alles escaped).
function markedHtml(sentence, tokens) {
  let k = 0;
  return splitWords(sentence).map((p) => {
    if (!p.word) return esc(p.text);
    const t = tokens[k++];
    return `<span class="${t?.ok ? "w-ok" : "w-miss"}">${esc(p.text)}</span>`;
  }).join("");
}

export async function render(root, ctx, [idParam]) {
  const store = ctx.store;
  const e = await store.getEntry(Number(idParam));
  if (!e) {
    root.innerHTML = '<div class="card"><h2>Text nicht gefunden</h2><a class="btn" href="#/">Zur Übersicht</a></div>';
    return;
  }
  const recordable = canRecord();
  const providers = ctx.demo || !recordable ? [] : (await ctx.providers()).filter((p) => SPEECH_TYPES.includes(p.type));
  const methods = [["self", "Selbst einschätzen"],
    ...providers.map((p) => [`p:${p.id}`, `Automatisch mit ${p.name}${p.type === "compatible" ? " (falls der Server Spracherkennung anbietet)" : ""}`]),
    ...(canRecognize() ? [["browser", "Automatisch mit der Browser-Erkennung"]] : [])];
  const saved = await store.getSetting("speechMethod");
  let method = methods.some(([k]) => k === saved) ? saved : "self";
  const speechModel = (await store.getSetting("speechModel")) || "";
  const sources = Object.keys(SOURCES).filter((s) => speakingSentences(e, s).length);
  let source = sources[0] || "own";
  const back = `<a href="#/e/${e.id}" class="small">← zurück zum Ergebnis</a>`;

  // Laufende Aufnahme und Wiedergabe: beim Satzwechsel und Verlassen immer aufräumen.
  let recording = null;
  let urls = [];
  let player = null;
  let viewGen = 0; // Satz-Ansicht: späte Ergebnisse alter Sätze werden verworfen
  let takeSeq = 0; // jede Aufnahme bekommt eine eigene Nummer
  const stopAll = () => {
    recording?.cancel();
    recording = null;
    player?.pause();
    player = null;
    stopSpeaking();
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  };
  window.addEventListener("hashchange", () => { viewGen++; stopAll(); }, { once: true });

  function setup() {
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Aussprechen üben</p><h1>${esc(e.topic || "Dein Text")}</h1>
        <p>Hör dir jeden Satz an, sprich ihn nach und hör dich selbst. So wird aus dem Schreiben Sprechen.</p></div>
      ${!recordable ? '<p class="note">Dieser Browser kann nicht aufnehmen – du kannst trotzdem anhören und dich selbst einschätzen.</p>' : ""}
      <section class="card stack">
        <div class="field"><label for="src">Was möchtest du sprechen?</label><select id="src">${sources.map((s) =>
          `<option value="${s}" ${s === source ? "selected" : ""}>${esc(SOURCES[s])} (${speakingSentences(e, s).length} Sätze)</option>`).join("")}</select></div>
        <div class="field"><label for="method">Bewertung</label><select id="method">${methods.map(([k, l]) =>
          `<option value="${esc(k)}" ${k === method ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
          <div class="hint" id="method-hint"></div></div>
        <label class="check"><input type="checkbox" id="slow"> Mustersprecher langsamer</label>
        <div class="row"><button class="btn primary" id="start">Los geht's</button></div>
      </section>`;
    const hint = () => {
      const m = root.querySelector("#method").value;
      root.querySelector("#method-hint").textContent = m === "self" ? "Du hörst dich selbst und entscheidest: flüssig, ging so oder schwer."
        : m === "browser" ? "Kostenlos – aber der Browser schickt deine Stimme an seinen Anbieter (bei Chrome an Google). Ohne „Mich anhören“."
          : `Deine Aufnahme (höchstens ${MAX_SECONDS} Sekunden) geht an deine KI und wird in Text umgewandelt. Gemessen wird, ob man dich versteht – nicht jede Lautfeinheit.`;
    };
    root.querySelector("#method").onchange = hint;
    hint();
    root.querySelector("#start").onclick = async () => {
      source = root.querySelector("#src").value;
      method = root.querySelector("#method").value;
      await store.setSetting("speechMethod", method).catch(() => {});
      run(speakingSentences(e, source), root.querySelector("#slow").checked);
    };
  }

  function run(sentences, slow) {
    const results = [];
    const provider = method.startsWith("p:") ? providers.find((p) => `p:${p.id}` === method) : null;

    const show = (i) => {
      stopAll();
      const my = ++viewGen;
      const current = () => my === viewGen;
      let lastTake = 0;
      if (i >= sentences.length) return finish(results);
      const sentence = sentences[i];
      let scored = null;
      let starting = false;
      root.innerHTML = `
        <div class="head">${back}<p class="kicker">Satz ${i + 1} von ${sentences.length} · ${esc(SOURCES[source])}</p>
          <div class="progress"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" height="6" rx="3" width="${Math.round((i / sentences.length) * 100)}"/></svg></div></div>
        <section class="card stack speak-card">
          <p class="speak-sentence" lang="en">${esc(sentence)}</p>
          <div class="row speak-controls">
            ${canSpeak() ? '<button class="btn listen">▶ Anhören</button>' : ""}
            ${recordable ? '<button class="btn primary rec">● Aufnehmen</button>' : ""}
            <button class="btn me hidden">▶ Mich anhören</button>
          </div>
          <div class="judge" aria-live="polite"></div>
          <div class="row"><button class="btn primary next hidden">${i + 1 < sentences.length ? "Weiter" : "Fertig"}</button>
            <button class="btn ghost skip">Überspringen</button></div>
        </section>`;
      // Elemente dieser Satz-Ansicht (nicht über IDs suchen – späte Ergebnisse sollen nichts Fremdes treffen)
      const el = (c) => root.querySelector(`.speak-card .${c}`);
      const sentenceEl = root.querySelector(".speak-sentence");
      const judge = el("judge");
      const nextBtn = el("next");
      const recBtn = el("rec");
      const setNext = (on) => nextBtn.classList.toggle("hidden", !on);
      const done = (res) => { scored = res; setNext(true); nextBtn.focus(); };
      const selfButtons = () => {
        judge.innerHTML = `<p class="small muted">Wie lief's?</p><div class="row">${[["good", "flüssig"], ["ok", "ging so"], ["hard", "schwer"]]
          .map(([k, l]) => `<button class="btn small rate" data-rate="${k}">${l}</button>`).join("")}</div>`;
        for (const b of judge.querySelectorAll("[data-rate]")) {
          b.onclick = () => {
            for (const x of judge.querySelectorAll("[data-rate]")) x.classList.toggle("chosen", x === b);
            done({ i, score: selfScore(b.dataset.rate), missed: [] });
          };
        }
      };
      const retry = (msg) => {
        judge.innerHTML = `<p class="note">${msg}</p><div class="row"><button class="btn small self-instead">Selbst einschätzen</button></div>`;
        judge.querySelector(".self-instead").onclick = selfButtons;
      };
      const showAlignment = (heard) => {
        if (!String(heard || "").trim()) return retry("Es wurde nichts erkannt – bitte noch einmal deutlich sprechen.");
        const a = alignWords(sentence, heard);
        sentenceEl.innerHTML = markedHtml(sentence, a.tokens);
        judge.innerHTML = `<p><b class="speak-score">${a.score} %</b> verstanden</p>
          <p class="small muted">Gehört: „${esc(heard)}“</p>
          ${a.missed.length ? `<p class="small">Nochmal üben: ${a.missed.map((w) => `<span class="chip">${esc(w)}</span>`).join(" ")}</p>` : ""}`;
        done({ i, score: a.score, missed: a.missed });
      };
      const evaluate = async (take, takeId) => {
        const fresh = () => takeId === lastTake && current();
        if (method === "self") return selfButtons();
        if (take.error) return retry(esc(take.error));
        if (method === "browser") {
          const best = take.alternatives.map((h) => ({ h, s: alignWords(sentence, h).score })).sort((x, y) => y.s - x.s)[0];
          return showAlignment(best?.h || "");
        }
        judge.innerHTML = `<div class="row muted">${spinner}<span>Wird geprüft …</span></div>`;
        try {
          const heard = await transcribeAudio(provider, await blobToWav(take.blob), { model: speechModel });
          if (fresh()) showAlignment(heard);
        } catch (er) {
          if (fresh()) retry(errorText(er));
        }
      };
      const stopRec = async () => {
        if (!recording) return;
        const r = recording;
        recording = null;
        recBtn.disabled = true;
        const take = await r.stop();
        if (!current()) { if (take.url) URL.revokeObjectURL(take.url); return; }
        recBtn.disabled = false;
        recBtn.textContent = "● Neu aufnehmen";
        recBtn.classList.remove("recording");
        if (take.url) {
          urls.push(take.url);
          player = new Audio(take.url);
          el("me").classList.remove("hidden");
        }
        sentenceEl.textContent = sentence;
        lastTake = ++takeSeq;
        evaluate(take, lastTake);
      };
      el("listen")?.addEventListener("click", () => speak(sentence, { slow }));
      recBtn?.addEventListener("click", async () => {
        if (recording) return stopRec();
        if (starting) return;
        starting = true;
        recBtn.disabled = true;
        stopSpeaking();
        player?.pause();
        scored = null;
        setNext(false);
        judge.innerHTML = "";
        try {
          const r = await startRecording({ recognize: method === "browser", onAutoStop: () => stopRec() });
          if (!root.contains(recBtn)) { r.cancel(); return; } // inzwischen weiter
          recording = r;
          recBtn.textContent = "■ Stopp";
          recBtn.classList.add("recording");
        } catch (er) {
          judge.innerHTML = `<p class="note">Kein Zugriff aufs Mikrofon (${esc(er?.message || er)}). Erlaube es in den Browser-Einstellungen.</p>`;
        } finally {
          starting = false;
          recBtn.disabled = false;
        }
      });
      el("me").addEventListener("click", () => { player?.play(); });
      if (!recordable) selfButtons();
      nextBtn.onclick = () => { if (scored && !recording) { results.push(scored); show(i + 1); } };
      el("skip").onclick = () => show(i + 1);
    };
    show(0);
  }

  function finish(results) {
    stopAll();
    const sum = summarizeSpeaking(results);
    const methodKey = method === "self" ? "self" : method === "browser" ? "browser" : "ai";
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Aussprache</p><h1>${results.length ? `${sum.score} %` : "Nichts bewertet"}</h1>
        <p>${results.length} von ${speakingSentences(e, source).length} Sätzen ${methodKey === "self" ? "selbst eingeschätzt" : "geprüft"}.</p></div>
      ${sum.missed.length ? `<section class="card"><h2>Diese Wörter noch üben</h2><p>${sum.missed.map((w) => `<span class="chip">${esc(w)}</span>`).join(" ")}</p>
        <p class="small muted">Tipp: einzeln anhören und laut nachsprechen, dann den Satz noch einmal.</p></section>` : ""}
      <div id="save-status" role="status"></div>
      <div class="row"><button class="btn primary" id="save" ${results.length ? "" : "disabled"}>Speichern</button><a class="btn" href="#/e/${e.id}">Ohne Speichern zurück</a></div>`;
    const btn = root.querySelector("#save");
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const fresh = await store.getEntry(e.id);
        if (!fresh) throw new Error("Der Text wurde inzwischen gelöscht.");
        fresh.speaking = [...(fresh.speaking || []), { createdAt: new Date().toISOString(), method: methodKey, source, score: sum.score,
          sentences: results.map((r) => ({ i: r.i, score: r.score })), missed: sum.missed }].slice(-50);
        await store.putEntry(fresh);
        ctx.toast("Aussprache gespeichert.");
        ctx.navigate(`#/e/${e.id}`);
      } catch (er) {
        root.querySelector("#save-status").innerHTML = `<p class="note">${errorText(er)}</p>`;
        btn.disabled = false;
      }
    };
  }

  if (!sources.length) {
    root.innerHTML = `<div class="card">${back}<h2>Kein Text zum Sprechen</h2></div>`;
    return;
  }
  setup();
}
