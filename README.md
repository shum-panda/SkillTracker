# SkillTracker

Englisch lernen durch Schreiben: Text von Hand schreiben, fotografieren, mit der eigenen KI einlesen und bewerten
lassen. Ergebnis: ein Spinnennetz mit sechs Achsen (Grammatik, Satzbau, Wortvielfalt, Wortniveau, Komplexität,
Stil), markierte Fehler mit Erklärung, fehlende Wörter und eine verbesserte Fassung zum Nachsprechen. Ein Verlauf
zeigt, wo man besser wird.

- Läuft komplett im Browser (Handy und PC, als App installierbar). Kein Konto, kein Server mit deinen Daten.
- Eigene KI anbinden: Claude, OpenAI, Gemini oder ein OpenAI-kompatibler Server (Ollama, LM Studio, OpenRouter).
- Lernbegleiter: Beim ersten Start erklärt ein Onboarding den Ablauf und fragt Ziel, Motivation und Zeit ab. Daraus plant
  die App jeden Tag eine Lerneinheit (Karten, Grammatik, Überarbeiten, Aussprache) – am Anfang kurz, mit regelmäßiger
  Nutzung länger. Eine Heatmap zeigt die eigene Aktivität, Erinnerungen bringen einen mit einem Tipp direkt in die Einheit
  (Absender auf dem eigenen Server, siehe `docs/betrieb.md`; ohne Absender im Gerät).

## Starten

```
npm run serve      # http://127.0.0.1:8820/
npm test           # Tests (Node ≥ 20, keine Pakete nötig)
```

Ohne Schlüssel lässt sich die App unter `#/demo` ansehen. Betrieb auf einem Server: `docs/betrieb.md`.

## Quellen

Worthäufigkeiten: [wordfreq](https://github.com/rspeer/wordfreq) von Robyn Speer, Daten unter CC BY-SA 4.0
(`app/data/wordfreq-en.json`).

QR-Codes: [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) von Kazuhiko Arase, MIT-Lizenz
(`app/vendor/qrcode.js`, unverändert bis auf den ES-Modul-Export).
