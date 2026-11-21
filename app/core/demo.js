// Beispieltexte mit vorbereiteten Bewertungen: zum Ansehen ohne Schlüssel und für Screenshots.
// Die Zählwerte und Achsen werden wie bei echten Texten berechnet.
import { computeMetrics } from "./metrics.js";
import { computeScores } from "./scores.js";

const E = (quote, correction, category, severity, explanation) => ({ quote, correction, category, severity, explanation });

const SAMPLES = [
  {
    daysAgo: 42, topic: "My weekend", source: "photo",
    text: "Last weekend I go with my friend to the Wochenmarkt. We buyed vegetables and a big cake. The weather was " +
      "very good, so we sit in the park for two hours. My friend tell me about her new job. She work in a office near " +
      "the river. In the evening I was very tired but happy. I want to do this again next weekend.",
    analysis: {
      errors: [
        E("I go", "I went", "past_simple", "major", "Für abgeschlossene Ereignisse in der Vergangenheit (last weekend) nimmst du das Past Simple."),
        E("buyed", "bought", "verb_form", "major", "„buy“ ist unregelmäßig: buy – bought – bought."),
        E("we sit", "we sat", "past_simple", "major", "Auch hier erzählst du von der Vergangenheit: sit – sat."),
        E("friend tell", "friend told", "past_simple", "major", "Vergangenheit: tell – told."),
        E("She work", "She works", "subject_verb_agreement", "major", "Bei he/she/it hängt im Present Simple ein -s am Verb."),
        E("a office", "an office", "article", "minor", "Vor einem Vokal-Laut wird aus „a“ ein „an“."),
      ],
      gaps: [{ written: "Wochenmarkt", english: "farmers' market", note: "Auch „weekly market“ geht." }],
      improved_text: "Last weekend I went to the farmers' market with my friend. We bought vegetables and a big cake. " +
        "The weather was lovely, so we sat in the park for two hours. My friend told me about her new job – she works " +
        "in an office by the river. By the evening I was tired but happy, and I'd love to do it again next weekend.",
      style: { score: 30, comment: "Klar verständlich, aber viele kurze Sätze mit gleichem Anfang." },
      cefr: "A2",
      summary: "Du erzählst verständlich und lebendig, die Vergangenheitsformen sitzen aber noch nicht.",
      strengths: ["klarer Ablauf", "passende Alltagswörter"],
      focus: ["Past Simple bei Erzählungen", "-s bei he/she/it"],
    },
  },
  {
    daysAgo: 28, topic: "Why I learn English", source: "photo",
    text: "I learn English because I want to understand people from other countries. When I was in school, I " +
      "understood a lot, but I could never speak. Now I write every day a few sentences and then I read them loud. It " +
      "helps me a lot, because I must think about the order of the words. Sometimes I don't know a word, then I write " +
      "it in German, for example ?Fernweh. I think my English is getting better slowly.",
    analysis: {
      errors: [
        E("I write every day a few sentences", "every day I write a few sentences", "word_order", "major",
          "Zeitangaben wie „every day“ stehen am Satzanfang oder -ende, nicht zwischen Verb und Objekt."),
        E("read them loud", "read them aloud", "word_choice", "minor", "„Laut vorlesen“ heißt „read aloud“; „loud“ beschreibt die Lautstärke."),
        E("I must think", "I have to think", "modal", "minor", "Für einen Zwang von außen klingt „have to“ natürlicher als „must“."),
        E("getting better slowly", "slowly getting better", "word_order", "minor", "Adverbien wie „slowly“ stehen hier vor dem -ing-Verb."),
      ],
      gaps: [{ written: "?Fernweh", english: "wanderlust", note: "Ein deutsches Lehnwort, das im Englischen bekannt ist." }],
      improved_text: "I'm learning English because I want to understand people from other countries. At school I " +
        "understood a lot, but I could never really speak. Now I write a few sentences every day and then read them " +
        "aloud. It helps a lot, because I have to think about word order. When I don't know a word, I write it in " +
        "German – wanderlust, for example. I think my English is slowly getting better.",
      style: { score: 48, comment: "Schon abwechslungsreicher, mit ersten Verbindungen über because und when." },
      cefr: "A2",
      summary: "Deutlich flüssiger als zuvor; die Wortstellung ist jetzt die größte Baustelle.",
      strengths: ["Nebensätze mit because/when", "persönlicher Ton"],
      focus: ["Wortstellung von Zeitangaben", "have to statt must"],
    },
  },
  {
    daysAgo: 14, topic: "A difficult day", source: "typed",
    text: "Yesterday was a difficult day at work. My boss asked me to finish a report until Friday, although I had " +
      "already three other tasks. I was nervous, because I didn't know how I should organise everything. In the end I " +
      "talked with a colleague who helped me to make a plan. We divided the work into small steps, and suddenly it " +
      "didn't look so frightening anymore. I learned that asking for help is not a weakness.",
    analysis: {
      errors: [
        E("until Friday", "by Friday", "preposition", "major", "Für eine Frist („bis spätestens“) nimmst du „by“; „until“ heißt „die ganze Zeit bis“."),
        E("had already three", "already had three", "word_order", "minor", "„already“ steht vor dem Vollverb „had“."),
        E("talked with", "talked to", "preposition", "minor", "Im britischen Englisch sagt man meist „talk to someone“."),
      ],
      gaps: [],
      improved_text: "Yesterday was a tough day at work. My boss asked me to finish a report by Friday, even though I " +
        "already had three other tasks. I was nervous because I didn't know how to organise everything. In the end I " +
        "talked to a colleague, who helped me make a plan. We broke the work down into small steps, and suddenly it " +
        "didn't seem so daunting any more. I learned that asking for help isn't a weakness.",
      style: { score: 66, comment: "Gute Verbindungen (although, in the end, suddenly) und ein klarer Bogen." },
      cefr: "B1",
      summary: "Ein gut aufgebauter Text mit Nebensätzen; nur Präpositionen machen noch Ärger.",
      strengths: ["Relativsatz mit who", "klare Pointe am Ende"],
      focus: ["by vs. until", "Stellung von already"],
    },
  },
  {
    daysAgo: 3, topic: "Living in Berlin", source: "photo",
    text: "Living in Berlin has taught me to appreciate small things. Although the city is loud and sometimes chaotic, " +
      "there is always a quiet corner where you can read a book or watch people passing by. What I like most is the " +
      "variety: on the same street you can find a Turkish bakery, a Vietnamese restaurant and an old bookshop which " +
      "has been there since the seventies. However, the rents have risen so much that many of my friends had to move " +
      "to the outskirts. I wonder whether the city will keep its character if this continues.",
    analysis: {
      errors: [
        E("the rents", "rents", "article", "minor", "Bei allgemeinen Aussagen steht im Englischen meist kein Artikel."),
      ],
      gaps: [],
      improved_text: "Living in Berlin has taught me to appreciate the little things. Although the city is loud and " +
        "sometimes chaotic, there's always a quiet corner where you can read a book or watch the world go by. What I " +
        "love most is the variety: on a single street you'll find a Turkish bakery, a Vietnamese restaurant and an old " +
        "bookshop that has been there since the seventies. Rents, however, have risen so sharply that many of my " +
        "friends have had to move to the outskirts. I wonder whether the city will keep its character if this goes on.",
      style: { score: 78, comment: "Abwechslungsreiche Satzanfänge und eine natürliche, erzählende Tonlage." },
      cefr: "B2",
      summary: "Ein reifer, gut verbundener Text mit fast keinen Fehlern.",
      strengths: ["Satzvielfalt", "präzise Wortwahl (outskirts, variety)"],
      focus: ["Artikel bei allgemeinen Aussagen"],
    },
  },
];

export function demoEntries(freqMap, now = new Date()) {
  return SAMPLES.map((s, i) => {
    const metrics = computeMetrics(s.text, freqMap);
    return {
      id: i + 1,
      createdAt: new Date(now.getTime() - s.daysAgo * 86400000).toISOString(),
      topic: s.topic,
      source: s.source,
      thumbs: [],
      text: s.text,
      analysis: structuredClone(s.analysis),
      metrics,
      scores: computeScores(metrics, s.analysis),
      model: { ocr: s.source === "photo" ? "Demo" : "", analysis: "Demo" },
      speaking: DEMO_SPEAKING[i].map(([days, score, missed]) => ({
        createdAt: new Date(now.getTime() - days * 86400000).toISOString(), method: "ai", source: "improved", score,
        sentences: [], missed,
      })),
      schemaVersion: 1,
    };
  });
}

// Aussprache-Übungen der Beispieltexte: [vor Tagen, Wert, schwierige Wörter]
const DEMO_SPEAKING = [
  [[41, 58, ["weekend", "lovely"]]],
  [[27, 66, ["wanderlust", "aloud"]]],
  [[13, 74, ["daunting"]], [10, 81, []]],
  [[2, 86, ["character"]]],
];
