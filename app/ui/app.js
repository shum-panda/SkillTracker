// Start der App: Speicher öffnen, Wortliste laden, Navigation über den Hash.
import { MemoryStore } from "../core/store.js";
import { IdbStore } from "../core/store-idb.js";
import { parseFreq } from "../core/freq.js";
import { demoEntries } from "../core/demo.js";
import { esc, toast } from "./dom.js";
import * as home from "./views/home.js";
import * as newText from "./views/new.js";
import * as entry from "./views/entry.js";
import * as revise from "./views/revise.js";
import * as historyView from "./views/history.js";
import * as settings from "./views/settings.js";
import * as learn from "./views/learn.js";
import { syncCards } from "../core/cards.js";

import * as train from "./views/train.js";
import * as syncView from "./views/sync.js";
import * as speakView from "./views/speak.js";

const learnSession = { render: learn.renderSession };
const trainSession = { render: train.renderSession };

const root = document.getElementById("app");
const banner = document.getElementById("banner");

const ctx = {
  store: null,
  demo: false,
  freq: null,
  toast,
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  async providers() {
    return (await ctx.store.getSetting("providers")) || [];
  },
  async providerFor(role) {
    const list = await ctx.providers();
    const id = await ctx.store.getSetting(role === "ocr" ? "ocrProvider" : "analysisProvider");
    return list.find((p) => p.id === id) || list[0] || null;
  },
  async applyTheme() {
    const theme = (await ctx.store.getSetting("theme")) || "auto";
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  },
};

function loadFreq() {
  ctx.freq ??= fetch("data/wordfreq-en.json")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then(parseFreq)
    .catch(() => {
      ctx.freq = null; // nächster Versuch beim nächsten Bedarf
      throw new Error("Die Wortliste konnte nicht geladen werden (offline?).");
    });
  return ctx.freq;
}
ctx.loadFreq = loadFreq;

function showBanner(html) {
  banner.innerHTML = html;
  banner.hidden = !html;
  banner.querySelector("#reload")?.addEventListener("click", () => location.reload());
}

async function openStore() {
  try {
    ctx.store = await IdbStore.open("skilltracker", {
      onBlocked: () => showBanner("<span>SkillTracker ist noch in einem anderen Tab oder Fenster offen (alte Version). Bitte dort schließen – dann geht es hier weiter.</span>"),
      onVersionChange: () => showBanner('<span>Es gibt eine neue Version von SkillTracker.</span><button class="btn small" id="reload">Neu laden</button>'),
    });
    showBanner("");
  } catch {
    ctx.store = new MemoryStore();
    showBanner("<span>Dieser Browser erlaubt hier keinen Speicher (privates Fenster?). Texte gehen beim Schließen verloren.</span>");
  }
}

async function enterDemo() {
  const freq = await loadFreq();
  const store = new MemoryStore();
  const entries = demoEntries(freq);
  for (const e of entries) await store.putEntry(e);
  await syncCards(store, entries);
  ctx.realStore ??= ctx.store;
  ctx.store = store;
  ctx.demo = true;
  showBanner('<span><b>Demo</b> – Beispieltexte, nichts wird gespeichert.</span><button class="btn small" id="leave-demo">Demo verlassen</button>');
  document.getElementById("leave-demo").onclick = () => {
    ctx.store = ctx.realStore;
    ctx.demo = false;
    showBanner("");
    ctx.navigate("#/");
  };
}

const ROUTES = [
  [/^#?\/?$/, home, "home"],
  [/^#\/new$/, newText, "new"],
  [/^#\/e\/(\d+)\/revise$/, revise, ""],
  [/^#\/e\/(\d+)\/speak$/, speakView, ""],
  [/^#\/e\/(\d+)$/, entry, ""],
  [/^#\/history$/, historyView, "history"],
  [/^#\/settings$/, settings, "settings"],
  [/^#\/learn$/, learn, "learn"],
  [/^#\/sync(\?.*)?$/, syncView, "settings"],
  [/^#\/train$/, train, "learn"],
  [/^#\/train\/([a-z_]+)$/, trainSession, "learn"],
  [/^#\/learn\/session$/, learnSession, "learn"],
];

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const hash = location.hash || "#/";
  if (hash === "#/demo") {
    await enterDemo();
    window.history.replaceState(null, "", "#/");
  }
  const h = location.hash || "#/";
  const route = ROUTES.find(([re]) => re.test(h)) || ROUTES[0];
  const params = h.match(route[0])?.slice(1) || [];
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === route[2]) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const view = document.createElement("div");
  view.className = "view";
  try {
    await route[1].render(view, ctx, params);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h2>Da ist etwas schiefgelaufen</h2><p class="muted">${esc(e?.message || e)}</p>
      <a class="btn" href="#/">Zur Übersicht</a></div>`;
  }
  if (seq !== renderSeq) return; // inzwischen weiter navigiert
  root.replaceChildren(view);
  window.scrollTo(0, 0);
}

async function start() {
  await openStore();
  await ctx.applyTheme();
  window.addEventListener("hashchange", render);
  await render();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();
