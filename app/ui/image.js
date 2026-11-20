// Foto vorbereiten: verkleinern (lange Seite ≤ 2000 px), als JPEG; dazu eine kleine Vorschau (≤ 480 px).

async function decode(file) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch { /* Rückfall unten */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src, maxSide) {
  const w = src.width;
  const h = src.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new Error("Das ist kein Bild.");
  if (file.size > 40 * 1024 * 1024) throw new Error("Das Bild ist zu groß (über 40 MB).");
  let src;
  try {
    src = await decode(file);
  } catch {
    throw new Error("Das Bild konnte nicht gelesen werden. Bitte als JPEG oder PNG versuchen.");
  }
  const big = draw(src, 2000).toDataURL("image/jpeg", 0.85);
  const thumb = draw(src, 480).toDataURL("image/jpeg", 0.7);
  src.close?.();
  return { mediaType: "image/jpeg", base64: big.slice(big.indexOf(",") + 1), thumb };
}
