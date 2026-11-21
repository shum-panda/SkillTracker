// Spracherkennung über die eigene KI: OpenAI/kompatibel (/audio/transcriptions) oder Gemini (Audio im Prompt).
import { AiError } from "./errors.js";
import { requestJSON } from "./http.js";
import { OPENAI_BASE } from "./openai.js";
import * as gemini from "./gemini.js";
import { bytesToBase64 } from "../wav.js";

const TRANSCRIBE_SYSTEM = "You transcribe spoken English exactly as it is pronounced and understood. Do not correct grammar, do " +
  "not add or remove words, do not translate. If something is unintelligible, leave it out. Return JSON {\"text\": \"…\"}.";
const SCHEMA = { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false };

export async function transcribeAudio(provider, wavBytes, { model = "" } = {}, deps = {}) {
  if (provider?.type === "openai" || provider?.type === "compatible") {
    const base = String(provider.type === "compatible" ? provider.baseUrl || OPENAI_BASE : OPENAI_BASE).replace(/\/+$/, "");
    const form = new FormData();
    form.append("file", new Blob([wavBytes], { type: "audio/wav" }), "speech.wav");
    form.append("model", model || "whisper-1");
    form.append("language", "en");
    form.append("response_format", "json");
    const headers = provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};
    const res = await requestJSON(deps, `${base}/audio/transcriptions`, { method: "POST", headers, body: form });
    return String(res?.text || "");
  }
  if (provider?.type === "gemini") {
    const out = await gemini.complete(provider, {
      system: TRANSCRIBE_SYSTEM, prompt: "Transcribe this recording.", schema: SCHEMA, schemaName: "transcript",
      image: { mediaType: "audio/wav", base64: bytesToBase64(wavBytes) },
    }, deps);
    return String(out?.text || "");
  }
  throw new AiError("bad_request", "Dieser Anbieter versteht kein Audio – wähle OpenAI, Gemini, einen kompatiblen Server oder die Browser-Erkennung.");
}
