// Text mit markierten Fehlern als HTML (alles escaped; nur die eigenen <mark>/<br> sind Markup).
import { esc } from "../core/html.js";
import { categoryById } from "../core/taxonomy.js";

const withBreaks = (s) => esc(s).replace(/\r?\n/g, "<br>");

export function highlightHtml(text, spans, errors) {
  const src = String(text || "");
  const sorted = [...(spans || [])].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  for (const sp of sorted) {
    if (sp.start < pos) continue;
    const group = categoryById(errors?.[sp.index]?.category)?.group || "grammar";
    out += withBreaks(src.slice(pos, sp.start));
    out += `<mark class="err ${group}" data-i="${sp.index}" tabindex="0">${withBreaks(src.slice(sp.start, sp.end))}</mark>`;
    pos = sp.end;
  }
  return out + withBreaks(src.slice(pos));
}
