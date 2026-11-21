# SkillTracker – Teil 2: Überarbeiten

Stand: 2026-11-21 · Status: freigegeben („bau weiter“, Entscheidungen unten getroffen)

## Ziel

Aus den Fehlern eines Textes werden Lernaufgaben. Man verbessert seine eigenen Sätze – Schritt für Schritt mit Tipps
oder den ganzen Text auf einmal – und kann die überarbeitete Fassung neu bewerten lassen, um den Fortschritt zu sehen.
Vom Nutzer: „Fehler werden kategorisiert, als Aufgabe gegeben – hier verbesser das mal – mit Tipps. Man kann auch gleich
in die Gesamtrevision, aber das ist schwer, wenn man viele Fehler macht.“

## Ablauf

1. Im Ergebnis eines Textes: **„Überarbeiten“**.
2. Auswahl: **Schritt für Schritt** (empfohlen ab 6 Fehlern, Standard) oder **Ganzer Text**.
3. **Schritt für Schritt** – eine Aufgabe je Fehler, nach Kategorie gruppiert (ein Konzept am Stück):
   - Anzeige: „Aufgabe 3 von 7 · Artikel“, der Satz mit markierter Fehlerstelle, darunter ein Eingabefeld mit dem
     aktuellen Satz zum Bearbeiten.
   - Hilfen, gestuft: **Tipp 1** = allgemeine Regel der Kategorie (fest in der App, offline), **Tipp 2** = die
     Erklärung der KI zu genau diesem Fehler, **Lösung zeigen** = Korrektur.
   - **Prüfen** (lokal, kostenlos): richtig, wenn der Satz der erwarteten Fassung entspricht (Original-Satz mit
     Zitat → Korrektur ersetzt; Groß/klein, Leerraum, Apostrophe und Satzzeichen am Ende egal) oder wenn das fehlerhafte
     Zitat weg und die Korrektur drin ist.
   - Passt es nicht: „Noch nicht ganz“ + Hilfen; dazu **„KI fragen“** (eine kleine Anfrage: ist meine Variante auch
     richtig?) und **„Meine Lösung stimmt auch“** (Selbsteinschätzung).
   - Mehrere Fehler im selben Satz: jede Aufgabe startet mit dem schon bearbeiteten Satz; ist das Zitat dort nicht mehr
     vorhanden, gilt die Aufgabe als „schon erledigt“.
   - Ergebnis je Aufgabe: `solo` (ohne Hilfe), `hint` (mit Tipp), `ai` (KI bestätigt), `self` (selbst eingeschätzt),
     `shown` (Lösung angesehen), `skipped`.
4. **Ganzer Text** – Textfeld mit dem Originaltext; daneben die Fehler je Kategorie gezählt; optional „Stellen zeigen“
   (Markierungen ohne Korrektur).
5. **Abschluss** – Zusammenfassung (wie viele ohne Hilfe, welche Kategorien schwer waren), die überarbeitete Fassung, und:
   **„Überarbeitete Fassung bewerten lassen“** → neuer Eintrag mit Verweis auf das Original; das Ergebnis zeigt das
   Spinnennetz **vorher (gestrichelt) gegen nachher**.

## Daten

- Am Original-Eintrag: `revisions: [{ createdAt, mode: "steps"|"whole", tasks: [{ errorIndex, category, outcome,
  answer }], revisedText, resultEntryId? }]` (kein neuer IndexedDB-Speicher nötig).
- Neu bewertete Fassung: normaler Eintrag mit `revisionOf: <id>`; zählt in Verlauf und Schnitt wie jeder Text.
- Sicherung/Import: `revisions` werden geprüft übernommen; `revisionOf`/`resultEntryId` werden beim Import auf die neuen
  IDs umgeschrieben (unbekannte verworfen).
- Teil 4 (Grammatik-Training) liest später die `outcome`s je Kategorie.

## Kategorie-Tipps

Jede der 36 Kategorien bekommt einen kurzen deutschen Merksatz (`tip`) in `taxonomy.js`.

## KI-Prüfung einer Variante

`judgeRevision(provider, { sentence, answer, quote, correction, category })` → `{ correct: boolean, feedback: string }`
(Deutsch, 1–2 Sätze). Prüfung mit Schema, ein zweiter Versuch wie bei der Bewertung.

## Nicht in Teil 2

Karteikarten (Teil 3), gezielte Übungen je Kategorie (Teil 4).
