# SkillTracker – Teil 5: Synchronisierung per QR-Code und WLAN

Stand: 2026-11-21 · Status: freigegeben (Grundsatz in Teil 1 entschieden: „QR + winziger Vermittler, Daten direkt im WLAN“)

## Ziel

Handy und PC (oder zwei beliebige Geräte) gleichen Texte, Bewertungen, Überarbeitungen, Karteikarten mit Lernstand und
Übungsergebnisse ab – ohne Konto und ohne dass ein Server die Daten sieht.

## Ablauf

1. Gerät A (meist der PC): Einstellungen → **Geräte verbinden** → zeigt einen QR-Code.
2. Gerät B (Handy) scannt den Code mit der normalen Kamera-App. Der Code ist ein Link
   `…/SkillTracker/#/sync?r=<Raum>&k=<Schlüssel>&s=<Vermittler>`; er öffnet SkillTracker und verbindet sich.
3. Die Geräte tauschen über den Vermittler verschlüsselt die Verbindungsdaten aus (WebRTC, ohne Trickle) und verbinden
   sich direkt im WLAN (DataChannel, DTLS-verschlüsselt).
4. Beide schicken ihren Stand, beide führen zusammen. Anzeige: „12 Texte, 40 Karten übernommen“.
5. Gerät B kann den Link als Ersatz auch abtippen/kopieren (z. B. PC ↔ PC).

## Vermittler (`server/relay.mjs`, Node ≥ 20, ohne Pakete)

- `PUT /r/<raum>/<offer|answer>` (≤ 64 KB) legt eine Nachricht ab; `GET …?wait=25` wartet bis 25 s darauf (sonst 204).
- Räume leben 3 Minuten, höchstens 1000 gleichzeitig, einfache Begrenzung je IP. Raum-ID = 128 Bit zufällig.
- Inhalte sind mit AES-GCM (Schlüssel nur im QR-Code) verschlüsselt – der Vermittler sieht nur Zufallsbytes.
- CORS nur für die eingetragenen App-Adressen. Läuft hinter Caddy auf dem eigenen Server (Doku in `docs/betrieb.md`).
- Kein STUN/TURN: Verbindung nur im selben Netz (wie entschieden). Klappt sie nicht (Gäste-WLAN, Uni-Netz) → Hinweis auf
  Export/Import.

## Zusammenführen (beidseitig, nichts wird überschrieben)

- Jeder Eintrag und jede Karte bekommt eine geräteübergreifende `uid` (fehlende werden beim ersten Abgleich vergeben).
- Texte: Vereinigung über `uid`; bei beiden vorhanden werden die Überarbeitungen vereinigt (über Zeitpunkt + Art).
  Verweise (`revisionOf`, `resultEntryId`, Karten-`sources`) reisen als `uid` und werden lokal auf IDs umgeschrieben.
- Gelöschte Texte: `deletedEntryUids` (Grabsteine) reisen mit; solche Texte werden auf beiden Seiten entfernt.
- Karten: Vereinigung über `uid`, sonst über `key`; bei beiden vorhanden gewinnt der Lernstand mit mehr Wiederholungen
  (bei Gleichstand der spätere Fälligkeitstermin). Gelöschte Kartenschlüssel werden vereinigt und angewendet.
- Übungsergebnisse: Vereinigung über Zeitpunkt + Kategorie.
- Einstellungen (Design, verbesserte Fassung, neue Karten/Tag) bleiben je Gerät. KI-Anbieter werden **nur** übertragen,
  wenn man „KI-Zugänge mitnehmen“ ankreuzt – dann inklusive Schlüssel.
- Eingehende Daten werden wie ein Import geprüft (gleiche Säuberung wie `backup.js`).

## Oberfläche

- Einstellungen: Abschnitt **Geräte verbinden** (Vermittler-Adresse einstellbar, Standard leer → Hinweis).
- `#/sync` (QR anzeigen bzw. beitreten), Fortschritt und Ergebnis.

## Tests

- Zusammenführen, Verweise, Grabsteine, Karten-Konflikte (`node --test`).
- Vermittler: Ablegen/Abholen, Warten, Ablauf, Größenlimit, CORS (`node --test`, echter Server auf Zufallsport).
- Verschlüsselung (WebCrypto in Node 20).
- Ende-zu-Ende: zwei Chrome-Instanzen über den lokalen Vermittler.
