// Einstellungen: KI-Anbieter, Zuordnung Einlesen/Bewerten, Anzeige, Sicherung, Datenschutz.
import { PROVIDER_TYPES, listModels, completeJSON } from "../../core/providers/index.js";
import { exportData, parseImport, applyImport } from "../../core/backup.js";
import { esc, safeHttpsUrl } from "../../core/html.js";
import { closeModal, confirmDialog, download, openModal, spinner } from "../dom.js";
import { ALL_DAYS, GOALS, GOAL_LABEL, MINUTES, MOTIVATIONS, MOTIVATION_LABEL, WRITES, cleanProfile, defaultProfile } from "../../core/profile.js";

const PING_SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function providerForm(p) {
  const types = Object.entries(PROVIDER_TYPES)
    .map(([k, t]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  return `<h2>${p.name ? "KI bearbeiten" : "KI verbinden"}</h2>
    <div class="field"><label for="pf-type">Anbieter</label><select id="pf-type">${types}</select></div>
    <div class="field"><label for="pf-name">Name</label><input type="text" id="pf-name" maxlength="80" value="${esc(p.name)}"></div>
    <div class="field" id="pf-base-wrap"><label for="pf-base">Adresse (Basis-URL)</label>
      <input type="url" id="pf-base" value="${esc(p.baseUrl)}" placeholder="http://localhost:11434/v1">
      <div class="hint">Ollama: <span class="mono">http://localhost:11434/v1</span>, LM Studio: <span class="mono">http://localhost:1234/v1</span>,
      OpenRouter: <span class="mono">https://openrouter.ai/api/v1</span></div></div>
    <div class="field"><label for="pf-key">API-Schlüssel</label><input type="password" id="pf-key" autocomplete="off" value="${esc(p.apiKey)}">
      <div class="hint" id="pf-keyhint"></div></div>
    <div class="field"><label for="pf-model">Modell</label>
      <div class="row"><input type="text" id="pf-model" list="pf-models" value="${esc(p.model)}"><button class="btn small" id="pf-load">Modelle laden</button></div>
      <datalist id="pf-models"></datalist><div class="hint" id="pf-modelhint"></div></div>
    <div id="pf-status" role="status" aria-live="polite"></div>
    <div class="actions"><button class="btn ghost" id="pf-cancel">Abbrechen</button><button class="btn" id="pf-test">Verbindung testen</button>
      <button class="btn primary" id="pf-save">Speichern</button></div>`;
}

function editProvider(ctx, existing, onSaved) {
  const p = existing ? { ...existing } : { id: newId(), type: "anthropic", name: "", apiKey: "", baseUrl: "", model: PROVIDER_TYPES.anthropic.defaultModel };
  const dlg = openModal(providerForm(p));
  const $ = (id) => dlg.querySelector(`#${id}`);
  const read = () => ({
    id: p.id, type: $("pf-type").value, name: $("pf-name").value.trim() || PROVIDER_TYPES[$("pf-type").value].label,
    apiKey: $("pf-key").value.trim(), model: $("pf-model").value.trim(),
    // Eigene Adresse nur bei "kompatibel" – sonst ginge ein Schlüssel womöglich an ein verstecktes Ziel.
    baseUrl: PROVIDER_TYPES[$("pf-type").value].needsBaseUrl ? $("pf-base").value.trim() : "",
  });
  const sync = () => {
    const t = PROVIDER_TYPES[$("pf-type").value];
    $("pf-base-wrap").classList.toggle("hidden", !t.needsBaseUrl);
    if (t.needsBaseUrl && !$("pf-base").value) $("pf-base").value = t.defaultBaseUrl;
    $("pf-keyhint").innerHTML = (t.needsKey ? "" : "Bei lokalen Servern meist leer lassen. ") +
      `<a href="${esc(safeHttpsUrl(t.keyUrl))}" target="_blank" rel="noopener noreferrer">${t.needsKey ? "Schlüssel erstellen" : "Ollama herunterladen"}</a>` +
      " · Der Schlüssel bleibt auf diesem Gerät und geht nur an diesen Anbieter.";
    $("pf-modelhint").textContent = $("pf-type").value === "anthropic"
      ? "Standard: claude-opus-5-5. Günstiger: claude-haiku-5-5." : "Für Fotos braucht es ein Modell, das Bilder versteht.";
  };
  $("pf-type").onchange = () => {
    const t = PROVIDER_TYPES[$("pf-type").value];
    $("pf-model").value = t.defaultModel;
    $("pf-base").value = t.needsBaseUrl ? t.defaultBaseUrl : "";
    sync();
  };
  sync();
  const status = (html) => { $("pf-status").innerHTML = html; };
  $("pf-load").onclick = async () => {
    status(`<div class="row muted">${spinner}<span>Modelle werden geladen …</span></div>`);
    try {
      const models = await listModels(read());
      $("pf-models").innerHTML = models.map((m) => `<option value="${esc(m)}">`).join("");
      status(`<p class="small muted">${models.length} Modelle gefunden – ins Feld tippen zum Auswählen.</p>`);
    } catch (e) {
      status(`<p class="note">${esc(e.message)}${e.detail ? `<br><span class="small">${esc(e.detail)}</span>` : ""}</p>`);
    }
  };
  $("pf-test").onclick = async () => {
    status(`<div class="row muted">${spinner}<span>Teste …</span></div>`);
    try {
      const out = await completeJSON(read(), { system: "Reply with JSON.", prompt: 'Return {"ok": true}.', schema: PING_SCHEMA, schemaName: "ping" });
      status(out?.ok === true ? '<p class="note">Verbindung klappt.</p>' : '<p class="note">Antwort kam, aber nicht im erwarteten Format.</p>');
    } catch (e) {
      status(`<p class="note">${esc(e.message)}${e.detail ? `<br><span class="small">${esc(e.detail)}</span>` : ""}</p>`);
    }
  };
  $("pf-cancel").onclick = closeModal;
  $("pf-save").onclick = async () => {
    const next = read();
    if (!next.model) return status('<p class="note">Bitte ein Modell eintragen.</p>');
    if (PROVIDER_TYPES[next.type].needsKey && !next.apiKey) return status('<p class="note">Bitte den API-Schlüssel eintragen.</p>');
    if (PROVIDER_TYPES[next.type].needsBaseUrl && !/^https?:\/\//.test(next.baseUrl)) return status('<p class="note">Bitte eine gültige Adresse eintragen.</p>');
    const list = await ctx.providers();
    const i = list.findIndex((x) => x.id === next.id);
    if (i === -1) list.push(next); else list[i] = next;
    await ctx.store.setSetting("providers", list);
    closeModal();
    onSaved();
  };
}

const DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const sel = (id, list, cur, label) => `<select id="${id}">${list.map((v) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label(v))}</option>`).join("")}</select>`;

function planSectionHtml(p) {
  return `<section class="card stack" id="plan-settings">
      <h2>Lernplan &amp; Erinnerungen</h2>
      <div class="grid two">
        <div class="field"><label for="pf-goal">Ziel</label>${sel("pf-goal", GOALS, p.goal, (g) => GOAL_LABEL[g])}</div>
        <div class="field"><label for="pf-mot">Motivation</label>${sel("pf-mot", MOTIVATIONS, p.motivation, (m) => MOTIVATION_LABEL[m])}</div>
        <div class="field"><label for="pf-min">Zeit pro Tag</label>${sel("pf-min", MINUTES, p.minutes, (m) => `${m} Minuten`)}</div>
        <div class="field"><label for="pf-writes">Texte pro Woche</label>${sel("pf-writes", WRITES, p.writesPerWeek, String)}</div>
      </div>
      <label class="check"><input type="checkbox" id="pf-rem" ${p.reminder.enabled ? "checked" : ""}> An den Lernplan erinnern</label>
      <div class="row"><div class="field"><label for="pf-time">Uhrzeit</label><input type="time" id="pf-time" value="${esc(p.reminder.time)}"></div>
        <div class="daypick" role="group" aria-label="Wochentage">${ALL_DAYS.map((d) => `<label class="chip"><input type="checkbox" value="${d}" ${p.reminder.days.includes(d) ? "checked" : ""}> ${DAY_SHORT[d]}</label>`).join("")}</div></div>
      <div id="reminder-status"></div>
      <a class="btn small" href="#/willkommen">Einführung noch einmal ansehen</a>
    </section>`;
}

export async function render(root, ctx) {
  const profile = (await ctx.store.getSetting("profile")) || defaultProfile();
  const providers = await ctx.providers();
  const ocrId = (await ctx.providerFor("ocr"))?.id;
  const anId = (await ctx.providerFor("analysis"))?.id;
  const showImproved = (await ctx.store.getSetting("showImproved")) !== false;
  const theme = (await ctx.store.getSetting("theme")) || "auto";
  const relayUrl = (await ctx.store.getSetting("relayUrl")) || "";
  const speechModel = (await ctx.store.getSetting("speechModel")) || "";
  const opts = (sel) => providers.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? "selected" : ""}>${esc(p.name)} · ${esc(p.model)}</option>`).join("");

  root.innerHTML = `
    <div class="head"><p class="kicker">Einstellungen</p><h1>Deine KI und deine Daten</h1>
      <p>SkillTracker hat keinen eigenen Server: Texte und Schlüssel bleiben auf diesem Gerät. Die App fragt direkt bei deiner KI an.</p></div>
    ${ctx.demo ? '<p class="note">Demo: Änderungen hier gelten nur, bis du die Demo verlässt.</p>' : ""}
    <section class="card">
      <div class="row between"><h2>KI-Anbieter</h2><button class="btn primary small" id="add">KI verbinden</button></div>
      ${providers.length ? providers.map((p) => `<div class="provider"><div><b>${esc(p.name)}</b><br>
        <span class="small muted">${esc(PROVIDER_TYPES[p.type]?.label)} · <span class="mono">${esc(p.model)}</span></span></div>
        <div class="row"><button class="btn small" data-edit="${esc(p.id)}">Bearbeiten</button>
        <button class="btn small danger" data-del="${esc(p.id)}">Entfernen</button></div></div>`).join("")
        : '<p class="muted">Noch keine KI verbunden. Du brauchst einen eigenen API-Schlüssel (Claude, OpenAI, Gemini) oder ein lokales Modell (z. B. Ollama).</p>'}
      ${providers.length ? `<div class="grid two">
        <div class="field"><label for="ocr">Fotos einlesen mit</label><select id="ocr">${opts(ocrId)}</select>
          <div class="hint">Braucht ein Modell, das Bilder versteht.</div></div>
        <div class="field"><label for="an">Texte bewerten mit</label><select id="an">${opts(anId)}</select></div></div>` : ""}
      ${providers.some((p) => p.type === "openai" || p.type === "compatible") ? `<div class="field"><label for="speech-model">Spracherkennung (Aussprache)</label>
        <input type="text" id="speech-model" placeholder="whisper-1" value="${esc(speechModel)}">
        <div class="hint">Modell für OpenAI bzw. kompatible Server, z. B. whisper-1. Leer = whisper-1. Claude versteht kein Audio.</div></div>` : ""}
    </section>
    ${planSectionHtml(profile)}
    <section class="card">
      <h2>Anzeige</h2>
      <label class="check"><input type="checkbox" id="improved" ${showImproved ? "checked" : ""}> Verbesserte Fassung anzeigen (zum Aufklappen)</label>
      <p class="small muted">Aus: Du siehst nur die markierten Fehler und überarbeitest selbst.</p>
      <div class="field"><label for="theme">Farbschema</label><select id="theme">
        <option value="auto" ${theme === "auto" ? "selected" : ""}>wie das Gerät</option>
        <option value="light" ${theme === "light" ? "selected" : ""}>hell</option>
        <option value="dark" ${theme === "dark" ? "selected" : ""}>dunkel</option></select></div>
    </section>
    ${ctx.demo ? "" : `<section class="card stack">
      <h2>Geräte verbinden</h2>
      <p class="muted small">Handy und PC im selben WLAN abgleichen: ein Gerät zeigt einen QR-Code, das andere scannt ihn.
      Dafür braucht es einen kleinen Vermittler auf deinem Server – er sieht keine Daten.</p>
      <div class="field"><label for="relay">Vermittler-Adresse</label>
        <input type="url" id="relay" placeholder="https://sync.dein-server.de" value="${esc(relayUrl)}"></div>
      <div class="row"><a class="btn primary ${relayUrl ? "" : "disabled-link"}" href="#/sync" id="sync-go">Geräte verbinden</a></div>
    </section>`}
    ${ctx.demo ? '<section class="card"><h2>Sicherung</h2><p class="muted">In der Demo aus – verlasse die Demo, um deine eigenen Daten zu sichern oder zu importieren.</p></section>' : ""}
    <section class="card ${ctx.demo ? "hidden" : ""}">
      <h2>Sicherung</h2>
      <p class="muted small">Als Datei sichern oder auf ein anderes Gerät übertragen. Später kommt die Übertragung per QR-Code im WLAN dazu.</p>
      <label class="check"><input type="checkbox" id="withkeys"> API-Schlüssel mit in die Datei schreiben</label>
      <div class="row"><button class="btn" id="export">Exportieren</button>
        <label class="btn" for="import">Importieren</label><input class="sr-only" type="file" id="import" accept="application/json,.json"></div>
      <div id="backup-status" role="status" aria-live="polite"></div>
      <hr class="sep">
      <button class="btn danger" id="wipe">Alles auf diesem Gerät löschen</button>
    </section>
    <section class="card small">
      <h2>Datenschutz und Quellen</h2>
      <p>API-Schlüssel liegen unverschlüsselt im Speicher dieses Browsers. Leg beim Anbieter am besten ein Ausgabenlimit fest.
      Deine Texte gehen nur an die KI, die du hier auswählst – sonst nirgendwohin.</p>
      <p>Worthäufigkeiten: <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noopener noreferrer">wordfreq</a> von Robyn Speer,
      Daten unter CC BY-SA 4.0. Schriften: Bricolage Grotesque, Figtree, DM Mono (SIL Open Font License).</p>
    </section>`;

  const rerender = () => render(root, ctx);
  const $ = (id) => root.querySelector(`#${id}`);
  $("add").onclick = () => editProvider(ctx, null, rerender);
  for (const b of root.querySelectorAll("[data-edit]")) b.onclick = () => editProvider(ctx, providers.find((p) => p.id === b.dataset.edit), rerender);
  for (const b of root.querySelectorAll("[data-del]")) {
    b.onclick = async () => {
      if (!(await confirmDialog("KI entfernen?", "Der Schlüssel wird von diesem Gerät gelöscht. Deine Texte bleiben.", { ok: "Entfernen", danger: true }))) return;
      await ctx.store.setSetting("providers", providers.filter((p) => p.id !== b.dataset.del));
      rerender();
    };
  }
  $("ocr")?.addEventListener("change", (e) => ctx.store.setSetting("ocrProvider", e.target.value));
  $("an")?.addEventListener("change", (e) => ctx.store.setSetting("analysisProvider", e.target.value));
  $("improved").onchange = (e) => ctx.store.setSetting("showImproved", e.target.checked);
  $("speech-model")?.addEventListener("change", (e) => ctx.store.setSetting("speechModel", e.target.value.trim().slice(0, 100)));
  $("theme").onchange = async (e) => { await ctx.store.setSetting("theme", e.target.value); await ctx.applyTheme(); };
  $("export").onclick = async () => {
    const data = await exportData(ctx.store, { includeKeys: $("withkeys").checked });
    download(`skilltracker-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
  };
  $("import").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    const out = $("backup-status");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Die Datei ist zu groß.");
      const parsed = parseImport(JSON.parse(await file.text()));
      const withKeys = parsed.hasKeys && (await confirmDialog("Schlüssel übernehmen?",
        "Die Sicherung enthält API-Schlüssel. Nur übernehmen, wenn die Datei von dir stammt.", { ok: "Übernehmen" }));
      const r = await applyImport(ctx.store, parsed, { withKeys });
      ctx.cardsSync = null; // Karten aus importierten Texten beim nächsten Öffnen nachtragen
      ctx.toast(`${r.added} Texte importiert${r.skipped ? `, ${r.skipped} unbrauchbare übersprungen` : ""}.`);
      rerender();
    } catch (e) {
      out.innerHTML = `<p class="note">${esc(e instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : e.message)}</p>`;
    }
  });
  $("relay")?.addEventListener("change", async (ev) => {
    const v = ev.target.value.trim().replace(/\/+$/, "");
    if (v && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(v) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) {
      ctx.toast("Bitte eine https-Adresse eintragen.");
      return;
    }
    await ctx.store.setSetting("relayUrl", v);
    rerender();
  });
  const saveProfile = async () => {
    const days = [...root.querySelectorAll("#plan-settings .daypick input:checked")].map((x) => Number(x.value));
    const next = cleanProfile({ ...profile, goal: $("pf-goal").value, motivation: $("pf-mot").value, minutes: Number($("pf-min").value),
      writesPerWeek: Number($("pf-writes").value), reminder: { enabled: $("pf-rem").checked, time: $("pf-time").value || "19:00", days: days.length ? days : [...ALL_DAYS] },
      updatedAt: new Date().toISOString() });
    if (!next) return;
    Object.assign(profile, next);
    await ctx.store.setSetting("profile", next);
    if (!ctx.demo) await ctx.reminders?.refresh?.().catch(() => {});
    ctx.toast("Lernplan gespeichert.");
  };
  for (const el of root.querySelectorAll("#plan-settings select, #plan-settings input")) el.addEventListener("change", saveProfile);
  await ctx.reminders?.renderStatus?.(root.querySelector("#reminder-status"));
  $("wipe").onclick = async () => {
    if (!(await confirmDialog("Alles löschen?", "Alle Texte, Bewertungen und Schlüssel auf diesem Gerät werden gelöscht. Das lässt sich nicht rückgängig machen.",
      { ok: "Alles löschen", danger: true }))) return;
    await ctx.store.clearAll();
    ctx.cardsSync = null;
    await ctx.applyTheme();
    ctx.toast("Alles gelöscht.");
    ctx.navigate("#/");
  };
}
