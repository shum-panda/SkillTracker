// Fehlerkategorien – gemeinsames Rückgrat für Bewertung, Überarbeiten, Karteikarten und Grammatik-Training.

export const GROUPS = {
  grammar: { label: "Grammatik" },
  structure: { label: "Satzbau" },
  vocabulary: { label: "Wortschatz" },
  mechanics: { label: "Schreibung" },
};

const LIST = {
  grammar: [
    ["tense_choice", "Zeitform-Wahl"], ["present_perfect", "Present Perfect"], ["past_simple", "Past Simple"],
    ["progressive", "Verlaufsform"], ["future", "Zukunft"], ["verb_form", "Verbform"],
    ["subject_verb_agreement", "Subjekt-Verb-Kongruenz"], ["article", "Artikel"], ["plural", "Plural"],
    ["countable", "zählbar/unzählbar"], ["pronoun", "Pronomen"], ["possessive", "Besitz"],
    ["preposition", "Präposition"], ["adjective_adverb", "Adjektiv/Adverb"], ["comparison", "Steigerung"],
    ["conditional", "If-Sätze"], ["passive", "Passiv"], ["modal", "Modalverben"],
    ["gerund_infinitive", "-ing oder to"], ["reported_speech", "indirekte Rede"],
  ],
  structure: [
    ["word_order", "Wortstellung"], ["question_form", "Frageform"], ["negation", "Verneinung"],
    ["relative_clause", "Relativsatz"], ["conjunction", "Satzverbindung"], ["missing_word", "fehlendes Wort"],
    ["extra_word", "überflüssiges Wort"], ["run_on", "Satz zu lang/verschachtelt"],
    ["fragment", "unvollständiger Satz"],
  ],
  vocabulary: [
    ["word_choice", "Wortwahl"], ["collocation", "Wortverbindung"], ["false_friend", "falscher Freund"],
    ["register", "Tonlage"],
  ],
  mechanics: [["spelling", "Rechtschreibung"], ["capitalization", "Groß/klein"], ["punctuation", "Zeichensetzung"]],
};

export const CATEGORIES = Object.entries(LIST).flatMap(([group, items]) =>
  items.map(([id, label]) => ({ id, group, label })));

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export function categoryById(id) {
  return BY_ID.get(id);
}
