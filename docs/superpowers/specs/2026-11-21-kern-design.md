# SkillTracker – Teil 1: Kern (Schreiben → Bewerten → Verlauf)

Stand: 2026-11-21 · Status: freigegeben („mach einfach fertig“, Entscheidungen unten getroffen)

## Ziel

Englisch lernen durch Schreiben. Man schreibt einen Text (meist von Hand), fotografiert ihn, die App liest ihn
ein und bewertet ihn. Das Ergebnis ist ein Spinnennetz mit sechs Achsen, markierte Fehler mit Erklärung, die
Wörter, die einem gefehlt haben, und eine verbesserte Fassung zum Nachsprechen. Über viele Texte zeigt ein Verlauf,
wo man besser wird und welche Fehlerarten immer wiederkommen.

Teil 1 ist das Fundament für die späteren Teile: 2 Überarbeiten, 3 Karteikarten & Lernplan,
4 Grammatik-Training, 5 Synchronisierung (QR + WLAN), 6 Aussprache, 7 Abo. Teil 1 legt deshalb die
**Fehlerkategorien** und das **Datenmodell** so fest, dass diese Teile nur andocken.

## Rahmen (vom Nutzer entschieden)

- Öffentliche App, **eigene KI anbinden** (eigener API-Schlüssel / eigenes Modell). Ein Abo mit gestellter KI kommt
  später (Teil 7) als weiterer Anbieter.
- **Alles bleibt auf dem Gerät.** Kein Konto, kein Server, der Schlüssel oder Texte sieht. Die App ruft die KI direkt
  aus dem Browser auf.
- Synchronisierung später lokal per QR-Code + WLAN (Teil 5). In Teil 1 gibt es Export/Import als Datei.
- Feedback: Werte + markierte Fehler + verbesserte Fassung (aufklappbar). Umschaltbar auf „nur Fehler markieren“.
- Handy und Computer. Oberfläche Deutsch, Zielsprache Englisch.
- Stil wie Flurfunk/Wohnradar: schlicht mit Stil, dezent futuristisch-retro.

## Entscheidungen, die ich getroffen habe

| Thema | Entscheidung | Warum |
|---|---|---|
| Plattform | PWA, reines HTML/CSS/JS (ES-Module), **kein Build-Schritt, keine Laufzeit-Abhängigkeiten** | wie Flurfunk/Wohnradar; läuft als statische Seite überall (eigener Server, GitHub Pages) |
| Tests | `node --test` (Node ≥ 20), ohne Pakete | Logik ist reines JS und im Browser wie in Node lauffähig |
| Speicher | IndexedDB hinter einer kleinen Store-Schnittstelle; für Tests eine Speicher-Variante | Bilder und viele Texte passen nicht in localStorage |
| Anbieter | Claude (Anthropic), OpenAI, Google Gemini, „OpenAI-kompatibel“ (Ollama, LM Studio, OpenRouter …) | deckt eigene Schlüssel und eigene lokale Modelle ab |
| Erkennen ≠ Bewerten | Für Handschrift-Erkennung und Bewertung kann man getrennte Anbieter/Modelle wählen | kleine lokale Modelle können oft keine Bilder |
| Erkennung prüfen | Nach dem Einlesen sieht und korrigiert man den Text, **bevor** bewertet wird | Lesefehler der KI dürfen nicht als eigene Fehler zählen |
| Zählen statt raten | Wortvielfalt, Wortniveau und Satzkomplexität rechnet die App selbst; Grammatik und Satzbau werden aus der Fehlerliste der KI **nach fester Formel** berechnet; nur der Stil ist eine reine KI-Einschätzung | Werte bleiben zwischen Modellen vergleichbar |
| Wortlücken | Fehlt ein Wort, schreibt man es auf Deutsch (oder mit `?` davor). Die KI erkennt es und schlägt das englische Wort vor | Grundlage für Karteikarten in Teil 3 |
| Farbe | Petrol/Türkis als Akzent (Wohnradar ist Orange, Flurfunk hat seine eigene) | eigene Wiedererkennung |
| Logo | Sechseck-Netz (das Spinnennetz) mit einer Feder-Spitze als Messpunkt: „aus deinem Schreiben wird deine Form“ | Logo mit Bedeutung statt Buchstaben |
| Standard-Modell Claude | `claude-opus-5-5`, Aufwand `low`; Modellliste lädt live aus dem Konto | aktuelles Modell; wer sparen will, wählt z. B. Haiku |

## Ablauf

1. **Neuer Text** – Foto aufnehmen/auswählen *oder* Text eintippen/einfügen. Optional ein Thema.
2. **Einlesen** (nur bei Foto) – Bild wird verkleinert (lange Seite ≤ 2000 px, JPEG) und an das Erkennungs-Modell
   geschickt: „genau abschreiben, Fehler nicht verbessern, Unleserliches als `[?]`“.
3. **Prüfen** – Text erscheint im Eingabefeld, `[?]`-Stellen sind hervorgehoben; man korrigiert Lesefehler.
4. **Bewerten** – Text geht an das Bewertungs-Modell mit festem JSON-Schema (unten). Parallel rechnet die App die
   Zählwerte.
5. **Ergebnis** – Spinnennetz (dieser Text vs. eigener Schnitt), Werte je Achse, geschätztes Niveau (A1–C2),
   Kurzfazit, Stärken, „Daran arbeiten“, Text mit markierten Fehlern (antippen → Korrektur + Erklärung),
   fehlende Wörter, verbesserte Fassung (aufklappbar, abschaltbar).
6. **Verlauf** – Verlaufslinien je Achse, häufigste Fehlerkategorien über alle Texte.

## Die sechs Achsen (0–100)

Wörter = `[A-Za-z]+(?:['’][A-Za-z]+)*`, kleingeschrieben. Sätze = Trennung an `.`, `!`, `?` (Abkürzungen wie
„e.g.“, „Mr.“ werden nicht getrennt). `clamp` = auf 0–100 begrenzen, gerundet.

| Achse | Quelle | Formel |
|---|---|---|
| **Grammatik** | KI-Fehler der Gruppe `grammar` | d = gewichtete Fehler je 100 Wörter (leicht = 1, schwer = 2); `100·e^(−d/8)` |
| **Satzbau** | KI-Fehler der Gruppe `structure` | wie oben mit `100·e^(−d/4)` |
| **Wortvielfalt** | gezählt | MTLD (Schwelle 0,72, Mittel aus beiden Richtungen); `clamp((MTLD − 30) / 80 · 100)` |
| **Wortniveau** | gezählt | Anteil bekannter Wörter mit Zipf-Häufigkeit < 4,5 (seltener als „Alltagswort“); `clamp(Anteil / 0,25 · 100)`. Wörter, die nicht in der Liste stehen (Namen, Tippfehler), zählen nicht |
| **Komplexität** | gezählt | Ø Wörter je Satz (L) und Nebensatz-Signale je Satz (S: because, although, which, who, whose, whom, when, while, if, unless, since, whereas, until, that …); `clamp(0,5·(L−6)/16·100 + 0,5·S/1,2·100)` |
| **Stil** | KI | Wert 0–100 nach festem Raster: Abwechslung der Satzanfänge, Verbindungswörter, Register, idiomatische Wendungen |

- Fehler der Gruppen `vocabulary` (Wortwahl, Kollokation, falsche Freunde, Register) und `mechanics` (Rechtschreibung,
  Groß/klein, Zeichensetzung) werden markiert und gezählt, sind aber keine eigene Achse.
- Unter **50 Wörtern** sind Wortvielfalt und Wortniveau unzuverlässig: Hinweis „kurzer Text – Werte schwanken“.
  Unter 10 Wörtern wird nicht bewertet.
- **Häufigkeitsliste:** die 40 000 häufigsten englischen Wörter aus `wordfreq` (Robyn Speer, Daten CC BY-SA 4.0),
  einmalig per Skript in `app/data/wordfreq-en.json` exportiert (Zipf auf eine Nachkommastelle). Quelle wird in
  der App genannt.
- Jede Achse hat ein „Wie wird das berechnet?“ in der App.

## Fehlerkategorien (gemeinsames Rückgrat für Teil 2–4)

Feste Liste mit ID, Gruppe und deutschem Namen in `app/core/taxonomy.js`. Die KI muss eine dieser IDs wählen
(Enum im Schema).

- **grammar:** `tense_choice` Zeitform-Wahl · `present_perfect` Present Perfect · `past_simple` Past Simple ·
  `progressive` Verlaufsform · `future` Zukunft · `verb_form` Verbform · `subject_verb_agreement` Subjekt-Verb-Kongruenz ·
  `article` Artikel · `plural` Plural · `countable` zählbar/unzählbar · `pronoun` Pronomen · `possessive` Besitz ·
  `preposition` Präposition · `adjective_adverb` Adjektiv/Adverb · `comparison` Steigerung · `conditional` If-Sätze ·
  `passive` Passiv · `modal` Modalverben · `gerund_infinitive` -ing oder to · `reported_speech` indirekte Rede
- **structure:** `word_order` Wortstellung · `question_form` Frageform · `negation` Verneinung ·
  `relative_clause` Relativsatz · `conjunction` Satzverbindung · `missing_word` fehlendes Wort ·
  `extra_word` überflüssiges Wort · `run_on` Satz zu lang/verschachtelt · `fragment` unvollständiger Satz
- **vocabulary:** `word_choice` Wortwahl · `collocation` Wortverbindung · `false_friend` falscher Freund ·
  `register` Tonlage
- **mechanics:** `spelling` Rechtschreibung · `capitalization` Groß/klein · `punctuation` Zeichensetzung

## KI-Schnittstelle

### Antwort-Schema der Bewertung (JSON)

```
{
  "errors": [{ "quote": str, "correction": str, "category": <ID>, "severity": "minor"|"major",
               "explanation": str }],
  "gaps": [{ "written": str, "english": str, "note": str }],
  "improved_text": str,
  "style": { "score": int 0–100, "comment": str },
  "cefr": "A1"|"A2"|"B1"|"B2"|"C1"|"C2",
  "summary": str, "strengths": [str], "focus": [str]
}
```

- Erklärungen, Fazit, Stärken und Fokus auf **Deutsch**; `correction`, `english`, `improved_text` auf Englisch.
- `quote` ist das wörtliche Textstück mit dem Fehler. Die App sucht es im Text (der Reihe nach, ab dem vorigen
  Treffer). Nicht gefundene Fehler erscheinen in der Liste ohne Markierung.
- Jede Antwort wird in der App gegen das Schema geprüft (eigener kleiner Prüfer). Ist sie ungültig, gibt es
  **einen** zweiten Versuch mit der Fehlermeldung; danach eine verständliche Fehlermeldung.
- Eine unbekannte Kategorie macht die Antwort ungültig (→ zweiter Versuch); es wird nichts still umgedeutet.

### Erkennung

Antwort `{ "text": str }`. Unleserliches als `[?]`.

### Anbieter

Gemeinsame Schnittstelle je Anbieter: `listModels(provider)` und
`completeJSON(provider, { system, prompt, image?, schema, schemaName })`.

| Anbieter | Aufruf | Strukturierte Ausgabe | Bild |
|---|---|---|---|
| Claude | `POST https://api.anthropic.com/v1/messages`, Kopfzeilen `x-api-key`, `anthropic-version: 2026-10-21`, `anthropic-dangerous-direct-browser-access: true` | `output_config.format = {type: "json_schema", schema}`; `output_config.effort = "low"` | `{type: "image", source: {type: "base64", media_type, data}}` |
| OpenAI | `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer` | `response_format = {type: "json_schema", json_schema: {name, schema, strict: true}}` | `{type: "image_url", image_url: {url: "data:…"}}` |
| Gemini | `POST …/v1beta/models/{model}:generateContent`, `x-goog-api-key` | `generationConfig.responseMimeType = "application/json"` + Schema im Prompt | `inline_data` |
| OpenAI-kompatibel | wie OpenAI mit eigener Basis-URL, Schlüssel optional | erst `json_schema`; lehnt der Server das ab (400), `json_object` + Schema im Prompt | wie OpenAI |

- Bei Claude: `stop_reason: "refusal"` → Fehlermeldung „Das Modell hat die Anfrage abgelehnt“. Für
  `claude-opus-5-5`, `claude-sonnet-5-5` und `claude-fable-5-1` wird die serverseitige Ausweich-Option
  (`anthropic-beta: server-side-fallback-2026-07-01`, `fallbacks: "default"`) mitgeschickt.
- Fehler werden übersetzt: 401/403 „Schlüssel ungültig“, 404 „Modell nicht gefunden“, 429 „Limit erreicht – kurz
  warten“, Netzfehler „keine Verbindung (bei lokalem Modell: läuft es, ist `OLLAMA_ORIGINS` gesetzt?)“.
- Schlüssel werden **nie** an andere Adressen als die des gewählten Anbieters geschickt und nie exportiert, außer
  man wählt es ausdrücklich.

## Datenmodell (IndexedDB `skilltracker`, Version 1)

- `settings` (Schlüssel → Wert): `providers` (Liste `{id, type, name, apiKey, baseUrl, model}`),
  `ocrProvider`, `analysisProvider` (IDs), `showImproved` (bool, Standard true), `theme`.
- `entries` (`id` fortlaufend): `{ id, createdAt, topic, source: "photo"|"typed", thumb (JPEG-Daten-URL ≤ 480 px),
  text, analysis (KI-Antwort), metrics (gezählte Rohwerte), scores {grammar, structure, diversity, level,
  complexity, style}, model {ocr, analysis}, schemaVersion: 1 }`.
- Teil 2–4 hängen später eigene Stores an (`revisions`, `cards`, `reviews`) und verweisen auf
  `entries.id` + Fehler-Index.

## Ansichten

- **Übersicht** `#/` – Spinnennetz aus dem Schnitt der letzten 5 Texte, Zahl der Texte, „Neuer Text“, letzte Texte.
  Ohne Anbieter: Einstieg „KI verbinden“ mit kurzer Erklärung und Links, wo es Schlüssel gibt.
- **Neuer Text** `#/new` – Foto / Tippen, Thema, Einlesen, Prüfen, Bewerten (mit Fortschritt und Abbrechen).
- **Ergebnis** `#/e/<id>` – wie oben unter Ablauf 5; Löschen des Eintrags.
- **Verlauf** `#/history` – Linien je Achse über die Zeit, Top-Fehlerkategorien.
- **Einstellungen** `#/settings` – Anbieter anlegen/bearbeiten/testen/löschen, Modelle laden, Zuordnung
  Erkennung/Bewertung, verbesserte Fassung an/aus, Export/Import, alles löschen, Datenschutz und Quellen.
- **Demo:** `#/demo` füllt einen getrennten Demo-Speicher mit Beispieltexten und vorbereiteten Ergebnissen, damit man
  die App ohne Schlüssel ansehen kann (und für Screenshots).

## Sicherheit und Datenschutz

- Alle Inhalte aus KI-Antworten, Importen und Texten werden beim Einfügen ins HTML **escaped**; keine
  `innerHTML`-Einfügung ungeprüfter Strings.
- Import prüft Aufbau und Typen; unbekannte Felder werden verworfen; Schlüssel im Import werden nur übernommen,
  wenn man es bestätigt.
- Content-Security-Policy: Skripte nur von der eigenen Herkunft; `connect-src` erlaubt `https:` sowie
  `http://localhost:*` und `http://127.0.0.1:*` (lokale Modelle).
- Hinweis in den Einstellungen: Schlüssel liegen unverschlüsselt im Browser-Speicher dieses Geräts; Ausgaben
  beim Anbieter begrenzen.

## Fehlerfälle

- Kein Netz: Zählwerte gehen, Bewertung nicht → klare Meldung, eingegebener Text bleibt erhalten (Entwurf).
- Antwort ungültig nach zweitem Versuch → Meldung mit Modellname, Text bleibt erhalten.
- Bild zu groß / kein Bild → Meldung; Text kann getippt werden.
- Abbrechen während Einlesen/Bewerten bricht die Anfrage ab (`AbortController`).
- Speicher voll / IndexedDB nicht verfügbar (privates Fenster) → Hinweis, App funktioniert ohne Speichern weiter.

## Tests

- `node --test`: Text zerlegen, Sätze, MTLD (Referenzwerte), Wortniveau mit kleiner Testliste, Komplexität,
  Achsen-Formeln, Fehler im Text finden, Schema-Prüfer, Anbieter (Anfrage bauen, Antwort lesen, Fehler übersetzen,
  zweiter Versuch) mit nachgebautem `fetch`, Store (Speicher-Variante), Export/Import ohne Schlüssel, Escape.
- Oberfläche: Screenshots per Chrome DevTools (Handy/PC × hell/dunkel) im Demo-Modus, Prüfung auf horizontales
  Scrollen und Konsolenfehler.
- Echte Anbieter kann ich ohne Schlüssel nicht aufrufen; das prüft der Nutzer mit dem eigenen Schlüssel
  (Knopf „Verbindung testen“).

## Nicht in Teil 1

Überarbeiten, Karteikarten, Lernplan, Grammatik-Übungen, Synchronisierung, Aussprache, Abo, mehrere Zielsprachen,
Konten.
