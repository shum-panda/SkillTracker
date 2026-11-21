// Fehlerkategorien – gemeinsames Rückgrat für Bewertung, Überarbeiten, Karteikarten und Grammatik-Training.
// Jede Kategorie hat einen kurzen deutschen Merksatz (tip) – Tipp 1 beim Überarbeiten, offline verfügbar.

export const GROUPS = {
  grammar: { label: "Grammatik" },
  structure: { label: "Satzbau" },
  vocabulary: { label: "Wortschatz" },
  mechanics: { label: "Schreibung" },
};

const LIST = {
  grammar: [
    ["tense_choice", "Zeitform-Wahl", "Frag dich: Wann passiert es – jetzt, regelmäßig, abgeschlossen in der Vergangenheit oder bis jetzt andauernd? Danach richtet sich die Zeitform."],
    ["present_perfect", "Present Perfect", "have/has + 3. Form, wenn etwas bis jetzt reicht oder das Ergebnis jetzt zählt – aber nicht mit genauen Zeitangaben wie yesterday oder last year."],
    ["past_simple", "Past Simple", "Abgeschlossenes in der Vergangenheit (yesterday, last week, in 2020) steht im Past Simple: go → went, buy → bought, work → worked."],
    ["progressive", "Verlaufsform", "be + -ing für etwas, das gerade im Gange ist oder vorübergehend gilt; nicht bei Zustandsverben wie know, like, want."],
    ["future", "Zukunft", "will für spontane Entscheidungen und Vorhersagen, going to für Pläne, Present Progressive für feste Verabredungen."],
    ["verb_form", "Verbform", "Prüf die Form des Verbs: unregelmäßige Formen (went, bought), nach Modalverben die Grundform, nach have die 3. Form."],
    ["subject_verb_agreement", "Subjekt-Verb-Kongruenz", "he/she/it – das s muss mit: she works, he goes, it doesn't. Auch nach everyone, nobody, the team steht meist die 3. Person Singular."],
    ["article", "Artikel", "a vor Konsonant-Laut, an vor Vokal-Laut; the für Bestimmtes; bei allgemeinen Aussagen und unzählbaren Dingen oft gar kein Artikel."],
    ["plural", "Plural", "Mehrzahl meist mit -s; unregelmäßig: people, children, men, women; nach Zahlen größer eins immer Plural."],
    ["countable", "zählbar/unzählbar", "Unzählbares (information, advice, money, furniture) hat kein -s und kein a; many/few für Zählbares, much/little für Unzählbares."],
    ["pronoun", "Pronomen", "Prüf, worauf sich das Pronomen bezieht: Person/Sache, Einzahl/Mehrzahl, Subjekt (I, he) oder Objekt (me, him)."],
    ["possessive", "Besitz", "Besitz mit 's (my friend's car) oder mit his/her/their; its ohne Apostroph – it's heißt it is."],
    ["preposition", "Präposition", "Präpositionen nicht wörtlich aus dem Deutschen übersetzen: by Friday (bis spätestens), at home, on Monday, in the morning, interested in."],
    ["adjective_adverb", "Adjektiv/Adverb", "Adjektive beschreiben Dinge (a quick answer), Adverbien beschreiben Tätigkeiten (answer quickly) – meist mit -ly; good → well."],
    ["comparison", "Steigerung", "Kurze Adjektive mit -er/-est (cheaper), lange mit more/most (more expensive); than beim Vergleich, nie more cheaper."],
    ["conditional", "If-Sätze", "Im if-Teil kein will: If it rains, I will stay. Unwirklich: If I had time, I would go. Vergangen: If I had known, I would have come."],
    ["passive", "Passiv", "Passiv = be + 3. Form (was built, is made); wer es tut, kommt mit by."],
    ["modal", "Modalverben", "Nach can, must, should, might steht die Grundform ohne to; für Pflicht von außen klingt have to oft natürlicher als must."],
    ["gerund_infinitive", "-ing oder to", "Manche Verben wollen -ing (enjoy, avoid, finish), andere to + Grundform (want, decide, hope); nach Präpositionen immer -ing."],
    ["reported_speech", "indirekte Rede", "Bei indirekter Rede rückt die Zeit meist eine Stufe zurück (is → was) und Pronomen passen sich an."],
  ],
  structure: [
    ["word_order", "Wortstellung", "Grundmuster: Subjekt – Verb – Objekt – Ort – Zeit. Zeitangaben an den Anfang oder ans Ende, nie zwischen Verb und Objekt."],
    ["question_form", "Frageform", "Fragen mit Hilfsverb vor dem Subjekt: Do you like …? Where did she go? – ohne Hilfsverb nur bei who/what als Subjekt."],
    ["negation", "Verneinung", "Verneinung mit don't/doesn't/didn't + Grundform; nur eine Verneinung pro Aussage (I don't have any, nicht I don't have no)."],
    ["relative_clause", "Relativsatz", "who für Personen, which für Dinge, that für beides in notwendigen Relativsätzen; kein zusätzliches Pronomen im Relativsatz."],
    ["conjunction", "Satzverbindung", "Verbinde Sätze bewusst: and, but, because, although, so – und setz das passende Verbindungswort statt nur Kommas."],
    ["missing_word", "fehlendes Wort", "Lies den Satz Wort für Wort: Fehlt ein Verb, ein Artikel, eine Präposition oder das Subjekt (it is …)?"],
    ["extra_word", "überflüssiges Wort", "Streich, was doppelt ist oder im Englischen nicht gebraucht wird (z. B. kein to nach can, kein zweites Subjekt)."],
    ["run_on", "Satz zu lang/verschachtelt", "Teil lange Ketten in zwei Sätze oder verbinde sie mit einem passenden Bindewort; zwei Hauptsätze nicht nur mit Komma trennen."],
    ["fragment", "unvollständiger Satz", "Jeder Satz braucht Subjekt und gebeugtes Verb; ein Nebensatz (because …) allein ist kein vollständiger Satz."],
  ],
  vocabulary: [
    ["word_choice", "Wortwahl", "Das Wort passt hier nicht ganz – denk an die genaue Bedeutung im Zusammenhang, nicht an die erste Übersetzung."],
    ["collocation", "Wortverbindung", "Manche Wörter gehören fest zusammen: make a decision, do homework, take a photo, heavy rain."],
    ["false_friend", "falscher Freund", "Sieht deutsch aus, bedeutet aber etwas anderes: become ≠ bekommen, actual ≠ aktuell, eventually ≠ eventuell."],
    ["register", "Tonlage", "Passt die Tonlage zum Anlass? In E-Mails an Fremde eher formell, unter Freunden locker – nicht mischen."],
  ],
  mechanics: [
    ["spelling", "Rechtschreibung", "Schreib das Wort Buchstabe für Buchstabe nach; typische Fallen: doppelte Konsonanten, ie/ei, stummes e."],
    ["capitalization", "Groß/klein", "Im Englischen werden nur Satzanfänge, Namen, Wochentage, Monate, Sprachen und I großgeschrieben – Nomen sonst klein."],
    ["punctuation", "Zeichensetzung", "Weniger Kommas als im Deutschen: kein Komma vor that; Komma nach einleitenden Wörtern (However, …) und vor but/so zwischen Hauptsätzen."],
  ],
};

export const CATEGORIES = Object.entries(LIST).flatMap(([group, items]) =>
  items.map(([id, label, tip]) => ({ id, group, label, tip })));

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
export function categoryById(id) {
  return BY_ID.get(id);
}

export const GROUP_ORDER = Object.keys(GROUPS);
export const categoryRank = (id) => {
  const c = BY_ID.get(id);
  return c ? GROUP_ORDER.indexOf(c.group) * 100 + CATEGORIES.indexOf(c) : 9999;
};
