# Lernbegleiter (Teil 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SkillTracker bekommt Onboarding, einen Lernplan mit wachsenden Einheiten, ein Aktivitäts-Tagebuch mit Heatmap, einen Startbildschirm „Heute“ mit Sprung-Links und Push-Erinnerungen (eigener Server, Rückfall im Gerät).

**Architecture:** Reine Logik in `app/core/` (activity, plan, reminders) mit `node --test`; Oberfläche in `app/ui/`; ein abhängigkeitsfreier Node-Dienst `server/push.mjs` mit eigener Web-Push-Umsetzung (`server/webpush.mjs`, WebCrypto). Der Service Worker bekommt `push`, `notificationclick` und `periodicsync`.

**Tech Stack:** Vanilla JS (ES-Module, kein Build), IndexedDB, Web Push (RFC 8030/8291/8292), Node ≥ 20 (`node:http`, `node:crypto` WebCrypto), systemd + Caddy auf 91.98.206.40.

**Spec:** `docs/superpowers/specs/2026-11-21-lernbegleiter-design.md`

## Global Constraints

- Keine Laufzeit-Abhängigkeiten, kein Build-Schritt; Tests mit `npm test` (`node --test tests/`), lokal Node 20.10.
- Oberflächentexte auf Deutsch; Akzent für Teil 7 **Lila** (Heatmap, Plan-Karte, Onboarding-Hervorhebungen), Rest bleibt Petrol.
- Lerntag beginnt um **4 Uhr** (wie `srs.js`); Wochentage 0 = Montag.
- Alles, was in HTML landet, geht durch `esc()`.
- Demo-Modus schreibt nichts ins echte Speicher-Objekt und meldet keine Erinnerungen an.
- Absender kennt nur Push-Adresse, Geräteschlüssel, Hash des Geheimnisses und kurze Zeilen; VAPID-`sub` ist `https://shum-panda.github.io/SkillTracker/`, **keine E-Mail**.
- Server-Regeln (mit Server-Agent vereinbart): Dienst nur auf 127.0.0.1 hinter Caddy; Unit/Caddy erst nach Nachricht an „Coding-Agent auf Hetzner-Server“; Stände per `git pull` in `/srv/skilltracker`; Geheimnisse nur auf dem Server, chmod 600.
- Service-Worker-Cache `skilltracker-v8`, alle neuen Dateien in `SHELL`.

## Review Focus

1. **Backfill nach Abgleich doppelt:** Zwei Geräte füllen dieselben alten Texte nach → nach dem Sync erscheinen Tage doppelt so stark. Erwartet: Nachgetragene Ereignisse haben deterministische `uid`s, die Vereinigung über `uid` entfernt Doppel. (Test in Task 1/2.)
2. **Zeitumstellung und 4-Uhr-Grenze bei Erinnerungen:** Erinnerung „19:00“ in der Woche der Umstellung (29.03./25.10.) muss um 19:00 Ortszeit liegen, nicht 18:00/20:00. (Test in Task 8.)
3. **Sprung auf gelöschten Text / unbekannte Kategorie:** `#/go/ueberarbeiten/999` → `#/go/heute` mit Hinweis, kein Fehlerbildschirm. (Test in Task 6.)
4. **Kartenteil mit Höchstzahl, wenn Karten „Nochmal“ bekommen:** Teil endet nach `count` Bewertungen oder leerer Schlange, nie Endlosschleife. (Test in Task 6.)
5. **Push-Dienst nicht erreichbar / 5xx:** Erinnerung bleibt, bis zu 3 Versuche im Minutentakt, danach verworfen; 404/410 löscht das Gerät. (Test in Task 9.)

---

### Task 1: Aktivitäts-Tagebuch (Speicher, Erfassung, Nachtragen, Tageswerte)

**Files:**
- Modify: `app/core/store.js` (MemoryStore), `app/core/store-idb.js` (DB-Version 3, Speicher `activity`, keyPath `uid`, Index `day`)
- Modify: `app/core/srs.js` (exportiert `learningDayStart`, neu `learningDayKey`)
- Create: `app/core/activity.js`
- Test: `tests/activity.test.mjs`

**Interfaces:**
- Produces (Store): `addActivity(ev)` (put über `uid`), `listActivity()` (nach `at` aufsteigend), `deleteActivity(uids: string[])`; `clearAll()` leert auch `activity`.
- Produces (`srs.js`): `learningDayStart(date) -> Date`, `learningDayKey(date) -> "YYYY-MM-DD"` (Ortszeit des Lerntag-Beginns).
- Produces (`activity.js`):
  - `KINDS = ["write","cards","drill","revise","speak","unit"]`
  - `recordActivity(store, { kind, count?, ms?, unit?, at? = new Date() }) -> Promise<event>` (zufällige `uid`, `day = learningDayKey(at)`)
  - `recordCardTimes(store, msList: number[])` → Einstellung `cardTimes`, höchstens 200 letzte Werte
  - `backfillActivity(store) -> Promise<number>` (einmalig, Einstellung `activityBackfilled = true`)
  - `pruneActivity(store, now) -> Promise<number>` (älter als 2 Jahre, dann auf 5000 neueste kürzen)
  - `dayStats(events) -> Map<day, { write, cards, drill, revise, speak, minutes, score, units }>`
  - `levelOf(score) -> 0..4` (Stufen 0 · 1–4 · 5–9 · 10–19 · ≥20)
  - `streaks(stats: Map, today: "YYYY-MM-DD") -> { current, longest }`

- [ ] **Step 1: Failing tests** in `tests/activity.test.mjs`:
  - `recordActivity legt Ereignis mit day nach 4-Uhr-Grenze an`: `at = new Date(2026,10,20,3,30)` → `day === "2026-11-19"`; `at = …4,0` → `"2026-11-20"`.
  - `dayStats zählt Minuten und Stärke`: Ereignisse cards `{count:10, ms:120000}`, write ×1, drill ×1 am selben Tag → `minutes === 2`, `score === 2 + 5 + 2`; cards ohne `ms` mit `count: 10` → `minutes === 2` (12 s je Karte).
  - `levelOf Grenzen`: `[0,1,4,5,9,10,19,20,99].map(levelOf)` → `[0,1,1,2,2,3,3,4,4]`.
  - `streaks`: aktive Tage 17.–19.11. und 10.–14.11., heute 19.11. → `{current:3, longest:5}`; heute 20.11. ohne Aktivität → `current === 3` (heute zählt erst, wenn aktiv; gestern reicht); heute 21.11. → `current === 0`.
  - `backfillActivity einmalig und deterministisch`: MemoryStore mit 2 Texten (je 1 Überarbeitung, 1 Sprechübung), Einstellung `drills` mit 1 Eintrag, 1 Karte mit `sched.firstStudied` → 1. Aufruf liefert 7, 2. liefert 0; zweiter frischer Store mit denselben Daten erzeugt **dieselben uids** (`uid = "bf-" + sha256hex(kind|quelle|at).slice(0,32)`, Quelle = Entry-`uid` bzw. Kategorie bzw. Karten-`key`), alle mit `backfill: true`, ohne `ms`.
  - `pruneActivity`: Ereignis von vor 25 Monaten wird entfernt; 5003 Ereignisse → 5000 bleiben (die neuesten).
  - `IdbStore`-Erweiterung wird nicht in Node getestet; `MemoryStore` erfüllt dieselbe Schnittstelle (bestehender Store-Test um `addActivity/listActivity/deleteActivity/clearAll` erweitern).
- [ ] **Step 2:** `node --test tests/activity.test.mjs tests/store.test.mjs` → FAIL (Modul fehlt).
- [ ] **Step 3:** Implementieren. IDB-Upgrade: in `onupgradeneeded` `if (!contains("activity")) createObjectStore("activity", { keyPath: "uid" }).createIndex("day","day")`; Versionsnummer 2 → 3. `sha256hex` über `globalThis.crypto.subtle`.
- [ ] **Step 4:** `npm test` → alles grün.
- [ ] **Step 5:** Commit „Aktivitäts-Tagebuch: Speicher, Erfassung, Nachtragen, Tageswerte“.

### Task 2: Sicherung und Abgleich für Aktivität und Profil

**Files:**
- Modify: `app/core/backup.js` (Export/Import), `app/core/sync.js` (`buildSnapshot`, `mergeSnapshot`)
- Create: `app/core/profile.js`
- Test: `tests/sync.test.mjs`, `tests/profile.test.mjs`

**Interfaces:**
- Consumes: Task 1 Store-Methoden, `KINDS`.
- Produces (`profile.js`):
  - `GOALS = ["daily","exam","work","travel"]`, `MOTIVATIONS = ["relaxed","steady","ambitious"]`, `MINUTES = [5,10,20]`, `WRITES = [1,2,3,5]`
  - `defaultProfile(goal = "daily") -> profile` (motivation `steady`, minutes 10, writesPerWeek 2 bzw. 3 bei `exam`, reminder `{enabled:true,time:"19:00",days:[0..6]}`, `examDate:null`, `level:null`, `updatedAt` ISO)
  - `cleanProfile(raw) -> profile|null` (nur bekannte Werte; `time` `/^([01]\d|2[0-3]):[0-5]\d$/`; `days` eindeutig 0–6; `examDate` `YYYY-MM-DD` oder null)
- Produces (`backup.js`): `cleanActivity(raw) -> event|null` (Kind aus `KINDS`, `uid` per `isUid`, `day` `YYYY-MM-DD`, `count` 0–10000, `ms` 0–86 400 000, `unit.status` aus done/partial/abandoned, `unit.planned` 0–7200, `backfill` boolean); Export enthält `activity` und `settings.profile`; Import übernimmt beides (Vereinigung).
- Snapshot: `activity` (alle Ereignisse), `settings.profile`. Merge: Ereignisse per `uid` vereinigen; Profil nur übernehmen, wenn `updatedAt` neuer als lokal. `cardTimes`, `pushSecret`, `pushState`, `reminders` werden **nicht** übertragen.

- [ ] **Step 1: Failing tests:**
  - `profile.test.mjs`: `cleanProfile({...defaultProfile(), minutes: 7})` → `null`; `time:"24:00"` → `null`; `days:[0,0,8]` → `null`; gültig → identisch.
  - `sync.test.mjs`: `Aktivität wird vereinigt und nicht verdoppelt` – Gerät A und B füllen dieselben 2 Texte nach (`backfillActivity`), A hat zusätzlich 1 eigenes Ereignis; `mergeSnapshot(B, buildSnapshot(A))` → B hat `7 + 1` Ereignisse, nicht 15.
  - `Profil: neueres updatedAt gewinnt` – B älter → übernimmt A; B neuer → bleibt.
  - `Fremde Aktivität wird gereinigt` – Ereignis mit `kind:"hack"` oder `uid:"<x>"` wird verworfen.
  - Backup: `exportData` → `applyImport` in leeren Store bringt Aktivität und Profil mit.
- [ ] **Step 2:** Tests laufen → FAIL.
- [ ] **Step 3:** Implementieren; `SETTING_KEYS` in `backup.js` um `profile` erweitern, `activity` als eigenes Feld.
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** Commit „Aktivität und Lernprofil in Sicherung und Abgleich“.

### Task 3: Lernplan (`core/plan.js`)

**Files:**
- Create: `app/core/plan.js`
- Test: `tests/plan.test.mjs`

**Interfaces:**
- Consumes: `dayStats`, `learningDayKey` (Task 1); `buildQueue`, `forecast`, `studiedNewToday`, `DEFAULT_NEW_PER_DAY` (`srs.js`); `weaknessProfile` (`weakness.js`); `profile` (Task 2).
- Produces:
  - `sessionMinutes({ profile, activity, now }) -> number`
  - `writeDays(writesPerWeek) -> number[]` (1→[0]; 2→[0,3]; 3→[0,2,4]; 5→[0,1,2,3,4])
  - `isWriteDay({ profile, entries, now }) -> boolean`
  - `estimates({ cardTimes, activity }) -> { card, drill, revise, speak }` in Sekunden (Median, `card` auf 5–40 begrenzt; Start 12/120/180/120)
  - `planToday({ profile, activity, cards, entries, drills, cardTimes, newPerDay, now }) -> { minutes, parts, writeDay, done }`
    - `parts[i] = { kind: "cards"|"drill"|"revise"|"speak", seconds, count?, category?, entryId?, link }`
    - Links: `#/go/karten`, `#/go/uebung/<category>`, `#/go/ueberarbeiten/<id>`, `#/go/sprechen/<id>`
    - `done` = heute existiert ein `unit`-Ereignis mit `status:"done"`.
  - `planForDay(input, dayOffset: 1..7) -> { minutes, cards, writeDay }` (Karten aus `forecast`, gleiche Minutenregel mit heutigem Stand)
  - `recommendation(profile) -> { startMinutes, maxMinutes, writeDays, text }`

Regeln exakt nach Spec Abschnitt 3 (ramp, cap, gap ≥ 3, Abbrüche der letzten 5 `unit`-Ereignisse mit `status:"abandoned"`, min 3 Min; Budgetverteilung: Karten ≤ 60 % wenn weitere Teile anstehen, sonst alles, mindestens 5 Karten falls fällig; Übung wenn ≥ 90 s übrig; Überarbeiten ≥ 150 s; Aussprache ≥ 90 s und keine Sprechübung in 7 Tagen; nichts da → `parts: []`).

- [ ] **Step 1: Failing tests** (`now = new Date(2026,10,20,18,0)`, Donnerstag):
  - `neu: Hälfte der Wunschzeit` – minutes 10, keine Aktivität → 5; minutes 5 → 3 (Untergrenze).
  - `nach 10 aktiven Tagen volle Zeit` → 10; `ehrgeizig nach 14 aktiven Tagen` → 13; `locker nach 14` → 10.
  - `Pause ≥ 3 Tage setzt zurück` – 14 aktive Tage, letzter vor 3 Tagen → 5.
  - `Abbrüche kürzen` – 10 aktive Tage, letzte 5 Einheiten 2× abandoned → round(10·1.0·0.8) = 8.
  - `writeDays` wie oben.
  - `Schreibtag verpasst rückt nach` – writesPerWeek 2, Montag kein Text, heute Donnerstag, diese Woche 0 Texte → `isWriteDay` true; Dienstag mit 0 Texten → true (verpasster Montag); Dienstag mit 1 Text → false.
  - `Budget: Karten ≤ 60 % wenn Übung möglich` – 5 Min, 40 fällige Karten, Schwäche vorhanden, Kartenzeit 12 s → cards `count === 15` (180 s / 12), drill vorhanden (120 s ≤ verbleibende 120 s), kein revise.
  - `Nur Karten ohne Texte` – 5 Min, 40 Karten, keine Texte → count 25.
  - `Mindestens 5 Karten` – Kartenzeit 40 s, 3 Min, weitere Teile → count 5.
  - `Leer` – keine Karten, keine Texte → `parts.length === 0`.
  - `estimates Median und Grenzen` – cardTimes [1000,2000,3000] ms → card 5; [60000×3] → 40.
  - `recommendation` – minutes 10, steady, writes 2 → `{startMinutes:5, maxMinutes:10, writeDays:[0,3]}`, `text` enthält „5 Minuten“ und „Montag und Donnerstag“.
  - `4-Uhr-Grenze` – Aktivität um 03:30 des 20.11. zählt für den 19.11.
- [ ] **Step 2:** `node --test tests/plan.test.mjs` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `npm test` grün.
- [ ] **Step 5:** Commit „Lernplan mit wachsenden Einheiten“.

### Task 4: Heatmap

**Files:**
- Create: `app/ui/heatmap.js`
- Modify: `app/styles.css` (Tokens `--hm-0..--hm-4` hell/dunkel, `.heatmap`)
- Test: `tests/heatmap.test.mjs`

**Interfaces:**
- Consumes: `dayStats`, `levelOf`, `streaks` (Task 1).
- Produces:
  - `heatmapGrid(today: "YYYY-MM-DD", weeks = 20) -> { columns: [{ days: [{ day, weekday, future }] ×7, month? }] }` (Montag-Beginn, letzte Spalte enthält heute, `month` = Kurzname wenn in der Spalte ein Monatserster liegt)
  - `heatmapHtml(stats: Map, today, { weeks = 20 } = {}) -> string` (SVG `role="img"` mit `aria-label`-Zusammenfassung, Zellen mit `data-day` und Klasse `l0..l4`, heute mit Klasse `today`; Legende „weniger … mehr“; Serie-Zeile; Knopf „Als Liste“; Liste als `<table>` versteckt)
  - `dayLabel(day, s) -> string` z. B. „Mi, 19. Nov · 1 Text · 22 Karten · 8 Min“
  - `bindHeatmap(root)` – Antippen/Hover zeigt Info, „Als Liste“ schaltet um.

- [ ] **Step 1: Palette prüfen:** Lila-Rampe wählen (4 Stufen hell auf `#ffffff`-Fläche, 4 Stufen dunkel auf der dunklen Fläche aus `styles.css`), mit `node <dataviz>/scripts/validate_palette.js "<hex,…>" --mode light` bzw. `--mode dark` prüfen, bis PASS; Werte als Tokens in `styles.css`.
- [ ] **Step 2: Failing tests:**
  - `Raster beginnt Montag und endet mit heute` – today `2026-11-20` (Do) → 20 Spalten, letzte Spalte `days[3].day === "2026-11-20"`, `days[4..6].future === true`, erste Zelle ist ein Montag.
  - `Monatsnamen` – Spalte mit 1. Dez. trägt `month === "Dez"`.
  - `Zeitumstellung` – today `2026-03-30` → keine doppelten oder fehlenden Tage (140 eindeutige `day`-Werte, lückenlos).
  - `HTML ist geschützt` – `dayLabel` mit manipuliertem Wert enthält kein `<`; `heatmapHtml` enthält `role="img"` und Klasse `l4` für einen Tag mit Score 25.
- [ ] **Step 3:** `node --test tests/heatmap.test.mjs` → FAIL; implementieren; → PASS.
- [ ] **Step 4:** `npm test` grün; Commit „Heatmap der Aktivität (Lila)“.

### Task 5: Onboarding und Profil-Einstellungen

**Files:**
- Create: `app/ui/views/welcome.js`
- Modify: `app/ui/app.js` (Route `#/willkommen`), `app/ui/views/settings.js` (Abschnitt „Lernplan & Erinnerungen“ für Ziel/Motivation/Zeit/Texte/Uhrzeit/Tage + „Einführung noch einmal ansehen“), `app/styles.css`
- Test: `tests/ui-logic.test.mjs`

**Interfaces:**
- Consumes: `defaultProfile`, `cleanProfile`, `GOALS…` (Task 2); `recommendation` (Task 3).
- Produces: `welcome.render(root, ctx)`; `welcome.STEPS` (Reihenfolge: `concept1`,`concept2`,`concept3`,`goal`,`level`,`motivation`,`reminder`,`result`); `onboardingDone(store) -> Promise<boolean>` (Einstellung `profile` vorhanden). Der Schritt `reminder` ruft `ctx.reminders.enable()` aus Task 8 auf, falls vorhanden, sonst nur speichern.

Texte nach Spec Abschnitt 2. Jeder Schritt: Punkte-Fortschritt, „Zurück“, „Überspringen“ (setzt `defaultProfile(goal)` und springt zu `result`). iPhone-Hinweis, wenn `navigator.standalone !== true` und UA iPhone/iPad. Ergebnis-Knöpfe: ohne KI „KI verbinden“ (`#/settings`), mit KI „Ersten Text schreiben“ (`#/new`), immer „Demo ansehen“.

- [ ] **Step 1: Failing test** `ui-logic.test.mjs`: `onboardingDone` false bei leerem Store, true nach `setSetting("profile", defaultProfile())`; `recommendationText` in `welcome.js` exportiert als `resultHtml(profile, hasProvider)` → enthält „KI verbinden“ ohne Anbieter, „Ersten Text schreiben“ mit Anbieter, und den `recommendation(profile).text` geschützt.
- [ ] **Step 2:** FAIL → implementieren → PASS.
- [ ] **Step 3:** `npm test` grün; Commit „Onboarding und Lernprofil“.

### Task 6: Startbildschirm „Heute“, Sprung-Links und Einheiten-Ablauf, Erfassung an allen Speicherstellen

**Files:**
- Create: `app/ui/unit.js`
- Modify: `app/ui/views/home.js`, `app/ui/app.js` (Routen `#/go/...`), `app/ui/views/learn.js` (`renderSession` mit `{ limit }`, Kartenzeiten messen), `app/ui/views/train.js`, `app/ui/views/revise.js`, `app/ui/views/speak.js`, `app/ui/views/new.js` (je `recordActivity` nach erfolgreichem Speichern und `ctx.unit?.partDone(kind)`), `app/styles.css`
- Test: `tests/ui-logic.test.mjs`, `tests/unit.test.mjs`

**Interfaces:**
- Consumes: `planToday` (Task 3), `recordActivity`, `recordCardTimes`, `backfillActivity`, `pruneActivity`, `dayStats` (Task 1), `heatmapHtml`, `bindHeatmap` (Task 4), `onboardingDone` (Task 5).
- Produces (`unit.js`):
  - `resolveGo(path: string, { entries, plan }) -> { hash, note? }` – bildet `heute|karten|uebung/<cat>|ueberarbeiten/<id>|sprechen/<id>|schreiben` auf Ziel-Hashes ab (`#/learn/session`, `#/train/<cat>`, `#/e/<id>/revise`, `#/e/<id>/speak`, `#/new`); unbekannt/gelöscht → `{ hash: "#/go/heute", note: "Das Ziel gibt es nicht mehr – hier ist dein Plan für heute." }`; `heute` ohne Teile → `#/new` mit Hinweis.
  - `startUnit(ctx, plan)` setzt `ctx.unit = { plan, index, startedAt, partDone(kind), abandon() }` und navigiert zum ersten Teil.
  - `ctx.unit.partDone(kind)`: zeigt Zwischenbildschirm „Weiter: <Teil> (ca. N Min)“ oder „Fertig für heute“ und schreibt am Ende `recordActivity(kind:"unit", unit:{planned, status:"done"})`.
  - Verlassen (Navigation zu einem Hash außerhalb der Teile, ohne `partDone`) → `status: "partial"` wenn ≥ 1 Teil fertig, sonst `"abandoned"`; einmalig, danach `ctx.unit = null`.
  - Fortschrittsleiste „Teil i von n“ oben in den Teil-Ansichten, wenn `ctx.unit` gesetzt.
- `learn.renderSession(root, ctx, params, { limit } = {})`: endet nach `limit` Bewertungen oder leerer Schlange; schreibt am Ende `recordActivity({kind:"cards", count, ms})` und `recordCardTimes`.
- App-Start: einmal pro Start `backfillActivity` und `pruneActivity` (nicht im Demo).
- Home: ohne Texte und ohne Profil → `ctx.navigate("#/willkommen")`; mit Texten ohne Profil → Hinweis „Lernplan einrichten (1 Minute)“; Aufbau nach Spec Abschnitt 1 (zwei Knöpfe ≥ 56 px, Plan-Karte, Heatmap – 20 Wochen, ab 900 px Breite 26 –, dann bisherige Inhalte).

- [ ] **Step 1: Failing tests** (`tests/unit.test.mjs`):
  - `resolveGo` für alle sechs Formen mit vorhandenen Daten → erwartete Hashes.
  - `resolveGo("ueberarbeiten/999")` → `#/go/heute` mit `note`; `uebung/unbekannt` → ebenso.
  - `Einheitenstatus` – reine Hilfsfunktion `unitStatus(partsDone, total)` → `done` (3/3), `partial` (1/3), `abandoned` (0/3).
  - `Kartenteil mit Höchstzahl` – reine Hilfsfunktion `sessionShouldEnd({ graded, limit, queueLeft })` → true bei `graded === limit`, true bei `queueLeft === 0`, sonst false; Karte mit „Nochmal“ erhöht `graded`.
- [ ] **Step 2:** FAIL → implementieren → PASS.
- [ ] **Step 3: Browser-Prüfung** (CDP wie bisher, Mock-KI `.superpowers/scratch/mock-ai.mjs` Port 8897, `npm run serve` Port 8820): Demo → Home zeigt beide Knöpfe und gefüllte Heatmap; `#/go/heute` läuft durch alle Teile bis „Fertig für heute“; 360 px Breite ohne Querscrollen; hell und dunkel. Screenshots ansehen.
- [ ] **Step 4:** `npm test` grün; Commit „Startbildschirm Heute, Sprung-Links und geplante Einheiten“.

### Task 7: Web-Push-Kern (`server/webpush.mjs`)

**Files:**
- Create: `server/webpush.mjs`, `tools/make_vapid.mjs`
- Test: `tests/webpush.test.mjs`

**Interfaces:**
- Produces:
  - `b64u(bytes) -> string`, `unb64u(string) -> Uint8Array`
  - `encryptPayload({ p256dh, auth }, plaintext: Uint8Array, { salt?, localKeyPair? } = {}) -> Promise<Uint8Array>` – `aes128gcm` nach RFC 8291 (Header: salt 16 B, rs 4096, idlen 65, Sender-Public-Key; Padding-Trenner `0x02`)
  - `vapidAuthorization({ endpoint, publicKey: string(b64u, 65 B), privateJwk, subject, now = Date.now() }) -> Promise<string>` → `vapid t=<jwt>, k=<publicKey>`; JWT `{aud: origin(endpoint), exp: now/1000 + 12h, sub: subject}`, ES256 (Signatur roh r‖s, 64 B)
  - `sendPush({ subscription, payload: object, vapid, fetch = globalThis.fetch, ttl = 3600 }) -> Promise<{ status }>` (POST, Header `Content-Encoding: aes128gcm`, `TTL`, `Urgency: normal`, `Authorization`)
  - `tools/make_vapid.mjs` schreibt `{ publicKey, privateJwk, subject }` als JSON auf stdout.

- [ ] **Step 1: Failing tests:**
  - `RFC 8291 Anhang A` – mit den Werten aus dem RFC (Klartext „When I grow up, I want to be a watermelon“, `auth_secret`, `ua_public`, `as_private`/`as_public`, `salt`) ergibt `encryptPayload` exakt den Body aus Anhang A (b64u-Vergleich). Werte wörtlich aus RFC 8291 Abschnitt 5/Anhang A übernehmen.
  - `VAPID-Signatur prüfbar` – erzeugtes Schlüsselpaar; `vapidAuthorization` → JWT-Teile; `crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"}, publicKey, sig, header.payload)` → true; `aud === "https://fcm.googleapis.com"` für Endpoint `https://fcm.googleapis.com/fcm/send/x`; `sub` beginnt mit `https://`.
  - `sendPush Header` – Fake-`fetch` sieht `Content-Encoding: aes128gcm`, `TTL: 3600`, `Authorization` beginnt mit `vapid t=`; Body-Länge ≥ 86 + Klartext.
- [ ] **Step 2:** FAIL → implementieren → PASS.
- [ ] **Step 3:** `npm test` grün; Commit „Web Push: aes128gcm und VAPID ohne Bibliothek“.

### Task 8: Erinnerungen im Client (Liste, Anmeldung, Service Worker, Einstellungen)

**Files:**
- Create: `app/core/reminders.js`, `app/ui/push.js`
- Modify: `app/sw.js` (`push`, `notificationclick`, `periodicsync`, Cache `skilltracker-v8`, `SHELL` um alle neuen Dateien), `app/ui/app.js` (nach Start und nach Einheiten `ctx.reminders.refresh()`), `app/ui/views/settings.js` (Status, Absender-Adresse, „Test-Erinnerung in 1 Minute“, „Erinnerungen ausschalten“, Hinweis was gespeichert wird), `app/manifest.webmanifest` (falls nötig `id`/`scope`)
- Test: `tests/reminders.test.mjs`

**Interfaces:**
- Consumes: `planToday`, `planForDay` (Task 3); `profile` (Task 2); Push-Schnittstelle aus Task 9 (`GET /v1/key`, `PUT/DELETE /v1/reminders`).
- Produces:
  - `buildReminders({ profile, today: planTodayResult, upcoming: planForDayResult[] /*1..7*/, now }) -> [{ at: ISO, title, body, url }]` – je Erinnerungstag der nächsten 7 Tage um `profile.reminder.time` Ortszeit; heute nur wenn Zeit noch nicht vorbei und `!today.done`; Titel „Zeit zum Lernen“; Text „ca. N Min · M Karten“ (+ „ · Artikel“ = Kategorie-Label des ersten drill-Teils, nur heute) (+ „ · heute Schreibtag“); `url = "#/go/heute"`; leer wenn `!profile.reminder.enabled`.
  - `DEFAULT_PUSH_URL = "https://push.91-98-206-40.sslip.io"` in `app/ui/push.js`; Einstellung `pushUrl` überschreibt, leer-String = Weg B.
  - `ctx.reminders = { enable(), disable(), refresh(), test(), status() }` – `refresh` berechnet die Liste, speichert sie als Einstellung `reminders` (für Weg B) und sendet sie an den Absender (Weg A, Geheimnis `pushSecret` = 32 Zufallsbytes b64u, einmal erzeugt); Fehler → Weg B (`periodicSync.register("lernplan", { minInterval: 12h })` wenn verfügbar); Status in Einstellung `pushState = { way: "A"|"B"|"none", lastSent, error }`.
  - Service Worker: `push` → `showNotification(title, { body, tag: "lernplan-" + day, data: { url }, icon: "icons/icon-192.png" })`; `notificationclick` → offenes Fenster fokussieren und `client.navigate(scope + "index.html" + url)` bzw. `clients.openWindow(...)`; `periodicsync` (Tag `lernplan`) → Einstellung `reminders` aus IndexedDB lesen (DB `skilltracker`, Store `settings`), fällige noch nicht gezeigte (Einstellung `remindersShown`) zeigen.

- [ ] **Step 1: Failing tests** (`tests/reminders.test.mjs`, Zeitzone im Test fest: `process.env.TZ = "Europe/Berlin"` vor dem Import):
  - `7 Tage um 19:00` – Profil alle Tage, now Do 20.11. 18:00, heute nicht erledigt → 8 Einträge (heute + 7), erster `at` = 20.11. 19:00 Ortszeit.
  - `heute erledigt oder vorbei` – `today.done` → heute fehlt; now 19:30 → heute fehlt.
  - `nur gewählte Tage` – days [0,3] → nur Mo/Do.
  - `Zeitumstellung` – now Fr 27.03.2026 12:00, Erinnerung 19:00 → So 29.03. `at` entspricht 17:00 UTC (MESZ), Fr 27.03. 18:00 UTC.
  - `Text` – heute mit 14 Karten, drill „articles“ (Label aus `taxonomy.js`), Schreibtag → Body „ca. 6 Min · 14 Karten · Artikel · heute Schreibtag“ (Label wie in `taxonomy.js`); Länge ≤ 140.
  - `aus` – `reminder.enabled:false` → `[]`.
- [ ] **Step 2:** FAIL → implementieren → PASS.
- [ ] **Step 3: Browser-Prüfung:** Einstellungen zeigen Status; `notificationclick` mit Fake-Ereignis (über CDP `ServiceWorker` evaluieren) navigiert zu `#/go/heute`.
- [ ] **Step 4:** `npm test` grün; Commit „Erinnerungen: Liste, Anmeldung, Service Worker“.

### Task 9: Absender-Dienst (`server/push.mjs`)

**Files:**
- Create: `server/push.mjs`, `server/skilltracker-push.service`
- Modify: `package.json` (Skript `"push": "node server/push.mjs"`), `docs/betrieb.md` (Abschnitt „Erinnerungen“)
- Test: `tests/push-server.test.mjs`

**Interfaces:**
- Consumes: `sendPush`, `b64u` (Task 7).
- Produces: `createPushServer({ dataFile, vapid: { publicKey, privateJwk, subject }, origins: string[], fetch?, now? = () => Date.now(), tickMs? = 60000 }) -> { server: http.Server, tick(): Promise<void>, close() }`
  - `GET /v1/key` → `{ publicKey }`; `GET /healthz` → `ok`.
  - `PUT /v1/reminders` / `DELETE /v1/reminders` nach Spec Abschnitt 5 (Grenzen: ≤ 14 Erinnerungen, Titel ≤ 60, Text ≤ 140, `url` beginnt `#/go/`, `at` ≤ 8 Tage voraus und nicht älter als 2 h, Body ≤ 8 KB, Endpoint-Hosts `fcm.googleapis.com`, `*.push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`, nur https; `secret` 43 Zeichen b64u, gespeichert als SHA-256; falsches Geheimnis → 403; ≤ 10 Änderungen/Minute je Gerät → sonst 429). CORS nur für `origins`, Preflight `OPTIONS`.
  - Speicher: `{ subs: { [sha256(endpoint)]: { endpoint, p256dh, auth, secretHash, updated, reminders: [{at,title,body,url,tries}] } } }`, geschrieben nach `dataFile + ".tmp"` und `rename`.
  - `tick()`: alle fälligen (`at ≤ now`) senden; 2xx → entfernen; 404/410 → Gerät löschen; sonst `tries++`, bei 3 entfernen; älter als 2 h → verwerfen ohne Senden; Geräte ohne Änderung seit 60 Tagen löschen. Zeitgeber: `setTimeout` auf die nächste fällige, höchstens `tickMs`.
  - Start aus Umgebung: `PORT` (8840), `HOST` (127.0.0.1), `PUSH_DATA` (`/var/lib/skilltracker-push/state.json`), `PUSH_VAPID` (`/etc/skilltracker-push/vapid.json`), `PUSH_ORIGINS` (`https://shum-panda.github.io`), `TRUST_PROXY`.
  - Unit wie `skilltracker-relay.service`, zusätzlich `StateDirectory=skilltracker-push`, `ReadWritePaths=/var/lib/skilltracker-push`, `LoadCredential` oder Lesezugriff auf `/etc/skilltracker-push/vapid.json` (Datei `root:skilltracker` 640).

- [ ] **Step 1: Failing tests** (`tests/push-server.test.mjs`, Fake-`fetch`, `now` steuerbar, `dataFile` im Temp-Ordner):
  - `anmelden, fällig, senden, entfernen` – PUT mit 2 Erinnerungen (in 1 und 120 Minuten) → `tick()` bei now+2 min → Fake-fetch 1× aufgerufen mit Endpoint, Datei enthält noch 1 Erinnerung.
  - `410 löscht Gerät`, `500 → 3 Versuche, dann weg`, `älter als 2 h wird nicht gesendet`.
  - `Geheimnis` – zweites PUT mit anderem `secret` → 403; DELETE mit richtigem → 204, Gerät weg.
  - `Grenzen` – 15 Erinnerungen → 400; `url:"https://evil"` → 400; Endpoint `https://example.com/x` → 400; `http://fcm.googleapis.com` → 400; Body 9 KB → 413; 11 PUTs in einer Minute → 429.
  - `CORS` – Origin `https://shum-panda.github.io` bekommt `Access-Control-Allow-Origin`, fremde Origin nicht.
  - `Neustart` – neuer `createPushServer` mit derselben Datei kennt das Gerät.
- [ ] **Step 2:** FAIL → implementieren → PASS.
- [ ] **Step 3:** `npm test` grün; Commit „Absender für Erinnerungen“.

### Task 10: Demo-Daten, Doku, Abschluss im Browser

**Files:**
- Modify: `app/core/demo.js` (`demoActivity(now)` – 20 Wochen, ca. 60 % aktive Tage, deterministisch; `demoProfile()`), `app/ui/app.js` (`enterDemo` legt beides an), `README.md`, `docs/betrieb.md`
- Test: `tests/ui-logic.test.mjs`

- [ ] **Step 1: Failing test:** `demoActivity(new Date(2026,10,20))` → nur Tage in den letzten 140 Tagen, gleiche Ausgabe bei zwei Aufrufen, mindestens 1 Tag jeder Stufe 1–4 (`dayStats`/`levelOf`).
- [ ] **Step 2:** FAIL → implementieren → PASS.
- [ ] **Step 3: Gesamt-Browserprüfung** (wie Task 6 Step 3) plus Onboarding von Anfang bis Empfehlung in einem frischen Profil, Einstellungen „Lernplan & Erinnerungen“; Screenshots hell/dunkel bei 360 px und 1280 px ansehen.
- [ ] **Step 4:** `npm test` grün; Commit „Demo-Aktivität und Doku für Teil 7“.

### Task 11: Inbetriebnahme des Absenders (nach Freigabe)

Diese Aufgabe ändert den Server und den Live-Stand. Sie läuft erst nach dem Merge in `main` (Entscheidung des Nutzers) und nach einer Nachricht an „Coding-Agent auf Hetzner-Server“ mit Port 8840, Pfaden und Unit-Datei.

- [ ] **Step 1:** Nachricht an den Server-Agenten: Unit `skilltracker-push`, Port 8840 (127.0.0.1), Caddy `push.91-98-206-40.sslip.io` → `127.0.0.1:8840`, Daten `/var/lib/skilltracker-push`, Schlüssel `/etc/skilltracker-push/vapid.json`.
- [ ] **Step 2:** Auf dem Server: `git -C /srv/skilltracker pull`; `node tools/make_vapid.mjs > /etc/skilltracker-push/vapid.json` (Ordner 750 root:skilltracker, Datei 640); Unit kopieren, `systemctl enable --now skilltracker-push`; Caddy-Datei `/etc/caddy/sites/skilltracker-push.caddy`, `caddy validate`, `systemctl reload caddy`.
- [ ] **Step 3:** Prüfen: `curl https://push.91-98-206-40.sslip.io/healthz` → `ok`; `GET /v1/key` liefert den Schlüssel; in der echten App am Handy „Test-Erinnerung in 1 Minute“ → Benachrichtigung kommt, Antippen öffnet `#/go/heute`.
- [ ] **Step 4:** `PROJEKTE.md` aktualisieren (Dienst `skilltracker-push` läuft).
