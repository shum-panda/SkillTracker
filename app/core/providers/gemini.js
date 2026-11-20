// Google Gemini (generateContent). Schlüssel im Kopf, nie in der URL.
import { wireSchema } from "../schema.js";
import { badOutput, refusal } from "./errors.js";
import { parseModelJSON, requestJSON, schemaHint } from "./http.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

const headers = (p) => ({ "content-type": "application/json", "x-goog-api-key": p.apiKey || "" });

export async function complete(p, req, deps) {
  const parts = [];
  if (req.image) parts.push({ inline_data: { mime_type: req.image.mediaType, data: req.image.base64 } });
  parts.push({ text: req.prompt });
  const body = {
    systemInstruction: { parts: [{ text: req.system + schemaHint(wireSchema(req.schema)) }] },
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json" },
  };
  const url = `${BASE}/models/${encodeURIComponent(p.model)}:generateContent`;
  const res = await requestJSON(deps, url, { method: "POST", headers: headers(p), body: JSON.stringify(body) });
  if (res?.promptFeedback?.blockReason) throw refusal();
  const cand = res?.candidates?.[0];
  if (["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "RECITATION"].includes(cand?.finishReason)) throw refusal();
  if (cand?.finishReason === "MAX_TOKENS") throw badOutput("Antwort abgeschnitten");
  return parseModelJSON((cand?.content?.parts || []).map((x) => x?.text || "").join(""));
}

export async function models(p, deps) {
  const res = await requestJSON(deps, `${BASE}/models?pageSize=200`, { method: "GET", headers: headers(p) });
  return (res?.models || [])
    .filter((m) => (m?.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort();
}
