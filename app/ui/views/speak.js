// Aussprechen üben: Satz für Satz anhören, selbst sprechen, sich anhören, bewerten (selbst oder automatisch).
import { transcribeAudio } from "../../core/providers/audio.js";
import { alignWords, selfScore, speakingSentences, summarizeSpeaking, SPEECH_TYPES } from "../../core/speech.js";
import { esc, spinner } from "../dom.js";
import { blobToWav, canRecognize, canRecord, canSpeak, speak, startRecording, stopSpeaking } from "../audio.js";

const SOURCES = { improved: "Verbesserte Fassung", revision: "Deine Überarbeitung", own: "Dein eigener Text" };
const errorText = (e) => esc(e?.message || String(e)) + (e?.detail ? `<br><span class="small muted">${esc(e.detail)}</span>` : "");

export async function render(root, ctx, [idParam]) {
  const store = ctx.store;
  const e = await store.getEntry(Number(idParam));
  if (!e) {
    root.innerHTML = '<div class="card"><h2>Text nicht gefunden</h2><a class="btn" href="#/">Zur Übersicht</a></div>';
    return;
  }
  const providers = ctx.demo ? [] : (await ctx.providers()).filter((p) => SPEECH_TYPES.includes(p.type));
  const methods = [["self", "Selbst einschätzen"],
    ...providers.map((p) => [`p:${p.id}`, `Automatisch mit ${p.name}`]),
    ...(canRecognize() ? [["browser", "Automatisch mit der Browser-Erkennung"]] : [])];
  const saved = await store.getSetting("speechMethod");
  let method = methods.some(([k]) => k === saved) ? saved : "self";
  const speechModel = (await store.getSetting("speechModel")) || "";
  const sources = Object.keys(SOURCES).filter((s) => speakingSentences(e, s).length);
  let source = sources[0] || "own";
  const back = `<a href="#/e/${e.id}" class="small">← zurück zum Ergebnis</a>`;
  let recording = null;
  const cleanupAudio = () => { recording?.cancel(); recording = null; stopSpeaking(); };
  window.addEventListener("hashchange", cleanupAudio, { once: true });

  function setup() {
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Aussprechen üben</p><h1>${esc(e.topic || "Dein Text")}</h1>
        <p>Hör dir jeden Satz an, sprich ihn nach und hör dich selbst. So wird aus dem Schreiben Sprechen.</p></div>
      ${!canRecord() ? '<p class="note">Dieser Browser kann nicht aufnehmen – du kannst trotzdem anhören und dich selbst einschätzen.</p>' : ""}
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
        : m === "browser" ? "Kostenlos – aber der Browser schickt deine Aufnahme an seinen Anbieter (bei Chrome an Google)."
          : "Deine Aufnahme geht an deine KI und wird in Text umgewandelt. Gemessen wird, ob man dich versteht – nicht jede Lautfeinheit.";
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
      if (i >= sentences.length) return finish(results);
      const sentence = sentences[i];
      let take = null;     // { blob, url, alternatives }
      let scored = null;
      root.innerHTML = `
        <div class="head">${back}<p class="kicker">Satz ${i + 1} von ${sentences.length} · ${esc(SOURCES[source])}</p>
          <div class="progress"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" height="6" rx="3" width="${Math.round((i / sentences.length) * 100)}"/></svg></div></div>
        <section class="card stack speak-card">
          <p class="speak-sentence" lang="en" id="sentence">${esc(sentence)}</p>
          <div class="row speak-controls">
            ${canSpeak() ? '<button class="btn" id="listen">▶ Anhören</button>' : ""}
            ${canRecord() ? '<button class="btn primary" id="rec">● Aufnehmen</button>' : ""}
            <button class="btn hidden" id="me">▶ Mich anhören</button>
          </div>
          <div id="judge" aria-live="polite"></div>
          <div class="row"><button class="btn primary hidden" id="next">${i + 1 < sentences.length ? "Weiter" : "Fertig"}</button>
            <button class="btn ghost" id="skip">Überspringen</button></div>
        </section>`;
      const $ = (id) => root.querySelector(`#${id}`);
      const judge = $("judge");
      let audioEl = null;
      const done = (res) => {
        scored = res;
        $("next").classList.remove("hidden");
        $("next").focus();
      };
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
      const showAlignment = (heard) => {
        const a = alignWords(sentence, heard);
        $("sentence").innerHTML = a.tokens.length
          ? esc(sentence).replace(/[A-Za-z]+(?:['’][A-Za-z]+)*['’]?/g, (() => { let k = 0; return (w) => { const t = a.tokens[k++]; return `<span class="${t?.ok ? "w-ok" : "w-miss"}">${w}</span>`; }; })())
          : esc(sentence);
        judge.innerHTML = `<p><b class="speak-score">${a.score} %</b> verstanden</p>
          <p class="small muted">Gehört: „${esc(heard || "…")}“</p>
          ${a.missed.length ? `<p class="small">Nochmal üben: ${a.missed.map((w) => `<span class="chip">${esc(w)}</span>`).join(" ")}</p>` : ""}
          <div class="row"><button class="btn small ghost" id="again">Noch mal aufnehmen</button></div>`;
        $("again").onclick = () => { judge.innerHTML = ""; $("next").classList.add("hidden"); scored = null; };
        done({ i, score: a.score, missed: a.missed });
      };
      const evaluate = async () => {
        if (method === "self") return selfButtons();
        if (method === "browser") {
          const best = (take.alternatives || []).map((h) => ({ h, s: alignWords(sentence, h).score })).sort((x, y) => y.s - x.s)[0];
          return showAlignment(best?.h || "");
        }
        judge.innerHTML = `<div class="row muted">${spinner}<span>Wird geprüft …</span></div>`;
        try {
          const wav = await blobToWav(take.blob);
          const heard = await transcribeAudio(provider, wav, { model: speechModel });
          if (root.querySelector("#sentence")) showAlignment(heard);
        } catch (er) {
          judge.innerHTML = `<p class="note">${errorText(er)}</p><div class="row"><button class="btn small" id="self-instead">Selbst einschätzen</button></div>`;
          $("self-instead").onclick = selfButtons;
        }
      };
      $("listen")?.addEventListener("click", () => speak(sentence, { slow }));
      $("rec")?.addEventListener("click", async () => {
        const btn = $("rec");
        if (!recording) {
          stopSpeaking();
          try {
            recording = await startRecording({ recognize: method === "browser" });
          } catch (er) {
            judge.innerHTML = `<p class="note">Kein Zugriff aufs Mikrofon (${esc(er?.message || er)}). Erlaube es in den Browser-Einstellungen.</p>`;
            return;
          }
          btn.textContent = "■ Stopp";
          btn.classList.add("recording");
          return;
        }
        btn.disabled = true;
        const r = recording;
        recording = null;
        take = await r.stop();
        btn.disabled = false;
        btn.textContent = "● Neu aufnehmen";
        btn.classList.remove("recording");
        $("me").classList.remove("hidden");
        audioEl = new Audio(take.url);
        $("sentence").textContent = sentence;
        evaluate();
      });
      $("me").addEventListener("click", () => { audioEl?.play(); });
      if (!canRecord() && method === "self") selfButtons();
      $("next").onclick = () => { if (scored) { results.push(scored); audioEl?.pause(); show(i + 1); } };
      $("skip").onclick = () => { recording?.cancel(); recording = null; audioEl?.pause(); show(i + 1); };
    };
    show(0);
  }

  async function finish(results) {
    const sum = summarizeSpeaking(results);
    const methodKey = method === "self" ? "self" : method === "browser" ? "browser" : "ai";
    root.innerHTML = `
      <div class="head">${back}<p class="kicker">Aussprache</p><h1>${results.length ? `${sum.score} %` : "Nichts bewertet"}</h1>
        <p>${results.length} von ${speakingSentences(e, source).length} Sätzen ${methodKey === "self" ? "selbst eingeschätzt" : "geprüft"}.</p></div>
      ${sum.missed.length ? `<section class="card"><h2>Diese Wörter noch üben</h2><p>${sum.missed.map((w) => `<span class="chip">${esc(w)}</span>`).join(" ")}</p>
        <p class="small muted">Tipp: einzeln anhören und laut nachsprechen, dann den Satz noch einmal.</p></section>` : ""}
      <div class="row"><button class="btn primary" id="save" ${results.length ? "" : "disabled"}>Speichern</button><a class="btn" href="#/e/${e.id}">Ohne Speichern zurück</a></div>`;
    root.querySelector("#save").onclick = async (ev) => {
      ev.currentTarget.disabled = true;
      const fresh = await store.getEntry(e.id);
      fresh.speaking = [...(fresh.speaking || []), { createdAt: new Date().toISOString(), method: methodKey, source, score: sum.score,
        sentences: results.map((r) => ({ i: r.i, score: r.score })), missed: sum.missed }].slice(-50);
      await store.putEntry(fresh);
      ctx.toast("Aussprache gespeichert.");
      ctx.navigate(`#/e/${e.id}`);
    };
  }

  if (!sources.length) {
    root.innerHTML = `<div class="card">${back}<h2>Kein Text zum Sprechen</h2></div>`;
    return;
  }
  setup();
}
