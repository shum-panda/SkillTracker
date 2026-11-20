// Kleine DOM-Helfer: Toast, Dialoge, Datum, Datei speichern.
import { esc } from "../core/html.js";

export { esc };

let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

// Öffnet den Dialog mit fertigem (escaped) HTML; liefert das Dialog-Element.
export function openModal(innerHtml) {
  const dlg = document.getElementById("modal");
  document.getElementById("modal-body").innerHTML = innerHtml;
  if (!dlg.open) dlg.showModal();
  return dlg;
}

export function closeModal() {
  const dlg = document.getElementById("modal");
  if (dlg.open) dlg.close();
}

export function confirmDialog(title, text, { ok = "OK", danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="actions"><button class="btn ghost" data-r="0">Abbrechen</button>
      <button class="btn ${danger ? "danger" : "primary"}" data-r="1">${esc(ok)}</button></div>`);
    const done = (v) => { closeModal(); resolve(v); };
    dlg.querySelector('[data-r="0"]').onclick = () => done(false);
    dlg.querySelector('[data-r="1"]').onclick = () => done(true);
    dlg.addEventListener("cancel", () => resolve(false), { once: true });
  });
}

const DATE = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
export const fmtDate = (iso) => DATE.format(new Date(iso));
export const fmtShort = (iso) => SHORT.format(new Date(iso));

export function download(filename, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const spinner = '<span class="spinner" aria-hidden="true"></span>';
