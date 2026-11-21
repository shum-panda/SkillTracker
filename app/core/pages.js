// Mehrere Seiten (Fotos) eines Textes: sortieren, entfernen, hinzufügen, eingelesene Texte zusammenfügen.

export const MAX_PAGES = 10;

export function movePage(pages, i, dir) {
  const j = i + dir;
  if (i < 0 || i >= pages.length || j < 0 || j >= pages.length) return [...pages];
  const out = [...pages];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function removePage(pages, i) {
  return pages.filter((_, k) => k !== i);
}

export function addPages(pages, added) {
  const room = Math.max(0, MAX_PAGES - pages.length);
  return { pages: [...pages, ...added.slice(0, room)], dropped: Math.max(0, added.length - room) };
}

export function joinPages(texts) {
  return texts.map((t) => String(t || "").trim()).filter(Boolean).join("\n\n");
}

// Vorschaubilder eines Eintrags – neue Einträge haben `thumbs`, ältere ein einzelnes `thumb`.
export function entryThumbs(entry) {
  if (Array.isArray(entry?.thumbs)) return entry.thumbs.filter(Boolean);
  return entry?.thumb ? [entry.thumb] : [];
}
