// SVG-Diagramme ohne Bibliothek: Spinnennetz (6 Achsen) und kleine Verlaufslinien (eine Achse je Diagramm).
// Werte stehen zusätzlich immer als Text/Tabelle daneben; <title> liefert den Hover-Wert.
import { esc } from "../core/html.js";

const r1 = (v) => Math.round(v * 10) / 10;

function point(cx, cy, radius, i, n, value) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const d = (radius * Math.max(0, Math.min(100, value))) / 100;
  return [r1(cx + d * Math.cos(angle)), r1(cy + d * Math.sin(angle))];
}

// axes: [{key, label}], current: {key: value}, compare: {key: value} | null
export function radarSvg(axes, current, compare = null, { size = 360, labels = true, title = "Spinnennetz" } = {}) {
  const n = axes.length;
  const pad = labels ? 62 : 4;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - pad;
  const ring = (v) => axes.map((_, i) => point(cx, cy, radius, i, n, v).join(",")).join(" ");
  let s = `<svg class="chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(title)}">`;
  for (const v of [25, 50, 75, 100]) s += `<polygon class="grid-line" points="${ring(v)}"/>`;
  axes.forEach((_, i) => {
    const [x, y] = point(cx, cy, radius, i, n, 100);
    s += `<line class="axis-line" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
  });
  if (labels) {
    for (const v of [50, 100]) {
      const [x, y] = point(cx, cy, radius, 0, n, v);
      s += `<text class="tick" x="${x + 4}" y="${y + 3}">${v}</text>`;
    }
    axes.forEach((a, i) => {
      const [x, y] = point(cx, cy, radius + 16, i, n, 100);
      const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
      const dy = y < cy - radius * 0.6 ? -4 : y > cy + radius * 0.6 ? 12 : 4;
      s += `<text class="axis-label" x="${x}" y="${r1(y + dy)}" text-anchor="${anchor}">${esc(a.label)}</text>`;
    });
  }
  if (compare) s += `<polygon class="s-b" points="${axes.map((a, i) => point(cx, cy, radius, i, n, compare[a.key] ?? 0).join(",")).join(" ")}"/>`;
  if (current) {
    s += `<polygon class="s-a" points="${axes.map((a, i) => point(cx, cy, radius, i, n, current[a.key] ?? 0).join(",")).join(" ")}"/>`;
    if (labels) {
      axes.forEach((a, i) => {
        const [x, y] = point(cx, cy, radius, i, n, current[a.key] ?? 0);
        const cmp = compare ? ` · Schnitt ${compare[a.key]}` : "";
        s += `<g><title>${esc(a.label)}: ${current[a.key]}${cmp}</title><circle class="hit" cx="${x}" cy="${y}" r="14"/>` +
          `<circle class="dot" cx="${x}" cy="${y}" r="4.5"/></g>`;
      });
    }
  }
  return s + "</svg>";
}

// points: [{date: ISO, value, label}] (älteste zuerst)
export function lineSvg(points, { width = 320, height = 120, title = "" } = {}) {
  const padL = 26, padR = 30, padT = 10, padB = 20;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const t0 = new Date(points[0].date).getTime();
  const t1 = new Date(points.at(-1).date).getTime();
  const x = (d) => r1(padL + (t1 === t0 ? w / 2 : ((new Date(d).getTime() - t0) / (t1 - t0)) * w));
  const y = (v) => r1(padT + h - (Math.max(0, Math.min(100, v)) / 100) * h);
  let s = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">`;
  for (const v of [0, 50, 100]) {
    s += `<line class="axis-line" x1="${padL}" x2="${padL + w}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text class="tick" x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  }
  s += `<polyline class="line" points="${points.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")}"/>`;
  for (const p of points) {
    s += `<g><title>${esc(p.label)}: ${p.value}</title><circle class="hit" cx="${x(p.date)}" cy="${y(p.value)}" r="12"/>` +
      `<circle class="dot" cx="${x(p.date)}" cy="${y(p.value)}" r="4"/></g>`;
  }
  const last = points.at(-1);
  s += `<text class="value-label" x="${x(last.date) + 8}" y="${y(last.value) + 4}">${last.value}</text>`;
  return s + "</svg>";
}

export function barSvg(value, max = 100) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="0" height="6" rx="3" width="${r1(pct)}"/></svg>`;
}
