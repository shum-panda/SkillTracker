# SkillTracker – Teil 7: Lernbegleiter

Stand: 2026-11-21 · Status: Entwurf freigegeben („perfekt“), Spec zur Prüfung · Das Abo wird Teil 8.

## Ziel

Die App soll einen **an die Hand nehmen**: beim ersten Start erklären, was sie macht, und fragen, was man will. Danach
plant sie jeden Tag eine passende Lerneinheit, erinnert daran und bringt einen mit einem Tipp direkt hinein. Wer die
App öffnet, ist **mit einem Tipp beim Schreiben oder beim Lernen**. Eine Heatmap wie bei GitHub zeigt die eigene
Aktivität.

Entscheidungen des Nutzers: Erinnerungen über **Cloudflare und zusätzlich im Gerät** („Beides“). Akzentfarbe für
diesen Teil **Lila** (Heatmap, Plan-Karte, Onboarding-Hervorhebungen). Die übrige App behält ihr Petrol.

## 1. Startbildschirm „Heute“ (`#/`)

Reihenfolge von oben nach unten:

1. **Zwei große Knöpfe** nebeneinander (auf schmalen Handys untereinander, je mindestens 56 px hoch):
   - **„Text schreiben“** → `#/new` (Foto ist dort der erste Schritt, wie bisher).
   - **„Lernen · ca. N Min“** → `#/go/heute`. Steht nichts an: „Nichts fällig – Text schreiben?“ und der Knopf
     ist ausgegraut, mit Hinweis auf freies Üben (`#/train`).
2. **Plan-Karte für heute:** die Teile der Einheit als kurze Liste („14 Karten · Grammatik: Artikel · 2 Min
   Aussprache“), dazu „Heute ist Schreibtag“, wenn das Wochenziel einen Text vorsieht. Ist die Einheit heute schon
   erledigt: „Heute geschafft ✓“ mit Möglichkeit, weiterzulernen.
3. **Heatmap** (Abschnitt 4) mit Serie („5 Tage in Folge“).
4. Darunter wie bisher: Spinnennetz, Kennzahlen, letzte Texte.

Ohne Texte und ohne Onboarding zeigt `#/` das Onboarding (Abschnitt 2), mit Texten aber ohne Profil einen Hinweis
„Lernplan einrichten (1 Minute)“ über den Knöpfen – nie erzwungen.

## 2. Onboarding (`#/willkommen`)

Schritte mit Fortschrittspunkten, „Zurück“ und „Überspringen“ auf jedem Schritt. Überspringen setzt die
Standardwerte (in Klammern unten).

1. **So funktioniert's** (3 kurze Bildschirme, je ein Satz und ein kleines Bild): Text schreiben und fotografieren →
   Rückmeldung mit Spinnennetz und Fehlern → aus Lücken werden Karteikarten, aus Fehlern Grammatik-Übungen und
   Überarbeitungen; ein Lernplan sagt, was wann dran ist. Hinweis: Von Hand schreiben hilft beim Behalten; die App
   bringt keine eigene KI mit, man verbindet seine eigene.
2. **Ziel:** Alltag · Schule/Prüfung (optional Datum) · Beruf · Reisen (Alltag).
3. **Niveau (selbst geschätzt):** A2 · B1 · B2 · C1 · weiß nicht (weiß nicht). Nur Anzeige und Startwert für die
   Empfehlung; die KI schätzt das Niveau weiter selbst.
4. **Motivation und Zeit:**
   - Motivation: locker · dranbleiben · ehrgeizig (dranbleiben)
   - Zeit pro Tag: 5 · 10 · 20 Minuten (10)
   - Texte pro Woche: 1 · 2 · 3 · 5 (2; bei „Prüfung“ 3)
5. **Erinnerungen:** an/aus (an), Uhrzeit (19:00), Wochentage (alle). „Erlauben“ fragt den Browser nach
   Benachrichtigungen. Auf dem iPhone ohne installierte App: Hinweis „Zum Home-Bildschirm hinzufügen, dann gehen
   Erinnerungen“.
6. **Empfehlung:** aus denselben Regeln wie der Lernplan (Abschnitt 3), z. B. „Starte mit 5 Minuten am Tag und 2 Texten
   pro Woche (Montag und Donnerstag). Wenn du dranbleibst, werden die Einheiten bis 10 Minuten länger.“ Danach
   „KI verbinden“ (`#/settings`) oder, wenn schon verbunden, „Ersten Text schreiben“; außerdem „Demo ansehen“.

Gespeichert als Einstellung `profile`:
`{ goal: "daily"|"exam"|"work"|"travel", examDate: "YYYY-MM-DD"|null, level: "A2"|"B1"|"B2"|"C1"|null,
motivation: "relaxed"|"steady"|"ambitious", minutes: 5|10|20, writesPerWeek: 1|2|3|5,
reminder: { enabled, time: "HH:MM", days: [0..6] (0 = Montag) }, updatedAt }`.
In den Einstellungen gibt es „Lernplan & Erinnerungen“ zum Ändern und „Einführung noch einmal ansehen“.

## 3. Lernplan mit wachsenden Einheiten (`core/plan.js`, rein, ohne Oberfläche)

Feste Regeln, keine KI (offline, kostenlos, testbar). Alle Tage sind **Lerntage mit Beginn 4 Uhr** wie in `srs.js`.

### Länge der Einheit

- `target` = `profile.minutes`; `cap` = 1,0 (locker, dranbleiben) bzw. 1,3 (ehrgeizig).
- `active14` = Zahl der Lerntage mit Aktivität in den 14 Tagen vor heute; `gap` = Tage seit dem letzten aktiven Tag.
- `ramp` = min(cap, 0,5 + 0,05 · active14). Nach `gap ≥ 3` gilt `ramp = 0,5` (leichter Wiedereinstieg).
- Abbrüche: Von den letzten 5 geplanten Einheiten wurden `a` abgebrochen → `ramp · (1 − 0,1 · a)`.
- Minuten = runden(target · ramp), mindestens 3, höchstens runden(target · cap).
  Beispiel: 10 Minuten gewünscht, neu → 5 Min; nach 10 aktiven Tagen → 10 Min; ehrgeizig nach 14 Tagen → 13 Min.

### Inhalt (in dieser Reihenfolge, bis das Zeitbudget verbraucht ist)

Geschätzte Dauern kommen aus dem eigenen Verlauf (Median der letzten Werte), sonst aus Startwerten.

1. **Karten:** fällige plus neue (bisherige `buildQueue`-Regeln). Sekunden pro Karte: Median der letzten 200
   Bewertungen, begrenzt auf 5–40 s, Start 12 s. Karten bekommen bis zu 60 % des Budgets, wenn noch andere Teile
   anstehen, sonst alles; mindestens 5 Karten, wenn welche fällig sind.
2. **Grammatik-Übung** zur schwächsten Kategorie aus `weaknessProfile` (Start 120 s), wenn noch ≥ 90 s übrig sind.
3. **Überarbeiten** des jüngsten Textes mit Fehlern, der noch keine Überarbeitung hat (Start 180 s), wenn ≥ 150 s übrig.
4. **Aussprache** des jüngsten Textes (Start 120 s), wenn ≥ 90 s übrig und in den letzten 7 Tagen keine Übung war.

Gibt es weder Karten noch Texte, besteht der Plan nur aus „Text schreiben“.

**Schreibtage:** Bei `writesPerWeek` = k werden die Wochentage gleichmäßig verteilt (1 → Mo; 2 → Mo, Do; 3 → Mo, Mi,
Fr; 5 → Mo–Fr). Ist heute ein Schreibtag und diese Woche (ab Montag) wurden noch weniger als k Texte geschrieben,
erscheint „Heute ist Schreibtag“. Wurde ein Schreibtag verpasst, rückt der Vorschlag auf den nächsten Tag. Schreiben
zählt nicht ins Minutenbudget.

### Schnittstelle

- `planToday({ profile, activity, cards, entries, drills, now }) → { minutes, parts: [{ kind: "cards"|"drill"|
  "revise"|"speak", seconds, count?, category?, entryId?, link }], writeDay: boolean, done: boolean }`
- `planForDay(…, day)` für die nächsten 7 Tage (für Erinnerungstexte; Karten aus `forecast`).
- `recommendation(profile) → { startMinutes, maxMinutes, writeDays: [Wochentag], text }`.

### Ablauf einer Einheit (`#/go/heute`)

Die Teile laufen nacheinander in den bestehenden Ansichten, mit einer Fortschrittsleiste „Teil 1 von 3“ oben. Die
Kartensitzung bekommt eine Höchstzahl (`count`), die Übung ihre Kategorie. Am Ende jedes Teils: „Weiter:
Grammatik – Artikel (ca. 2 Min)“ oder „Fertig für heute“. Verlässt man die Einheit vor dem letzten Teil, zählt sie als
abgebrochen; ist mindestens ein Teil fertig, zählt sie als **teilweise** (nicht als Abbruch für die Länge, aber auch
nicht als erledigt).

### Direkte Sprünge

`#/go/heute` · `#/go/karten` · `#/go/uebung/<kategorie>` · `#/go/ueberarbeiten/<id>` · `#/go/sprechen/<id>` ·
`#/go/schreiben`. Unbekannte oder veraltete Ziele (Text gelöscht) führen zu `#/go/heute` mit kurzem Hinweis.

## 4. Aktivitäts-Tagebuch und Heatmap

### Daten

Neuer IndexedDB-Speicher `activity` (Datenbank-Version 3), je Ereignis:
`{ uid, at (ISO), day ("YYYY-MM-DD", Lerntag), kind: "write"|"cards"|"drill"|"revise"|"speak"|"unit",
count?, ms?, unit?: { planned: Sekunden, status: "done"|"partial"|"abandoned" } }`.

- Erfasst wird beim Speichern eines Textes, am Ende einer Kartensitzung (Zahl, Dauer, je Karte die Antwortzeit für
  die Schätzung, höchstens die letzten 200 gemerkt), am Ende einer Übung, Überarbeitung und Aussprache-Übung sowie am
  Ende oder Abbruch einer geplanten Einheit.
- **Nachtragen beim ersten Start von Teil 7:** Texte (`createdAt`), Überarbeitungen, Aussprache-Übungen, Übungen
  (`drills`) und das erste Lernen jeder Karte (`firstStudied`) werden einmalig als Ereignisse angelegt (markiert mit
  `backfill: true`, ohne Dauer). Die Markierung `activityBackfilled` verhindert Wiederholung.
- Höchstens 5000 Ereignisse; ältere als 2 Jahre werden beim Start entfernt.
- **Sicherung und Abgleich:** Ereignisse gehören dazu (Vereinigung über `uid`, keine Löschungen nötig). Das `profile`
  gehört dazu (neueres `updatedAt` gewinnt). Erinnerungs-Anmeldung und Absender-Geheimnis bleiben auf dem Gerät.

### Heatmap

- 20 Wochen (Spalten, neueste rechts) × 7 Tage (Zeilen, Montag oben), Kästchen 12–14 px mit 2 px Abstand und 2 px
  abgerundeten Ecken, Monatsnamen oben, Mo/Mi/Fr links. Passt bei 360 px Breite ohne Querscrollen; auf breiten
  Bildschirmen 26 Wochen.
- **Stärke pro Tag** = Lernminuten (aus `ms`, Karten ohne Dauer zählen 12 s je Karte) + 5 je Text + 2 je Übung,
  Überarbeitung oder Aussprache-Übung. Stufen: 0 · 1–4 · 5–9 · 10–19 · ≥ 20.
- **Farben:** eine lila Abstufung (hell → dunkel) mit 4 Stufen plus „leer“ in der Flächenfarbe. Für das dunkle Design
  eigene Stufen. Beide mit `validate_palette.js` aus dem Dataviz-Skill geprüft. Heutiger Tag mit Ring.
- Antippen oder Hovern zeigt eine kleine Info: „Mi, 19. Nov · 1 Text · 22 Karten · 8 Min“. Darunter eine Legende
  „weniger ▢▢▢▢▢ mehr“ und die Serie („5 Tage in Folge“, „längste Serie: 12“).
- Barrierefreiheit: `role="img"` mit Zusammenfassung; Schalter „Als Liste“ zeigt die aktiven Tage als Tabelle.

## 5. Erinnerungen

### Was gesendet wird

Für jeden der nächsten 7 Tage, die laut Profil ein Erinnerungstag sind, eine Erinnerung zur gewählten Uhrzeit:
Titel „Zeit zum Lernen“, Text z. B. „ca. 6 Min · 14 Karten · Artikel“ (an Schreibtagen „… · heute Schreibtag“),
Ziel `#/go/heute`. Ist die heutige Einheit schon erledigt, entfällt die heutige Erinnerung. Die App berechnet die Liste
bei jedem Öffnen, nach jeder Einheit und nach Profiländerungen neu und schickt sie dem Absender.

### Weg A: Absender auf Cloudflare (`push/` im Repo)

- Worker `skilltracker-push` mit **einem** Durable Object (SQLite) für alle Anmeldungen und einem **Alarm** auf die
  nächste fällige Erinnerung (pünktlich, kein Cron nötig).
- Schnittstelle (JSON, CORS nur für erlaubte Herkünfte `ALLOWED_ORIGINS`):
  - `GET /v1/key` → öffentlicher VAPID-Schlüssel.
  - `PUT /v1/reminders` `{ subscription: { endpoint, keys: { p256dh, auth } }, secret, reminders: [{ at, title,
    body, url }] }` ersetzt die Liste dieses Geräts. Das erste `secret` gilt (gespeichert als SHA-256); spätere
    Änderungen und Löschen brauchen dasselbe.
  - `DELETE /v1/reminders` `{ endpoint, secret }`.
- Grenzen: höchstens 14 Erinnerungen je Gerät, Titel ≤ 60 und Text ≤ 140 Zeichen, `url` muss mit `#/go/` beginnen,
  `at` höchstens 8 Tage in der Zukunft, Anfrage ≤ 8 KB. `endpoint` nur https bei bekannten Push-Diensten
  (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`). Höchstens
  10 Änderungen pro Minute je Gerät.
- Senden: Web Push nach RFC 8030 mit VAPID (RFC 8292, ES256 über WebCrypto, `sub` = Adresse der App, **keine
  E-Mail**) und verschlüsselter Nachricht `aes128gcm` (RFC 8291), selbst umgesetzt ohne Bibliothek. Antwortet der
  Push-Dienst 404 oder 410, wird die Anmeldung gelöscht. Anmeldungen ohne Änderung seit 60 Tagen werden gelöscht.
- Der Absender speichert nur Push-Adresse, Schlüssel des Geräts, Hash des Geheimnisses und die kurzen
  Erinnerungszeilen – keine Texte und keine Karten. Das steht so in den Einstellungen.
- VAPID-Schlüssel erzeugt `tools/make_vapid.mjs`; der private Schlüssel kommt als Worker-Geheimnis
  (`wrangler secret put VAPID_PRIVATE_JWK`), der öffentliche in `wrangler.toml`.
- Die Adresse des Absenders ist in den Einstellungen änderbar; Standard ist die eingebaute Adresse, sobald der
  Worker veröffentlicht ist (bis dahin leer → Weg B).

### Weg B: im Gerät (Rückfall)

- Nur aktiv, wenn Weg A nicht eingerichtet ist oder die Anmeldung dort fehlschlägt (keine doppelten Erinnerungen;
  zusätzlich trägt jede Erinnerung das Tag `lernplan-<Tag>`, sodass eine zweite die erste ersetzt).
- Die App legt die Erinnerungsliste lokal ab. Der Service Worker meldet sich, wo verfügbar (Chrome/Android,
  installierte App), für **Periodic Background Sync** an und zeigt beim Aufwachen eine Erinnerung, wenn eine fällige
  noch nicht gezeigt wurde. Der Browser bestimmt den Zeitpunkt; das sagt die App ehrlich („ungefähr, nicht pünktlich“).
- Läuft weder A noch B (z. B. Firefox am Rechner), steht in den Einstellungen, warum.

### Antippen der Erinnerung

Der Service Worker (`notificationclick`) holt ein offenes Fenster der App nach vorn und navigiert zu `url`, sonst
öffnet er die App mit `index.html` + `url`. Die Einheit startet sofort, ohne Zwischenbildschirm.

In den Einstellungen: Status (an, Weg A/B, letzte Übermittlung), „Test-Erinnerung in 1 Minute“, „Erinnerungen
ausschalten“ (meldet beim Absender ab).

## 6. Sonstiges

- Service-Worker-Cache `skilltracker-v8` mit allen neuen Dateien; `push`-, `notificationclick`- und
  `periodicsync`-Handler.
- Demo-Modus: Demo-Profil und 20 Wochen Demo-Aktivität für eine gefüllte Heatmap; Erinnerungen sind dort aus.
- Texte der Oberfläche auf Deutsch, wie bisher.

## 7. Tests

- `plan.js`: Länge (neu, nach 10 aktiven Tagen, ehrgeizig, nach Pause, mit Abbrüchen, Unter- und Obergrenze),
  Verteilung des Budgets, Schreibtage inklusive verpasstem Schreibtag, leere Daten, 4-Uhr-Grenze, `recommendation`.
- Aktivität: Erfassung, Nachtragen (einmalig), Stärke und Stufen pro Tag, Serie, Aufräumen, Sicherung und Abgleich.
- Heatmap: Raster der Wochen (Montag-Beginn, Monatsgrenzen, Zeitumstellung), Ausgabe enthält keine ungeschützten
  Texte.
- Push: `aes128gcm` mit dem Testbeispiel aus RFC 8291 Anhang A, VAPID-Signatur prüfbar mit dem öffentlichen
  Schlüssel, Prüfung der Eingaben (Grenzen, Hosts, Geheimnis), Alarm sendet fällige und setzt den nächsten, 410 löscht.
- Browser (CDP, wie bisher): Onboarding bis zur Empfehlung, Startbildschirm mit beiden Knöpfen, `#/go/heute` läuft
  durch alle Teile, Sprung aus `notificationclick`, Heatmap bei 360 px ohne Querscrollen, helles und dunkles Design.
