# SkillTracker – Teil 3: Karteikarten & Lernplan

Stand: 2026-11-21 · Status: freigegeben („mach“, Entscheidungen unten getroffen)

## Ziel

Wortlücken schließen: Aus den Wörtern, die beim Schreiben gefehlt haben, und aus Wortschatz-Fehlern entstehen
automatisch Karteikarten. Ein Lernplan sagt, was heute dran ist (Wiederholung in wachsenden Abständen).

## Karten

| Typ | Quelle | Vorderseite | Rückseite |
|---|---|---|---|
| `gap` | `analysis.gaps` | das deutsche Wort + englischer Satz aus der verbesserten Fassung mit Lücke (`____`), falls das Wort dort vorkommt | englisches Wort, Hinweis |
| `vocab` | Fehler der Gruppe Wortschatz (Wortwahl, Wortverbindung, falscher Freund, Tonlage) | dein Satz mit markierter Stelle: „Was passt besser?“ | Korrektur + Erklärung |
| `manual` | selbst angelegt | frei | frei |

- Jede Karte hat einen Schlüssel (`typ|englisch, klein`). Gibt es ihn schon, wird keine zweite Karte angelegt, nur die
  Quelle ergänzt.
- Karten entstehen automatisch beim Speichern einer Bewertung; vorhandene Texte werden beim ersten Öffnen von „Lernen“
  nachgetragen (idempotent).
- Karten lassen sich pausieren, löschen und bearbeiten; eigene Karten lassen sich anlegen.

## Lernplan (vereinfachtes SM-2, wie Anki)

- Bewertung nach dem Aufdecken: **Nochmal · Schwer · Gut · Leicht**.
- Neue/lernende Karten: Nochmal → 1 Min., Schwer → 6 Min., Gut → 10 Min. (erster Schritt) bzw. 1 Tag (zweiter),
  Leicht → 4 Tage.
- Wiederholung: Faktor startet bei 2,5. Nochmal → zurück zum Lernen, Faktor −0,2 (min. 1,3), Intervall halbiert.
  Schwer → ×1,2, Faktor −0,15. Gut → ×Faktor. Leicht → ×Faktor×1,3, Faktor +0,15. Mindestens ein Tag mehr als zuvor.
- Täglich höchstens **10 neue Karten** (einstellbar 0–50). Fällige Wiederholungen immer.
- Sitzung: fällige Karten, dann neue; lernende Karten kommen wieder, sobald fällig (bis 20 Min. vorgezogen, wenn sonst
  nichts mehr da ist).
- Übersicht „Lernen“: heute fällig, neue verfügbar, Vorschau der nächsten 7 Tage, Kartenliste.

## Daten

- IndexedDB-Version 2: neuer Speicher `cards` (`id` fortlaufend, Index `key`).
- Karte: `{ id, key, type, front, back, note, context, sources: [entryId], createdAt, suspended,
  sched: { state: "new"|"learning"|"review", step, due, interval, ease, reps, lapses, firstStudied } }`.
- Sicherung: `cards` werden mit exportiert und beim Import geprüft (Quellen auf neue IDs umgeschrieben).

## Oberfläche

- Neuer Navigationspunkt **Lernen** (`#/learn`), Sitzung unter `#/learn/session`.
- Übersicht zeigt „Heute fällig: N Karten“.
- Im Ergebnis eines Textes: Hinweis, wie viele Karten daraus entstanden sind.

## Nicht in Teil 3

Grammatik-Übungen je Kategorie (Teil 4), Aussprache (Teil 6).
