// Ein Einstieg für alle Anbieter. Ein Anbieter = {id, type, name, apiKey, baseUrl, model}.
import * as anthropic from "./anthropic.js";
import * as openai from "./openai.js";
import * as gemini from "./gemini.js";
import { AiError } from "./errors.js";

export const PROVIDER_TYPES = {
  anthropic: { label: "Claude (Anthropic)", defaultModel: "claude-opus-5-5", needsKey: true, needsBaseUrl: false,
    keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { label: "OpenAI", defaultModel: "", needsKey: true, needsBaseUrl: false,
    keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { label: "Google Gemini", defaultModel: "", needsKey: true, needsBaseUrl: false,
    keyUrl: "https://aistudio.google.com/app/apikey" },
  compatible: { label: "OpenAI-kompatibel (Ollama, LM Studio, OpenRouter …)", defaultModel: "", needsKey: false,
    needsBaseUrl: true, defaultBaseUrl: "http://localhost:11434/v1", keyUrl: "https://ollama.com/download" },
};

const IMPL = { anthropic, openai, gemini, compatible: openai };

function impl(p) {
  const m = IMPL[p?.type];
  if (!m) throw new AiError("bad_request", "Unbekannter Anbieter.");
  return m;
}

export function listModels(provider, deps = {}) {
  return impl(provider).models(provider, deps);
}

// Liefert das geparste JSON der Antwort (noch ungeprüft – das macht ai.js).
export function completeJSON(provider, req, deps = {}) {
  if (!provider.model) return Promise.reject(new AiError("not_found", "Kein Modell gewählt."));
  return impl(provider).complete(provider, req, deps);
}
