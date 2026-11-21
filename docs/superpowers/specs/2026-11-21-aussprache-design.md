# SkillTracker – Teil 6: Aussprache

Stand: 2026-11-21 · Status: freigegeben („Ja“, Entscheidungen unten getroffen)

## Ziel

Die Übung des Nutzers vervollständigen: Sätze aufschreiben **und danach nachsprechen**. Pro Text übt man die verbesserte
Fassung (oder die eigene Überarbeitung) Satz für Satz: anhören, selbst sprechen, sich selbst anhören, bewerten.

## Bewerten – zwei Wege (offen war: Selbsteinschätzung oder Audio-Bewertung → beides)

1. **Selbsteinschätzung** (immer verfügbar, offline): je Satz „flüssig“ (100) · „ging so“ (60) · „schwer“ (20).
2. **Automatisch: Verständlichkeit.** Die Aufnahme wird in Text umgewandelt und Wort für Wort mit dem Zielsatz
   verglichen (Ausrichtung über längste gemeinsame Teilfolge). Wert = erkannte Zielwörter / alle Zielwörter. Nicht
   erkannte Wörter werden rot markiert und als „schwierige Wörter“ gesammelt. Das misst, ob man verstanden wird –
   kein phonetisches Gutachten (so wird es auch in der App erklärt).
   - **Eigene KI:** OpenAI bzw. OpenAI-kompatibel über `/audio/transcriptions` (Modell einstellbar, Standard `whisper-1`),
     Gemini über `generateContent` mit Audio. Claude versteht kein Audio und wird hier nicht angeboten.
   - **Browser-Erkennung** (Web Speech API, z. B. Chrome): kostenlos, aber der Browser schickt die Aufnahme an seinen
     Anbieter (bei Chrome Google) – Hinweis in der App, Nutzung nur nach Auswahl.
   - Die Aufnahme wird vor dem Senden in WAV (16 kHz, mono) umgewandelt, das verstehen alle Anbieter.

## Anhören

Mustersprecher über die Sprachausgabe des Geräts (`speechSynthesis`, englische Stimme, Tempo 0,8 oder 1,0) –
kostenlos und offline. Eigene Aufnahmen bleiben nur im Speicher der Seite und werden **nie gespeichert**.

## Daten

- Am Eintrag: `speaking: [{ createdAt, method: "self"|"ai"|"browser", source: "improved"|"revision"|"own",
  score, sentences: [{ i, score }], missed: [Wörter] }]` (höchstens 50). Teil von Sicherung und Abgleich
  (Vereinigung über Zeitpunkt).
- Einstellungen: `speechProvider` (ID eines Anbieters oder `browser`), `speechModel` (für OpenAI/kompatibel).

## Oberfläche

- Ergebnis eines Textes: Knopf **„Aussprechen üben“** → `#/e/<id>/speak`.
- Übungsansicht: Textwahl, Bewertungsweg, dann Satz für Satz: ▶ Anhören · ● Aufnehmen/■ Stopp · ▶ Mich anhören ·
  Prüfen bzw. Selbsteinschätzung · Weiter. Am Ende Gesamtwert und schwierige Wörter; speichern.
- Ergebnis eines Textes zeigt die letzten Aussprache-Übungen; der Verlauf bekommt eine Linie „Aussprache“
  (nicht im Spinnennetz – das bewertet das Schreiben).
- CSP: `media-src 'self' blob:` für das Abspielen der eigenen Aufnahme; Mikrofon nur nach Nachfrage des Browsers.
