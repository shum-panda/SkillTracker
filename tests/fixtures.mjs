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
