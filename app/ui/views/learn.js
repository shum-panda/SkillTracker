// Lernen: Lernplan (heute fällig, Vorschau), Kartenliste, eigene Karten, und die Lernsitzung.
import { makeCard, syncCards } from "../../core/cards.js";
import { locateErrors } from "../../core/locate.js";
import { buildQueue, DEFAULT_NEW_PER_DAY, forecast, intervalLabel, schedule, studiedNewToday } from "../../core/srs.js";
import { closeModal, confirmDialog, esc, openModal } from "../dom.js";
import { highlightHtml } from "../highlight.js";

const TYPE_LABEL = { gap: "fehlendes Wort", vocab: "Wortschatz", manual: "eigene Karte" };
const GRADES = [["again", "Nochmal"], ["hard", "Schwer"], ["good", "Gut"], ["easy", "Leicht"]];
const DAYS = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

async function newPerDay(store) {
  const v = await store.getSetting("newPerDay");
  return Number.isInteger(v) ? v : DEFAULT_NEW_PER_DAY;
}

// Karten aus allen Texten nachtragen – einmal je Speicher und Sitzung.
async function ensureCards(ctx) {
  if (ctx.cardsSyncedFor === ctx.store) return;
  await syncCards(ctx.store, await ctx.store.listEntries());
  ctx.cardsSyncedFor = ctx.store;
}

export async function learnSummary(ctx) {
  await ensureCards(ctx);
  const cards = await ctx.store.listCards();
  const now = new Date();
  const q = buildQueue(cards, now, { newPerDay: await newPerDay(ctx.store), newToday: studiedNewToday(cards, now) });
  return { total: cards.length, due: q.due.length, fresh: q.fresh.length };
}

function forecastSvg(counts, now) {
  const max = Math.max(1, ...counts);
  const w = 320;
  const h = 120;
  const bw = w / counts.length;
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Fällige Karten der nächsten ${counts.length} Tage">`;
  counts.forEach((c, i) => {
    const bh = Math.round((c / max) * (h - 42));
    const x = Math.round(i * bw + bw * 0.2);
    const day = i === 0 ? "heute" : DAYS.format(new Date(now.getTime() + i * 86400000));
    s += `<g><title>${esc(day)}: ${c}</title>`;
    if (bh) s += `<rect class="fc-bar" x="${x}" y="${h - 22 - bh}" width="${Math.round(bw * 0.6)}" height="${bh}" rx="4"/>`;
    s += `<text class="value-label" x="${Math.round(x + bw * 0.3)}" y="${h - 26 - bh}" text-anchor="middle">${c || ""}</text>`;
    s += `<text class="tick" x="${Math.round(x + bw * 0.3)}" y="${h - 6}" text-anchor="middle">${esc(day)}</text></g>`;
  });
  return s + "</svg>";
}

function dueText(c, now) {
  if (c.suspended) return "pausiert";
  if (c.sched.state === "new") return "neu";
  const d = Math.round((new Date(c.sched.due).getTime() - now.getTime()) / 86400000);
  if (d <= 0) return "fällig";
  return d === 1 ? "morgen" : `in ${d} Tagen`;
}

function cardForm(card) {
  return `<h2>${card.id ? "Karte bearbeiten" : "Eigene Karte"}</h2>
    <div class="field"><label for="cf-front">Vorderseite <span class="muted">(z. B. Deutsch)</span></label><input type="text" id="cf-front" maxlength="500" value="${esc(card.front)}"></div>
    <div class="field"><label for="cf-back">Rückseite <span class="muted">(Englisch)</span></label><input type="text" id="cf-back" maxlength="500" value="${esc(card.back)}"></div>
    <div class="field"><label for="cf-context">Beispielsatz <span class="muted">(optional, ____ für die Lücke)</span></label><input type="text" id="cf-context" maxlength="2000" value="${esc(card.context)}"></div>
    <div class="field"><label for="cf-note">Notiz <span class="muted">(optional)</span></label><input type="text" id="cf-note" maxlength="2000" value="${esc(card.note)}"></div>
    <div id="cf-status" role="status"></div>
    <div class="actions"><button class="btn ghost" id="cf-cancel">Abbrechen</button><button class="btn primary" id="cf-save">Speichern</button></div>`;
}

function editCard(ctx, card, onSaved) {
  const dlg = openModal(cardForm(card || { front: "", back: "", context: "", note: "" }));
  const v = (id) => dlg.querySelector(`#${id}`).value.trim();
  dlg.querySelector("#cf-cancel").onclick = closeModal;
  dlg.querySelector("#cf-save").onclick = async () => {
    if (!v("cf-front") || !v("cf-back")) {
      dlg.querySelector("#cf-status").innerHTML = '<p class="note">Vorder- und Rückseite ausfüllen.</p>';
      return;
    }
    if (card) await ctx.store.putCard({ ...card, front: v("cf-front"), back: v("cf-back"), context: v("cf-context"), note: v("cf-note") });
    else await ctx.store.addCard(makeCard({ type: "manual", front: v("cf-front"), back: v("cf-back"), context: v("cf-context"), note: v("cf-note") }));
    closeModal();
    onSaved();
  };
}

export async function render(root, ctx) {
  await ensureCards(ctx);
  const store = ctx.store;
  const cards = await store.listCards();
  const now = new Date();
  const limit = await newPerDay(store);
  const newToday = studiedNewToday(cards, now);
  const q = buildQueue(cards, now, { newPerDay: limit, newToday });
  const fc = forecast(cards, now, 7);
  const filter = ctx.learnFilter || "all";
  const shown = cards.filter((c) => filter === "all" || (filter === "paused" ? c.suspended : !c.suspended && c.sched.state === filter));
  const counts = { all: cards.length, new: 0, learning: 0, review: 0, paused: 0 };
  for (const c of cards) counts[c.suspended ? "paused" : c.sched.state]++;

  root.innerHTML = `
    <div class="head row between"><div><p class="kicker">Lernen</p><h1>Deine Karteikarten</h1></div>
      <button class="btn primary" id="start" ${q.due.length + q.fresh.length + q.ahead.length ? "" : "disabled"}>Lernen starten</button></div>
    ${!cards.length ? `<div class="card"><p>Noch keine Karten. Sie entstehen automatisch aus deinen Texten: aus Wörtern, die dir gefehlt haben
      (schreib sie auf Deutsch oder mit <span class="mono">?</span> davor), und aus Wortschatz-Fehlern. Du kannst auch eigene anlegen.</p></div>` : ""}
    <div class="grid two">
      <section class="card">
        <div class="stat-row">
          <div class="stat"><b>${q.due.length}</b><span>heute fällig</span></div>
          <div class="stat"><b>${q.fresh.length}</b><span>neue heute</span></div>
          <div class="stat"><b>${cards.length}</b><span>Karten gesamt</span></div>
        </div>
        <div class="field small"><label for="limit">Neue Karten pro Tag</label>
          <input type="number" id="limit" min="0" max="50" value="${limit}" inputmode="numeric"></div>
      </section>
      <section class="card"><h2>Die nächsten 7 Tage</h2>${fc.some(Boolean) ? forecastSvg(fc, now) : '<p class="muted">Noch keine Wiederholungen geplant – lern deine ersten Karten, dann siehst du hier, was wann dran ist.</p>'}</section>
    </div>
    <section class="card">
      <div class="row between"><h2>Alle Karten</h2><button class="btn small" id="add">Eigene Karte</button></div>
      <div class="row tabs" role="tablist">${[["all", "Alle"], ["new", "Neu"], ["learning", "Lernend"], ["review", "Wiederholung"], ["paused", "Pausiert"]]
        .map(([k, l]) => `<button class="chip ${filter === k ? "level" : ""}" role="tab" aria-selected="${filter === k}" data-filter="${k}">${l} ${counts[k]}</button>`).join("")}</div>
      ${shown.length ? `<ul class="card-list">${shown.map((c) => `<li>
        <div class="cl-main"><span class="cl-front">${esc(c.front)}</span> → <span class="cl-back">${esc(c.back)}</span>
          <span class="small muted">${esc(TYPE_LABEL[c.type])} · ${esc(dueText(c, now))}</span></div>
        <div class="row"><button class="btn small" data-edit="${c.id}">Bearbeiten</button>
          <button class="btn small" data-pause="${c.id}">${c.suspended ? "Fortsetzen" : "Pausieren"}</button>
          <button class="btn small danger" data-del="${c.id}" aria-label="Karte löschen">×</button></div></li>`).join("")}</ul>`
        : '<p class="muted">Keine Karten in dieser Ansicht.</p>'}
    </section>`;

  const rerender = () => render(root, ctx);
  root.querySelector("#start").onclick = () => ctx.navigate("#/learn/session");
  root.querySelector("#add").onclick = () => editCard(ctx, null, rerender);
  root.querySelector("#limit").onchange = async (ev) => {
    const v = Math.max(0, Math.min(50, Math.round(Number(ev.target.value) || 0)));
    await store.setSetting("newPerDay", v);
    rerender();
  };
  for (const b of root.querySelectorAll("[data-filter]")) b.onclick = () => { ctx.learnFilter = b.dataset.filter; rerender(); };
  const byId = (id) => cards.find((c) => c.id === Number(id));
  for (const b of root.querySelectorAll("[data-edit]")) b.onclick = () => editCard(ctx, byId(b.dataset.edit), rerender);
  for (const b of root.querySelectorAll("[data-pause]")) {
    b.onclick = async () => {
      const c = byId(b.dataset.pause);
      await store.putCard({ ...c, suspended: !c.suspended });
      rerender();
    };
  }
  for (const b of root.querySelectorAll("[data-del]")) {
    b.onclick = async () => {
      if (!(await confirmDialog("Karte löschen?", "Sie wird nicht wieder erzeugt, solange es eine Karte mit diesem Wort gibt – sonst beim nächsten Text vielleicht schon.", { ok: "Löschen", danger: true }))) return;
      await store.deleteCard(Number(b.dataset.del));
      rerender();
    };
  }
}

// ---------- Lernsitzung ----------

function frontHtml(c) {
  if (c.type === "gap") {
    return `<p class="kicker">Wie heißt das auf Englisch?</p><p class="flash-word">${esc(c.front)}</p>
      ${c.context ? `<p class="flash-context" lang="en">${esc(c.context)}</p>` : ""}`;
  }
  if (c.type === "vocab") {
    const spans = locateErrors(c.context, [{ quote: c.front }]);
    return `<p class="kicker">Was passt hier besser?</p>
      <p class="flash-context" lang="en">${c.context ? highlightHtml(c.context, spans, [{ category: "word_choice" }]) : esc(c.front)}</p>`;
  }
  return `<p class="flash-word">${esc(c.front)}</p>${c.context ? `<p class="flash-context">${esc(c.context.replace(c.back, "____"))}</p>` : ""}`;
}

function backHtml(c) {
  const filled = c.context && c.type === "gap" ? `<p class="flash-context" lang="en">${esc(c.context).replace("____", `<b>${esc(c.back)}</b>`)}</p>` : "";
  return `<hr class="sep"><p class="flash-answer" lang="en">${c.type === "vocab" ? `<del>${esc(c.front)}</del> → ` : ""}<ins>${esc(c.back)}</ins></p>
    ${filled}${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ""}`;
}

export async function renderSession(root, ctx) {
  await ensureCards(ctx);
  const store = ctx.store;
  const now = new Date();
  const cards = await store.listCards();
  const q = buildQueue(cards, now, { newPerDay: await newPerDay(store), newToday: studiedNewToday(cards, now) });
  const queue = [...q.due, ...q.fresh];
  const later = [...q.ahead];   // lernende Karten, die gleich wieder dran sind
  let done = 0;
  const total = () => done + 1 + queue.length + later.length; // inkl. der gerade gezeigten Karte

  const nextCard = () => {
    if (queue.length) return queue.shift();
    later.sort((a, b) => new Date(a.sched.due) - new Date(b.sched.due));
    return later.shift() || null; // vorziehen statt warten
  };

  const show = (card) => {
    if (!card) {
      root.innerHTML = `<div class="head"><p class="kicker">Lernen</p><h1>Fertig für jetzt</h1>
        <p>${done ? `${done} ${done === 1 ? "Karte" : "Karten"} wiederholt.` : "Gerade ist nichts fällig."} Morgen geht's weiter.</p></div>
        <div class="row"><a class="btn primary" href="#/learn">Zum Lernplan</a><a class="btn" href="#/new">Neuen Text schreiben</a></div>`;
      return;
    }
    let flipped = false;
    let busy = false;
    root.innerHTML = `
      <div class="head"><a href="#/learn" class="small">← Lernplan</a>
        <p class="kicker">${done + 1} von ${total()} · ${esc(TYPE_LABEL[card.type])}</p>
        <div class="progress"><svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" height="6" rx="3" width="${Math.round((done / Math.max(1, total())) * 100)}"/></svg></div></div>
      <section class="card flash" aria-live="polite">
        <div id="front">${frontHtml(card)}</div>
        <div id="back" class="hidden">${backHtml(card)}</div>
      </section>
      <div class="row grade-row" id="flip-row"><button class="btn primary wide" id="flip">Aufdecken <span class="kbd">Leertaste</span></button></div>
      <div class="grades hidden" id="grades">${GRADES.map(([g, l], i) => `<button class="btn grade g-${g}" data-grade="${g}">
        <b>${l}</b><span class="small">${esc(intervalLabel(card.sched, g, new Date()))}</span><span class="kbd">${i + 1}</span></button>`).join("")}</div>`;
    const flip = () => {
      if (flipped) return;
      flipped = true;
      root.querySelector("#back").classList.remove("hidden");
      root.querySelector("#flip-row").classList.add("hidden");
      root.querySelector("#grades").classList.remove("hidden");
      root.querySelector('[data-grade="good"]').focus();
    };
    const grade = async (g) => {
      if (!flipped || busy) return;
      busy = true;
      const updated = { ...card, sched: schedule(card.sched, g, new Date()) };
      try {
        await store.putCard(updated);
      } catch (e) {
        ctx.toast(`Konnte nicht speichern: ${e.message}`);
        busy = false;
        return;
      }
      done++;
      if (updated.sched.state === "learning") later.push(updated);
      show(nextCard());
    };
    root.querySelector("#flip").onclick = flip;
    for (const b of root.querySelectorAll("[data-grade]")) b.onclick = () => grade(b.dataset.grade);
    keyHandler = (ev) => {
      if (ev.target?.closest?.("input, textarea, select")) return;
      if (ev.key === " " || ev.key === "Enter") {
        if (!flipped) { ev.preventDefault(); flip(); }
      } else if (["1", "2", "3", "4"].includes(ev.key)) grade(GRADES[Number(ev.key) - 1][0]);
    };
  };

  let keyHandler = null;
  const onKey = (ev) => keyHandler?.(ev);
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", () => document.removeEventListener("keydown", onKey), { once: true });
  show(nextCard());
}
