// Claude (Anthropic Messages API), direkt aus dem Browser mit eigenem Schlüssel.
import { wireSchema } from "../schema.js";
import { badOutput, refusal } from "./errors.js";
import { parseModelJSON, requestJSON } from "./http.js";

const BASE = "https://api.anthropic.com/v1";
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

function headers(p, extra = {}) {
  return {
    "content-type": "application/json",
    "x-api-key": p.apiKey || "",
    "anthropic-version": "2026-10-21",
    "anthropic-dangerous-direct-browser-access": "true",
    ...extra,
  };
}

// effort gibt es ab den 4.6-Modellen; ältere lehnen das Feld ab.
export function supportsEffort(model) {
  const m = String(model).match(/^claude-[a-z]+-(\d+)(?:-(\d+))?/);
  if (!m) return false; // unbekannt/alt (z. B. claude-3-5-haiku-latest): lieber ohne effort
  const major = Number(m[1]);
  const minor = m[2] && m[2].length < 3 ? Number(m[2]) : 0;
  return major >= 5 || (major === 4 && minor >= 6);
}

export async function complete(p, req, deps) {
  const content = [];
  if (req.image) {
    content.push({ type: "image", source: { type: "base64", media_type: req.image.mediaType, data: req.image.base64 } });
  }
  content.push({ type: "text", text: req.prompt });
  const output_config = { format: { type: "json_schema", schema: wireSchema(req.schema) } };
  if (supportsEffort(p.model)) output_config.effort = "low";
  const body = { model: p.model, max_tokens: 16000, system: req.system, messages: [{ role: "user", content }], output_config };
  const extra = {};
  if (FALLBACK_MODELS.has(p.model)) {
    body.fallbacks = "default";
    extra["anthropic-beta"] = "server-side-fallback-2026-07-01";
  }
  const res = await requestJSON(deps, `${BASE}/messages`, { method: "POST", headers: headers(p, extra), body: JSON.stringify(body) });
  if (res?.stop_reason === "refusal") throw refusal();
  if (res?.stop_reason === "max_tokens") throw badOutput("Antwort abgeschnitten (max_tokens)");
  const text = (res?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("");
  return parseModelJSON(text);
}

export async function models(p, deps) {
  const res = await requestJSON(deps, `${BASE}/models?limit=100`, { method: "GET", headers: headers(p) });
  return (res?.data || []).map((m) => m?.id).filter((id) => typeof id === "string").sort();
}
