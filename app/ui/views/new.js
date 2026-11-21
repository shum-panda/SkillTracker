// Neuer Text: Foto oder Tippen → Einlesen → Prüfen → Bewerten → speichern.
import { analyze, transcribe } from "../../core/ai.js";
import { computeMetrics } from "../../core/metrics.js";
import { computeScores, reliability, MIN_WORDS, RELIABLE_WORDS } from "../../core/scores.js";
import { tokenize } from "../../core/text.js";
import { esc, spinner } from "../dom.js";
import { prepareImage } from "../image.js";
import { renderEntry } from "./entry.js";

const errorText = (e) => esc(e?.message || String(e)) + (e?.detail ? `<br><span class="small muted">${esc(e.detail)}</span>` : "");

// Eine laufende Bewertung überlebt das Wegnavigieren (sie kostet Geld) – aber es gibt immer nur eine.
let running = null;   // { controller }
let page = null;      // Elemente der aktuell angezeigten Seite "Neuer Text" (oder null)

const onPage = () => location.hash === "#/new" && page && document.body.contains(page.root);

export async function render(root, ctx) {
  const store = ctx.store;
  const draft = (await store.getSetting("draft")) || { text: "", topic: "", thumb: "", source: "typed" };
  const ocr = await ctx.providerFor("ocr");
  const analysisProvider = await ctx.providerFor("analysis");
  let image = null;         // vorbereitetes Foto (nur im Speicher)
  let ocrController = null; // laufendes Einlesen

  root.innerHTML = `
    <div class="head"><p class="kicker">Neuer Text</p><h1>Schreib etwas auf Englisch</h1>
      <p>Am besten von Hand, 80–200 Wörter, zu einem Thema, das dich beschäftigt. Fehlt dir ein Wort, schreib es auf Deutsch
      oder mit einem <span class="mono">?</span> davor – daraus werden später Karteikarten.</p></div>
    ${!analysisProvider ? `<div class="note">${ctx.demo ? "In der Demo kann nicht bewertet werden – dafür brauchst du eine eigene KI."
      : "Noch keine KI verbunden."} <a href="#/settings">KI verbinden</a></div>` : ""}
    <div class="grid side">
      <section class="card stack">
        <div class="field"><label for="topic">Thema <span class="muted">(optional)</span></label>
          <input type="text" id="topic" maxlength="200" placeholder="z. B. My weekend" value="${esc(draft.topic)}"></div>
        <div class="field"><label for="text">Dein Text</label>
          <textarea id="text" spellcheck="false" autocapitalize="sentences" placeholder="Write here … oder Foto einlesen">${esc(draft.text)}</textarea>
          <div class="row between small"><span id="count" class="muted"></span><span id="unclear" class="muted"></span></div>
        </div>
        <div id="status" role="status" aria-live="polite"></div>
        <div class="row">
          <button class="btn primary" id="analyze" ${analysisProvider ? "" : "disabled"}>Bewerten</button>
          <button class="btn ghost hidden" id="cancel">Abbrechen</button>
          <button class="btn ghost" id="clear">Leeren</button>
        </div>
        <p class="small muted">${analysisProvider ? `Bewertung mit ${esc(analysisProvider.name)} · ${esc(analysisProvider.model)}` : ""}</p>
      </section>
      <section class="card stack">
        <h2>Foto einlesen</h2>
        <p class="muted small">Gutes Licht, Blatt gerade von oben. Die KI schreibt deinen Text ab, <b>ohne</b> ihn zu verbessern –
        prüf danach, ob sie alles richtig gelesen hat.</p>
        <label class="btn" for="photo">Foto aufnehmen oder wählen</label>
        <input class="sr-only" type="file" id="photo" accept="image/*">
        <img id="thumb" class="thumb ${draft.thumb ? "" : "hidden"}" alt="Vorschau des Fotos" src="${esc(draft.thumb || "")}">
        <button class="btn" id="read" disabled>Text einlesen</button>
        <p class="small muted">${ocr ? `Einlesen mit ${esc(ocr.name)} · ${esc(ocr.model)}` : "Zum Einlesen brauchst du eine KI, die Bilder versteht."}</p>
      </section>
    </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const textEl = $("text");
  const topicEl = $("topic");
  const status = $("status");
  let thumb = draft.thumb || "";
  let source = draft.source || "typed";

  let saveTimer;
  const saveDraft = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.setSetting("draft", { text: textEl.value, topic: topicEl.value, thumb, source }).catch(() => {}), 400);
  };
  const updateCount = () => {
    const n = tokenize(textEl.value).length;
    const r = reliability(n);
    $("count").textContent = `${n} Wörter` + (r === "too_short" ? ` – mindestens ${MIN_WORDS} zum Bewerten`
      : r === "short" ? ` – unter ${RELIABLE_WORDS} schwanken die Werte` : "");
    const unclear = (textEl.value.match(/\[\?\]/g) || []).length;
    $("unclear").textContent = unclear ? `${unclear}× [?] – bitte prüfen` : "";
  };
  updateCount();
  textEl.addEventListener("input", () => { updateCount(); saveDraft(); });
  topicEl.addEventListener("input", saveDraft);

  const setBusy = (label, cancellable) => {
    status.innerHTML = `<div class="row muted">${spinner}<span>${esc(label)}</span></div>`;
    $("cancel").classList.toggle("hidden", !cancellable);
    for (const id of ["analyze", "read", "clear"]) $(id).disabled = true;
  };
  const idle = () => {
    $("cancel").classList.add("hidden");
    $("analyze").disabled = !analysisProvider || !!running;
    $("read").disabled = !(image && ocr) || !!running;
    $("clear").disabled = !!running;
  };
  page = { root, status, idle };

  $("cancel").onclick = () => { ocrController?.abort(); running?.controller.abort(); };
  $("clear").onclick = async () => {
    textEl.value = "";
    topicEl.value = "";
    thumb = "";
    image = null;
    source = "typed";
    $("thumb").classList.add("hidden");
    status.textContent = "";
    updateCount();
    idle();
    await store.setSetting("draft", null).catch(() => {});
  };

  $("photo").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    status.innerHTML = `<div class="row muted">${spinner}<span>Foto wird vorbereitet …</span></div>`;
    try {
      image = await prepareImage(file);
      thumb = image.thumb;
      $("thumb").src = thumb;
      $("thumb").classList.remove("hidden");
      status.textContent = ocr ? "Foto bereit – jetzt „Text einlesen“." : "";
      saveDraft();
    } catch (e) {
      image = null;
      status.innerHTML = `<p class="note">${errorText(e)}</p>`;
    }
    idle();
  });

  $("read").onclick = async () => {
    if (!image || !ocr) return;
    if (textEl.value.trim() && !confirm("Der vorhandene Text wird durch den eingelesenen ersetzt. Weiter?")) return;
    ocrController = new AbortController();
    const stop = () => ocrController?.abort(); // Einlesen ist billig: beim Wegnavigieren abbrechen
    window.addEventListener("hashchange", stop, { once: true });
    setBusy("Text wird eingelesen …", true);
    try {
      textEl.value = await transcribe(ocr, image, { signal: ocrController.signal });
      source = "photo";
      updateCount();
      saveDraft();
      status.innerHTML = '<p class="note">Eingelesen. Bitte vergleiche mit deinem Blatt und korrigiere Lesefehler, <b>nicht</b> deine eigenen Fehler.</p>';
      textEl.focus();
    } catch (e) {
      status.innerHTML = `<p class="note">${errorText(e)}</p>`;
    }
    window.removeEventListener("hashchange", stop);
    ocrController = null;
    idle();
  };

  $("analyze").onclick = () => {
    if (running) return;
    const text = textEl.value.trim();
    if (tokenize(text).length < MIN_WORDS) {
      status.innerHTML = `<p class="note">Zu kurz – schreib mindestens ${MIN_WORDS} Wörter.</p>`;
      return;
    }
    clearTimeout(saveTimer);
    const topic = topicEl.value.trim().slice(0, 200);
    const job = { controller: new AbortController() };
    running = job;
    const snapshot = { text, topic, source, thumb: source === "photo" ? thumb : "" };
    store.setSetting("draft", { text, topic, thumb, source }).catch(() => {});
    setBusy("Wird bewertet … das dauert meist 10–40 Sekunden. Du kannst solange woanders hin.", true);
    runAnalysis(ctx, store, analysisProvider, ocr, snapshot, job);
  };

  if (running) setBusy("Eine Bewertung läuft noch …", true);
  else idle();
}

async function runAnalysis(ctx, store, provider, ocr, snap, job) {
  let entry;
  try {
    const [freq, analysis] = await Promise.all([ctx.loadFreq(), analyze(provider, snap.text, snap.topic, { signal: job.controller.signal })]);
    const metrics = computeMetrics(snap.text, freq);
    entry = {
      createdAt: new Date().toISOString(), topic: snap.topic, source: snap.source, thumb: snap.thumb,
      text: snap.text, analysis, metrics, scores: computeScores(metrics, analysis),
      model: { ocr: snap.source === "photo" && ocr ? ocr.model : "", analysis: provider.model }, schemaVersion: 1,
    };
  } catch (e) {
    running = null;
    if (onPage()) {
      page.status.innerHTML = `<p class="note">${errorText(e)}<br>Dein Text bleibt erhalten.</p>`;
      page.idle();
    } else if (e?.code !== "aborted") {
      ctx.toast(`Bewertung fehlgeschlagen: ${e?.message || e}. Dein Text ist unter „Neuer Text“.`);
    }
    return;
  }
  let id;
  try {
    id = await store.addEntry(entry);
    await store.setSetting("draft", null);
  } catch (e) {
    // Nicht gespeichert: Ergebnis trotzdem zeigen, Entwurf bleibt.
    running = null;
    const target = document.getElementById("app").firstElementChild;
    if (onPage() && target) {
      await renderEntry(target, ctx, entry, await store.listEntries().catch(() => []), { unsaved: true });
      window.scrollTo(0, 0);
    } else {
      ctx.toast(`Bewertung fertig, aber nicht gespeichert: ${e?.message || e}`);
    }
    return;
  }
  running = null;
  if (onPage() && ctx.store === store) ctx.navigate(`#/e/${id}`);
  else ctx.toast(`Bewertung fertig: „${entry.topic || entry.text.slice(0, 30)}“ – zu finden in der Übersicht.`);
}
