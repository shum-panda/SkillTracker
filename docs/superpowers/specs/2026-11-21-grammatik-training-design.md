# SkillTracker – Teil 4: Grammatik-Training

Stand: 2026-11-21 · Status: freigegeben („ja“, Entscheidungen unten getroffen)

## Ziel

Grundsätzliche Schwächen bei grammatikalischen Konzepten finden und gezielt trainieren (Wunsch des Nutzers). Die App
erkennt aus allen Texten, Überarbeitungen und Übungen, welche Fehlerarten am meisten bremsen, und erzeugt dazu Übungen.

## Schwächenprofil („Deine Baustellen“)

- Betrachtet werden die letzten 10 Texte (neuere zählen mehr: Gewicht 0,85^Alter) und die Gruppen Grammatik, Satzbau und
  Schreibung (Wortschatz läuft über die Karteikarten).
- Wert je Kategorie = gewichtete Fehler (leicht 1, schwer 2) je 100 Wörter.
- Überarbeiten: Lösung angesehen oder übersprungen +0,5, ohne Hilfe gelöst −0,3 (je Aufgabe, nicht unter 0).
- Übungen: Trefferquote der letzten drei Runden senkt den Wert (× (1 − 0,5 · Quote)).
- Trend: Fehlerrate der neueren gegen die ältere Hälfte der Texte („wird besser“, „gleich“, „mehr geworden“).
- Anzeige: Liste nach Wert, mit Balken, Merksatz, Anzahl Fehler, Trend, letzte Übung; die Top 3 auch im Lernen-Bereich.

## Übungen

Eine Runde = bis zu 3 Übungen aus **deinen eigenen Fehlern** (offline, kostenlos) + 6 Übungen von **deiner KI**.

- Eigene: „Verbessere den Satz“ mit deinem Originalsatz; Lösung = Satz mit Korrektur an der Fehlerstelle.
- KI-Übungen (ein Aufruf, Schema geprüft), drei Arten gemischt:
  - `choose` – Lücke mit 3–4 Antworten zur Auswahl
  - `fill` – Lücke (`___`) mit Hinweis in Klammern, z. B. „(go)“
  - `fix` – Satz mit genau einem Fehler dieser Art verbessern
- Die KI bekommt Kategorie, Merksatz, geschätztes Niveau, Themen und bis zu 3 deiner fehlerhaften Sätze, damit die Übungen
  zu dir passen. Ungültige Übungen (Antwort nicht unter den Optionen, Lücke fehlt …) werden verworfen; unter 3 gültigen →
  Fehlermeldung.
- Prüfen lokal: Groß/klein und Satzzeichen am Ende egal (außer bei den Kategorien Groß/klein bzw. Zeichensetzung), Leerraum
  und Apostrophe vereinheitlicht, `accept` enthält erlaubte Varianten. Bei „falsch“: Lösung + Erklärung, dazu
  „KI fragen“ (bei `fix`) und „Meine Antwort stimmt auch“.
- Die eigenen Übungen erscheinen sofort, die KI-Übungen werden im Hintergrund geladen.
- Ohne KI (oder in der Demo) gibt es nur die eigenen Übungen.

## Daten

- Einstellung `drills`: `[{ createdAt, category, total, correct }]` (höchstens 500, älteste fallen weg); Teil der Sicherung.

## Oberfläche

- `#/train` – Schwächenprofil; „Üben“ je Kategorie. `#/train/<kategorie>` – Übungsrunde mit Abschluss.
- Lernen-Bereich zeigt oben „Deine Baustellen“ (Top 3) mit Link.
