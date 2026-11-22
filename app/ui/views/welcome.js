// Onboarding: erklärt den Ablauf, fragt Ziel, Niveau, Motivation, Zeit und Erinnerungen ab und empfiehlt einen Start.
import { esc } from "../../core/html.js";
import { ALL_DAYS, GOALS, GOAL_LABEL, LEVELS, MINUTES, MOTIVATIONS, MOTIVATION_LABEL, WRITES, cleanProfile, defaultProfile } from "../../core/profile.js";
import { recommendation } from "../../core/plan.js";

export const STEPS = ["concept1", "concept2", "concept3", "goal", "level", "motivation", "reminder", "result"];
const DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export async function onboardingDone(store) {
  return Boolean(await store.getSetting("profile"));
}

const CONCEPT = [
  { kicker: "So funktioniert's · 1/3", title: "Schreib einen kurzen Text auf Englisch.",
    text: "Am besten von Hand – das hilft beim Behalten. Fotografier die Seite (auch mehrere) oder tipp den Text ein. Fehlt dir ein Wort, schreib es auf Deutsch.",
    icon: '<path d="M18 74 L62 30 L74 42 L30 86 L16 88 Z" /><path d="M56 36 L68 48" />' },
  { kicker: "So funktioniert's · 2/3", title: "Du bekommst eine Rückmeldung.",
    text: "Deine eigene KI liest den Text und bewertet Grammatik, Satzbau, Wortschatz, Niveau, Komplexität und Stil – als Spinnennetz, mit markierten Fehlern und Tipps. SkillTracker bringt keine KI mit: Du verbindest deine eigene.",
    icon: '<polygon points="50,12 86,32 86,72 50,92 14,72 14,32" /><polygon points="50,30 70,40 66,66 50,76 32,62 30,42" />' },
  { kicker: "So funktioniert's · 3/3", title: "Aus Fehlern wird Übung.",
    text: "Fehlende Wörter werden Karteikarten, wiederkehrende Fehler werden Grammatik-Übungen, und du überarbeitest deine Texte. Ein Lernplan sagt dir jeden Tag, was dran ist – am Anfang kurz, dann länger.",
    icon: '<rect x="18" y="24" width="52" height="36" rx="6" /><rect x="30" y="40" width="52" height="36" rx="6" /><path d="M42 58 h28" />' },
];

const choice = (name, value, label, checked, hint = "") => `<label class="choice"><input type="radio" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""}>
  <span><b>${esc(label)}</b>${hint ? `<span class="small muted">${esc(hint)}</span>` : ""}</span></label>`;

export function resultHtml(profile, hasProvider) {
  const r = recommendation(profile);
  return `<p class="kicker violet">Deine Empfehlung</p>
    <h1>Los geht's mit ${esc(r.startMinutes)} Minuten.</h1>
    <p class="lead">${esc(r.text)}</p>
    <div class="row">
      ${hasProvider ? '<a class="btn primary" href="#/new">Ersten Text schreiben</a>' : '<a class="btn primary" href="#/settings">KI verbinden</a>'}
      <a class="btn" href="#/demo">Demo ansehen</a>
    </div>
    <p class="small muted">Alles lässt sich später unter Einstellungen → Lernplan &amp; Erinnerungen ändern.</p>`;
}

function stepHtml(step, p, ctx) {
  const i = STEPS.indexOf(step);
  if (i < 3) {
    const c = CONCEPT[i];
    return `<div class="concept"><svg viewBox="0 0 100 100" class="concept-icon" aria-hidden="true">${c.icon}</svg>
      <div><p class="kicker violet">${esc(c.kicker)}</p><h1>${esc(c.title)}</h1><p class="lead">${esc(c.text)}</p></div></div>`;
  }
  if (step === "goal") {
    return `<p class="kicker violet">Dein Ziel</p><h1>Wofür lernst du Englisch?</h1>
      <div class="choices">${GOALS.map((g) => choice("goal", g, GOAL_LABEL[g], p.goal === g)).join("")}</div>
      <div class="field ${p.goal === "exam" ? "" : "hidden"}" id="exam-field"><label for="exam-date">Datum der Prüfung (wenn du willst)</label>
        <input type="date" id="exam-date" value="${esc(p.examDate || "")}"></div>`;
  }
  if (step === "level") {
    return `<p class="kicker violet">Dein Niveau</p><h1>Wie gut ist dein Englisch gerade?</h1>
      <p class="muted">Nur eine Schätzung – die KI schätzt dein Niveau bei jedem Text selbst.</p>
      <div class="choices">${LEVELS.map((l) => choice("level", l, l, p.level === l)).join("")}${choice("level", "", "weiß nicht", p.level === null)}</div>`;
  }
  if (step === "motivation") {
    return `<p class="kicker violet">Motivation und Zeit</p><h1>Wie viel willst du dir vornehmen?</h1>
      <h3>Motivation</h3><div class="choices three">${MOTIVATIONS.map((m) => choice("motivation", m, MOTIVATION_LABEL[m], p.motivation === m,
        { relaxed: "ohne Druck", steady: "regelmäßig", ambitious: "ich will schnell besser werden" }[m])).join("")}</div>
      <h3>Zeit pro Tag</h3><div class="choices three">${MINUTES.map((m) => choice("minutes", m, `${m} Minuten`, p.minutes === m)).join("")}</div>
      <h3>Texte pro Woche</h3><div class="choices four">${WRITES.map((w) => choice("writes", w, String(w), p.writesPerWeek === w)).join("")}</div>`;
  }
  if (step === "reminder") {
    const ios = /iPhone|iPad/.test(globalThis.navigator?.userAgent || "") && globalThis.navigator?.standalone !== true;
    return `<p class="kicker violet">Erinnerungen</p><h1>Soll SkillTracker dich erinnern?</h1>
      <label class="check"><input type="checkbox" id="rem-on" ${p.reminder.enabled ? "checked" : ""}> An den Lernplan erinnern</label>
      <div class="field"><label for="rem-time">Uhrzeit</label><input type="time" id="rem-time" value="${esc(p.reminder.time)}"></div>
      <div class="daypick" role="group" aria-label="Wochentage">${ALL_DAYS.map((d) => `<label class="chip"><input type="checkbox" value="${d}" ${p.reminder.days.includes(d) ? "checked" : ""}> ${DAY_SHORT[d]}</label>`).join("")}</div>
      ${ios ? '<p class="note small">Auf dem iPhone kommen Erinnerungen nur, wenn SkillTracker auf dem Home-Bildschirm liegt: in Safari auf „Teilen“ → „Zum Home-Bildschirm“.</p>' : ""}
      ${ctx.demo ? '<p class="small muted">In der Demo werden keine Erinnerungen eingerichtet.</p>' : ""}`;
  }
  return "";
}

// Liest die Felder des gerade gezeigten Schritts ins Profil.
function readStep(root, step, p) {
  const val = (name) => root.querySelector(`input[name="${name}"]:checked`)?.value;
  if (step === "goal") {
    p.goal = val("goal") || p.goal;
    p.examDate = p.goal === "exam" ? root.querySelector("#exam-date")?.value || null : null;
    if (p.goal === "exam" && !p.touchedWrites) p.writesPerWeek = 3;
  } else if (step === "level") {
    const l = val("level");
    p.level = l ? l : null;
  } else if (step === "motivation") {
    p.motivation = val("motivation") || p.motivation;
    p.minutes = Number(val("minutes")) || p.minutes;
    const w = Number(val("writes"));
    if (w) { p.writesPerWeek = w; p.touchedWrites = true; }
  } else if (step === "reminder") {
    const days = [...root.querySelectorAll(".daypick input:checked")].map((x) => Number(x.value));
    p.reminder = { enabled: root.querySelector("#rem-on").checked, time: root.querySelector("#rem-time").value || "19:00", days: days.length ? days : [...ALL_DAYS] };
  }
}

async function save(ctx, p) {
  const { touchedWrites, ...rest } = p;
  const clean = cleanProfile({ ...rest, updatedAt: new Date().toISOString() }) || defaultProfile(p.goal);
  await ctx.store.setSetting("profile", clean);
  return clean;
}

export async function render(root, ctx) {
  const existing = await ctx.store.getSetting("profile");
  const p = structuredClone(existing || defaultProfile());
  const hasProvider = (await ctx.providers()).length > 0 || ctx.demo;
  let i = 0;
  const show = () => {
    const step = STEPS[i];
    const last = step === "result";
    root.innerHTML = `<section class="card onboarding">
      <div class="dots" aria-label="Schritt ${i + 1} von ${STEPS.length}">${STEPS.map((_, k) => `<span class="${k === i ? "on" : k < i ? "done" : ""}"></span>`).join("")}</div>
      <div class="ob-body">${last ? resultHtml(p, hasProvider) : stepHtml(step, p, ctx)}</div>
      ${last ? "" : `<div class="row between ob-nav">
        <button class="btn" id="ob-back" ${i === 0 ? "disabled" : ""}>Zurück</button>
        <div class="row"><button class="btn link" id="ob-skip">Überspringen</button>
        <button class="btn primary violet" id="ob-next">${step === "reminder" ? "Fertig" : "Weiter"}</button></div></div>`}
    </section>`;
    if (last) return;
    root.querySelectorAll('input[name="goal"]').forEach((r) => (r.onchange = () => root.querySelector("#exam-field").classList.toggle("hidden", r.value !== "exam")));
    root.querySelector("#ob-back").onclick = () => { readStep(root, step, p); i = Math.max(0, i - 1); show(); };
    root.querySelector("#ob-skip").onclick = async () => {
      readStep(root, step, p);
      const clean = await save(ctx, existing ? p : { ...defaultProfile(p.goal), goal: p.goal, examDate: p.examDate });
      Object.assign(p, clean);
      i = STEPS.length - 1;
      show();
    };
    root.querySelector("#ob-next").onclick = async () => {
      readStep(root, step, p);
      if (step === "reminder") {
        Object.assign(p, await save(ctx, p));
        if (p.reminder.enabled && !ctx.demo) await ctx.reminders?.enable?.().catch(() => {});
      }
      i++;
      show();
    };
  };
  show();
}
