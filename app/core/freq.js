// Worthäufigkeiten (Zipf-Skala: 7 = "the", 3 = selten). Quelle: wordfreq, CC BY-SA 4.0.

export function parseFreq(json) {
  const map = new Map();
  for (const [band, words] of Object.entries(json?.bands || {})) {
    const zipf = Number(band) / 10;
    if (!Number.isFinite(zipf)) continue;
    for (const w of String(words).split(" ")) if (w && !map.has(w)) map.set(w, zipf);
  }
  return map;
}

export function zipfOf(map, word) {
  return map.get(word);
}
