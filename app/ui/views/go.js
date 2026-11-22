// #/go/<ziel>: direkter Sprung (z. B. aus einer Erinnerung) und Zwischenseite einer geplanten Einheit (#/go/weiter).
import { esc } from "../../core/html.js";
import { planToday } from "../../core/plan.js";
import { defaultProfile } from "../../core/profile.js";
import { ensureCards, newPerDay } from "./learn.js";
import { partLabel, resolveGo, startUnit } from "../unit.js";

export async function planData(ctx) {
  await ensureCards(ctx).catch(() => {});
  const store = ctx.store;
  return {
    profile: (await store.getSetting("profile")) || defaultProfile(),
    activity: store.listActivity ? await store.listActivity() : [],
    cards: await store.listCards(),
    entries: await store.listEntries(),
    drills: (await store.getSetting("drills")) || [],
    cardTimes: (await store.getSetting("cardTimes")) || [],
    newPerDay: await newPerDay(store),
    now: new Date(),
  };
}

function interstitial(root, ctx) {
  const unit = ctx.unit;
  if (!unit) return ctx.replace("#/");
  const next = unit.current();
  const summary = unit.summary ? `<p class="lead">${esc(unit.summary)}</p>` : "";
  if (!next) {
    ctx.unit = null;
    root.innerHTML = `<section class="card onboarding unit-done">
      <p class="kicker violet">Lerneinheit</p><h1>Fertig für heute ✓</h1>${summary}
      <p class="muted">${esc(unit.parts.length)} ${unit.parts.length === 1 ? "Teil" : "Teile"} geschafft. Morgen geht's weiter – wenn du dranbleibst, wird die Einheit nach und nach länger.</p>
      <div class="row"><a class="btn primary violet" href="#/">Zur Übersicht</a><a class="btn" href="#/new">Neuen Text schreiben</a></div></section>`;
    return;
  }
  root.innerHTML = `<section class="card onboarding">
    <p class="kicker violet">Teil ${unit.index} von ${unit.parts.length} geschafft</p>${summary}
    <h1>Weiter: ${esc(partLabel(next))}</h1><p class="muted">ca. ${esc(Math.max(1, Math.round(next.seconds / 60)))} Min</p>
    <div class="row"><button class="btn primary violet" id="go-next">Weiter</button><button class="btn" id="go-stop">Für heute aufhören</button></div></section>`;
  root.querySelector("#go-next").onclick = () => ctx.replace(next.target);
  root.querySelector("#go-stop").onclick = () => { unit.abandon(); ctx.navigate("#/"); };
}

export async function render(root, ctx, [path]) {
  if (path === "weiter") return interstitial(root, ctx);
  root.innerHTML = '<div class="head"><p class="kicker violet">Lerneinheit</p><h1>Einen Moment …</h1></div>';
  const data = await planData(ctx);
  const plan = planToday(data);
  if (path === "heute") {
    if (!plan.parts.length) {
      const r = resolveGo("heute", { entries: data.entries, plan });
      if (r.note) ctx.toast(r.note);
      return ctx.replace(r.hash);
    }
    ctx.unit?.abandon();
    const unit = startUnit(ctx, plan, data.entries);
    return ctx.replace(unit.current().target);
  }
  const r = resolveGo(path, { entries: data.entries, plan });
  if (r.note) ctx.toast(r.note);
  ctx.replace(r.hash);
}
