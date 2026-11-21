// Gemeinsame Testdaten (keine Tests in dieser Datei).
export const GOOD = {
  errors: [{ quote: "he go", correction: "he goes", category: "subject_verb_agreement", severity: "major",
    explanation: "Bei he/she/it kommt ein -s ans Verb." }],
  gaps: [{ written: "Wochenmarkt", english: "farmers' market", note: "" }],
  improved_text: "On Saturday he goes to the farmers' market.",
  style: { score: 55, comment: "Einfach, aber klar." },
  cefr: "A2",
  summary: "Verständlich.", strengths: ["klare Sätze"], focus: ["3. Person -s"],
};

// Nachgebautes fetch: merkt sich Anfragen, liefert der Reihe nach vorbereitete Antworten (letzte wiederholt).
export function fakeFetch(...answers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined, headers: init.headers || {} });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return new Response(typeof a.body === "string" ? a.body : JSON.stringify(a.body), { status: a.status || 200 });
  };
  fn.calls = calls;
  return fn;
}
