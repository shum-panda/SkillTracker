// Gemeinsame HTTP-Hilfen: Anfrage schicken, Fehler übersetzen, JSON aus Modelltext lesen.
import { badOutput, fromHttp, fromThrown } from "./errors.js";

export async function requestJSON(deps, url, init) {
  const doFetch = deps?.fetch || globalThis.fetch.bind(globalThis);
  let res;
  try {
    res = await doFetch(url, { ...init, signal: deps?.signal });
  } catch (e) {
    throw fromThrown(e);
  }
  let text;
  try {
    text = await res.text();
  } catch (e) {
    throw fromThrown(e);
  }
  if (!res.ok) throw fromHttp(res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw badOutput("Antwort ist kein JSON");
  }
}

// Modelle verpacken JSON manchmal in ```json … ``` oder schreiben einen Satz davor.
export function parseModelJSON(text) {
  const s = String(text ?? "").trim();
  const candidates = [s];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].trim());
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(s.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch { /* nächster Versuch */ }
  }
  throw badOutput("kein gültiges JSON in der Antwort");
}

export const schemaHint = (schema) =>
  "\n\nAntworte ausschließlich mit einem JSON-Objekt nach diesem JSON-Schema, ohne weiteren Text:\n" +
  JSON.stringify(schema);
