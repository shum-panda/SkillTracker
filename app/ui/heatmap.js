// Aktivitäts-Heatmap wie bei GitHub: Spalten = Wochen (neueste rechts), Zeilen = Montag … Sonntag, Lila-Stufen.
import { esc } from "../core/html.js";
import { addDays, levelOf, streaks } from "../core/activity.js";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CELL = 13;
const GAP = 2;
const LEFT = 22;
const TOP = 14;

const utc = (day) => new Date(`${day}T12:00:00Z`);
const weekdayOf = (day) => (utc(day).getUTCDay() + 6) % 7;

export function heatmapGrid(today, weeks = 20) {
  const monday = addDays(today, -weekdayOf(today));
  const first = addDays(monday, -7 * (weeks - 1));
  const columns = [];
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(first, w * 7 + i);
      days.push({ day, weekday: i, future: day > today });
    }
    const firstOfMonth = days.find((d) => d.day.endsWith("-01"));
    const col = { days };
    if (firstOfMonth) col.month = MONTHS[Number(firstOfMonth.day.slice(5, 7)) - 1];
    columns.push(col);
  }
  return { columns };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function dayLabel(day, s) {
  const d = utc(day);
  const head = Number.isNaN(d.getTime()) ? String(day) : `${WD[weekdayOf(day)]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
  const num = (v) => (Number.isFinite(v) ? v : 0);
  const parts = [];
  if (s) {
    if (num(s.write)) parts.push(plural(num(s.write), "Text", "Texte"));
    if (num(s.cards)) parts.push(plural(num(s.cards), "Karte", "Karten"));
    if (num(s.drill)) parts.push(plural(num(s.drill), "Übung", "Übungen"));
    if (num(s.revise)) parts.push(plural(num(s.revise), "Überarbeitung", "Überarbeitungen"));
    if (num(s.speak)) parts.push(plural(num(s.speak), "Sprechübung", "Sprechübungen"));
    if (num(s.minutes)) parts.push(`${num(s.minutes)} Min`);
  }
  return esc([head, ...(parts.length ? parts : ["nichts"])].join(" · "));
}

export function heatmapHtml(stats, today, { weeks = 20 } = {}) {
  const { columns } = heatmapGrid(today, weeks);
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);
  let cells = "";
  let months = "";
  let activeCount = 0;
  const rows = [];
  columns.forEach((col, w) => {
    const x = LEFT + w * (CELL + GAP);
    if (col.month) months += `<text x="${x}" y="10" class="hm-label">${esc(col.month)}</text>`;
    for (const d of col.days) {
      if (d.future) continue;
      const s = stats.get(d.day);
      const lvl = levelOf(s?.score || 0);
      if (lvl) {
        activeCount++;
        rows.push(`<tr><td>${dayLabel(d.day, s)}</td></tr>`);
      }
      const y = TOP + d.weekday * (CELL + GAP);
      cells += `<rect data-day="${d.day}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" class="hm l${lvl}${d.day === today ? " today" : ""}" data-label="${dayLabel(d.day, s)}"><title>${dayLabel(d.day, s)}</title></rect>`;
    }
  });
  const wd = [0, 2, 4].map((i) => `<text x="0" y="${TOP + i * (CELL + GAP) + 10}" class="hm-label">${WD[i]}</text>`).join("");
  const { current, longest } = streaks(stats, today);
  const summary = `Aktivität der letzten ${weeks} Wochen: ${activeCount} aktive Tage, aktuelle Serie ${current}, längste ${longest}.`;
  return `<div class="heatmap">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summary)}" class="hm-svg">${months}${wd}${cells}</svg>
    <p class="hm-info small muted" aria-live="polite"></p>
    <div class="row between small">
      <span class="hm-legend muted">weniger ${[0, 1, 2, 3, 4].map((l) => `<span class="hm-key l${l}"></span>`).join("")} mehr</span>
      <span>${current ? `<b>${plural(current, "Tag", "Tage")} in Folge</b>` : "Heute schon was gemacht?"}${longest > 1 ? ` · längste Serie: ${longest}` : ""}</span>
    </div>
    <button class="btn small hm-toggle" type="button" aria-expanded="false">Als Liste</button>
    <table class="hm-table hidden"><caption>${esc(summary)}</caption><tbody>${rows.reverse().join("") || "<tr><td>Noch keine Aktivität.</td></tr>"}</tbody></table>
  </div>`;
}

export function bindHeatmap(root) {
  for (const box of root.querySelectorAll(".heatmap")) {
    const info = box.querySelector(".hm-info");
    const show = (el) => { if (el?.dataset?.label) info.textContent = el.dataset.label.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); };
    box.querySelector("svg").addEventListener("click", (ev) => show(ev.target.closest("rect")));
    box.querySelector("svg").addEventListener("mouseover", (ev) => show(ev.target.closest("rect")));
    const btn = box.querySelector(".hm-toggle");
    btn.onclick = () => {
      const table = box.querySelector(".hm-table");
      const open = table.classList.toggle("hidden") === false;
      btn.setAttribute("aria-expanded", String(open));
      btn.textContent = open ? "Als Raster" : "Als Liste";
    };
  }
}
