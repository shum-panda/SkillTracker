// Einheitliche Fehler für alle Anbieter, mit deutscher Meldung für die Oberfläche.

export class AiError extends Error {
  constructor(code, message, detail = "") {
    super(message);
    this.name = "AiError";
    this.code = code; // auth | not_found | rate_limit | bad_request | server | network | aborted | refusal | bad_output
    this.detail = detail;
  }
}

function providerMessage(bodyText) {
  try {
    const j = JSON.parse(bodyText);
    const m = j?.error?.message ?? j?.message ?? (typeof j?.error === "string" ? j.error : "");
    return String(m || "").slice(0, 240);
  } catch {
    return String(bodyText || "").slice(0, 240);
  }
}

export function fromHttp(status, bodyText) {
  const detail = providerMessage(bodyText);
  if (status === 401 || status === 403) return new AiError("auth", "Schlüssel ungültig oder ohne Berechtigung.", detail);
  if (status === 404) return new AiError("not_found", "Modell oder Adresse nicht gefunden.", detail);
  if (status === 429) return new AiError("rate_limit", "Limit beim Anbieter erreicht – kurz warten und erneut versuchen.", detail);
  if (status >= 500) return new AiError("server", "Der Anbieter hat gerade Probleme. Später erneut versuchen.", detail);
  return new AiError("bad_request", "Der Anbieter hat die Anfrage abgelehnt.", detail);
}

export function fromThrown(e) {
  if (e instanceof AiError) return e;
  if (e?.name === "AbortError") return new AiError("aborted", "Abgebrochen.");
  return new AiError("network",
    "Keine Verbindung zum Anbieter. Bei einem lokalen Modell: Läuft es, und erlaubt es Anfragen aus dem Browser " +
    "(bei Ollama OLLAMA_ORIGINS)?", String(e?.message || ""));
}

export const refusal = () => new AiError("refusal", "Das Modell hat die Anfrage abgelehnt.");
export const badOutput = (detail = "") =>
  new AiError("bad_output", "Die Antwort des Modells war unbrauchbar.", detail);
