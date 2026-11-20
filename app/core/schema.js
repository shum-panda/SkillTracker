// JSON-Schemas für die KI-Antworten und ein kleiner Prüfer (die App vertraut keiner Antwort ungeprüft).
import { CATEGORIES } from "./taxonomy.js";

const str = { type: "string" };
const obj = (properties) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});

export const ANALYSIS_SCHEMA = obj({
  errors: {
    type: "array",
    items: obj({
      quote: str,
      correction: str,
      category: { type: "string", enum: CATEGORIES.map((c) => c.id) },
      severity: { type: "string", enum: ["minor", "major"] },
      explanation: str,
    }),
  },
  gaps: { type: "array", items: obj({ written: str, english: str, note: str }) },
  improved_text: str,
  style: obj({ score: { type: "integer", minimum: 0, maximum: 100 }, comment: str }),
  cefr: { type: "string", enum: ["A1", "A2", "B1", "B2", "C1", "C2"] },
  summary: str,
  strengths: { type: "array", items: str },
  focus: { type: "array", items: str },
});

export const OCR_SCHEMA = obj({ text: str });

// Grenzwerte (minimum/maximum) versteht nicht jeder Anbieter in strukturierter Ausgabe; geprüft wird lokal.
export function wireSchema(schema) {
  if (Array.isArray(schema)) return schema.map(wireSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) if (k !== "minimum" && k !== "maximum") out[k] = wireSchema(v);
  return out;
}

function typeOk(type, v) {
  switch (type) {
    case "object": return v !== null && typeof v === "object" && !Array.isArray(v);
    case "array": return Array.isArray(v);
    case "string": return typeof v === "string";
    case "integer": return Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "boolean": return typeof v === "boolean";
    default: return true;
  }
}

// Liefert eine Liste lesbarer Fehler mit Pfad; leer = gültig.
export function validate(schema, value, path = "", errs = []) {
  const at = path || "(Antwort)";
  const sub = (k) => (path ? `${path}.${k}` : k);
  if (schema.type && !typeOk(schema.type, value)) {
    errs.push(`${at}: erwartet ${schema.type}`);
    return errs;
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: unbekannter Wert ${JSON.stringify(value)}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at}: kleiner als ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at}: größer als ${schema.maximum}`);
  }
  if (schema.type === "object") {
    const props = schema.properties || {};
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) errs.push(`${sub(k)}: fehlt`);
    for (const [k, v] of Object.entries(value)) {
      if (Object.hasOwn(props, k)) validate(props[k], v, sub(k), errs);
      else if (schema.additionalProperties === false) errs.push(`${sub(k)}: nicht erlaubt`);
    }
  }
  if (schema.type === "array" && schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, errs));
  return errs;
}
