// Neuer Text: Foto oder Tippen → Einlesen → Prüfen → Bewerten → speichern.
import { analyze, transcribe } from "../../core/ai.js";
import { recordActivity } from "../../core/activity.js";
import { computeMetrics } from "../../core/metrics.js";
import { computeScores, reliability, MIN_WORDS, RELIABLE_WORDS } from "../../core/scores.js";
import { tokenize } from "../../core/text.js";
import { esc, spinner } from "../dom.js";
import { prepareImage } from "../image.js";
import { renderEntry } from "./entry.js";
import { syncCards } from "../../core/cards.js";
import { addPages, entryThumbs, joinPages, MAX_PAGES, movePage, removePage } from "../../core/pages.js";

const errorText = (e) => esc(e?.message || String(e)) + (e?.detail ? `<br><span class="small muted">${esc(e.detail)}</span>` : "");

// Eine laufende Bewertung überlebt das Wegnavigieren (sie kostet Geld) – aber es gibt immer nur eine.
let running = null;   // { controller }
let page = null;      // Elemente der aktuell angezeigten Seite "Neuer Text" (oder null)

const onPage = () => location.hash === "#/new" && page && document.body.contains(page.root);

export async function render(root, ctx) {
  const store = ctx.store;
  const draft = (await store.getSetting("draft")) || { text: "", topic: "", thumbs: [], source: "typed" };
  const ocr = await ctx.providerFor("ocr");
  const analysisProvider = await ctx.providerFor("analysis");
  // Seiten: {thumb, mediaType?, base64?}. Nach einem Neuladen gibt es nur noch die Vorschau (kein erneutes Einlesen).
  let pages = entryThumbs(draft).map((thumb) => ({ thumb }));
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
        <h2>Fotos einlesen</h2>
        <p class="muted small">Gutes Licht, Blatt gerade von oben. Mehrere Seiten gehen auch (bis ${MAX_PAGES}) – bring sie mit
        ↑ ↓ in die richtige Reihenfolge. Die KI schreibt deinen Text ab, <b>ohne</b> ihn zu verbessern.</p>
        <label class="btn" for="photo" id="photo-label">Fotos aufnehmen oder wählen</label>
        <input class="sr-only" type="file" id="photo" accept="image/*" multiple>
        <ol class="pages" id="pages" aria-label="Seiten in Lesereihenfolge"></ol>
        <p class="small note hidden" id="pages-note">Seiten mit „nur Vorschau“ stammen von einem früheren Besuch – zum Einlesen neu hinzufügen oder entfernen.</p>
        <button class="btn" id="read" disabled>Text einlesen</button>
        <p class="small muted">${ocr ? `Einlesen mit ${esc(ocr.name)} · ${esc(ocr.model)}` : "Zum Einlesen brauchst du eine KI, die Bilder versteht."}</p>
      </section>
    </div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const textEl = $("text");
  const topicEl = $("topic");
  const status = $("status");
  let source = draft.source || "typed";
  const thumbs = () => pages.map((p) => p.thumb);
  const readable = () => pages.length > 0 && pages.every((p) => p.base64);

  let saveTimer;
  const saveDraft = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.setSetting("draft", { text: textEl.value, topic: topicEl.value, thumbs: thumbs(), source })
      .catch(() => {}), 400);
  };
  const renderPages = () => {
    const n = pages.length;
    $("pages").innerHTML = pages.map((p, i) => `<li>
      <img src="${esc(p.thumb)}" alt="Seite ${i + 1}">
      <span class="pg">Seite ${i + 1}${p.base64 ? "" : '<br><span class="small muted">nur Vorschau</span>'}</span>
      <span class="pg-actions">
        <button class="btn small" data-act="up" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Seite ${i + 1} nach oben">↑</button>
        <button class="btn small" data-act="down" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="Seite ${i + 1} nach unten">↓</button>
        <button class="btn small danger" data-act="del" data-i="${i}" aria-label="Seite ${i + 1} entfernen">×</button>
      </span></li>`).join("");
    $("photo-label").textContent = n ? "Weitere Seite hinzufügen" : "Fotos aufnehmen oder wählen";
    $("photo-label").classList.toggle("hidden", n >= MAX_PAGES);
    $("read").textContent = n > 1 ? `${n} Seiten einlesen` : "Text einlesen";
    $("pages-note").classList.toggle("hidden", !pages.some((p) => !p.base64));
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
  renderPages();
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
    $("read").disabled = !(readable() && ocr) || !!running;
    $("clear").disabled = !!running;
  };
  page = { root, status, idle };

  $("cancel").onclick = () => { ocrController?.abort(); running?.controller.abort(); };
  $("clear").onclick = async () => {
    textEl.value = "";
    topicEl.value = "";
    pages = [];
    source = "typed";
    renderPages();
    status.textContent = "";
    updateCount();
    idle();
    await store.setSetting("draft", null).catch(() => {});
  };

  $("pages").addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-act]");
    if (!b || running || ocrController) return;
    const i = Number(b.dataset.i);
    if (b.dataset.act === "up") pages = movePage(pages, i, -1);
    if (b.dataset.act === "down") pages = movePage(pages, i, 1);
    if (b.dataset.act === "del") pages = removePage(pages, i);
    renderPages();
    saveDraft();
    idle();
    const again = $("pages").querySelector(`button[data-act="${b.dataset.act}"][data-i="${b.dataset.act === "up" ? i - 1 : b.dataset.act === "down" ? i + 1 : i}"]`);
    (again && !again.disabled ? again : $("read")).focus();
  });

  $("photo").addEventListener("change", async (ev) => {
    const files = [...(ev.target.files || [])];
    if (ocrController) {
      ev.target.value = "";
      status.innerHTML = "<p class=\"note\">Bitte warte, bis das Einlesen fertig ist, und füge die Seite danach hinzu.</p>";
      return;
    }
    ev.target.value = "";
    if (!files.length) return;
    const prepared = [];
    const failed = [];
    for (const [k, file] of files.entries()) {
      status.innerHTML = `<div class="row muted">${spinner}<span>Foto ${k + 1} von ${files.length} wird vorbereitet …</span></div>`;
      try {
        prepared.push(await prepareImage(file));
      } catch (e) {
        failed.push(`${file.name || `Foto ${k + 1}`}: ${e.message}`);
      }
    }
    const r = addPages(pages, prepared);
    pages = r.pages;
    renderPages();
    saveDraft();
    const notes = [...failed];
    if (r.dropped) notes.push(`${r.dropped} Foto(s) nicht übernommen – höchstens ${MAX_PAGES} Seiten.`);
    status.innerHTML = notes.length ? `<p class="note">${notes.map(esc).join("<br>")}</p>`
      : esc(ocr ? (pages.length > 1 ? "Reihenfolge prüfen, dann einlesen." : "Foto bereit – jetzt „Text einlesen“.") : "");
    idle();
  });

  $("read").onclick = async () => {
    if (!readable() || !ocr) return;
    if (textEl.value.trim() && !confirm("Der vorhandene Text wird durch den eingelesenen ersetzt. Weiter?")) return;
    ocrController = new AbortController();
    const stop = () => ocrController?.abort(); // Einlesen ist billig: beim Wegnavigieren abbrechen
    window.addEventListener("hashchange", stop, { once: true });
    const texts = [];
    try {
      for (const [k, p] of pages.entries()) {
        setBusy(pages.length > 1 ? `Seite ${k + 1} von ${pages.length} wird eingelesen …` : "Text wird eingelesen …", true);
        texts.push(await transcribe(ocr, p, { signal: ocrController.signal }));
      }
      textEl.value = joinPages(texts);
      source = "photo";
      status.innerHTML = '<p class="note">Eingelesen. Bitte vergleiche mit deinen Blättern und korrigiere Lesefehler, <b>nicht</b> deine eigenen Fehler.</p>';
      textEl.focus();
    } catch (e) {
      if (texts.length) {
        textEl.value = joinPages(texts);
        source = "photo";
      }
      const part = texts.length ? `Seite ${texts.length + 1} konnte nicht eingelesen werden – die Seiten davor stehen im Textfeld.<br>` : "";
      status.innerHTML = `<p class="note">${part}${errorText(e)}</p>`;
    }
    updateCount();
    saveDraft();
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
    const snapshot = { text, topic, source, thumbs: source === "photo" ? thumbs() : [] };
    store.setSetting("draft", { text, topic, thumbs: thumbs(), source }).catch(() => {});
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
      createdAt: new Date().toISOString(), topic: snap.topic, source: snap.source, thumbs: snap.thumbs,
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
    await recordActivity(store, { kind: "write" }).catch(() => {});
    await syncCards(store, [{ ...entry, id }]).catch(() => {}); // Karteikarten aus Lücken und Wortschatz-Fehlern
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
