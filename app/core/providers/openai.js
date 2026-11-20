// OpenAI Chat Completions und OpenAI-kompatible Server (Ollama, LM Studio, OpenRouter …).
import { wireSchema } from "../schema.js";
import { badOutput, refusal } from "./errors.js";
import { parseModelJSON, requestJSON, schemaHint } from "./http.js";

export const OPENAI_BASE = "https://api.openai.com/v1";

const base = (p) => String(p.baseUrl || OPENAI_BASE).replace(/\/+$/, "");

function headers(p) {
  const h = { "content-type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  return h;
}

function messages(req, system) {
  const user = req.image
    ? [{ type: "text", text: req.prompt },
       { type: "image_url", image_url: { url: `data:${req.image.mediaType};base64,${req.image.base64}` } }]
    : req.prompt;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

function read(res) {
  const choice = res?.choices?.[0];
  if (choice?.message?.refusal) throw refusal();
  if (choice?.finish_reason === "length") throw badOutput("Antwort abgeschnitten");
  if (choice?.finish_reason === "content_filter") throw refusal();
  return parseModelJSON(choice?.message?.content);
}

async function post(p, body, deps) {
  return requestJSON(deps, `${base(p)}/chat/completions`, { method: "POST", headers: headers(p), body: JSON.stringify(body) });
}

export async function complete(p, req, deps) {
  const strict = {
    model: p.model,
    messages: messages(req, req.system),
    response_format: { type: "json_schema", json_schema: { name: req.schemaName || "answer", schema: wireSchema(req.schema), strict: true } },
  };
  if (p.type !== "compatible") return read(await post(p, strict, deps));
  try {
    return read(await post(p, strict, deps));
  } catch (e) {
    if (e?.code !== "bad_request") throw e;
    // Viele lokale Server kennen json_schema nicht: JSON-Modus + Schema im Systemtext.
    const loose = {
      model: p.model,
      messages: messages(req, req.system + schemaHint(wireSchema(req.schema))),
      response_format: { type: "json_object" },
    };
    return read(await post(p, loose, deps));
  }
}

export async function models(p, deps) {
  const res = await requestJSON(deps, `${base(p)}/models`, { method: "GET", headers: headers(p) });
  return (res?.data || []).map((m) => m?.id).filter((id) => typeof id === "string").sort();
}
