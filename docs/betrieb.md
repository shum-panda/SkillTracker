# Betrieb

SkillTracker ist eine statische Seite: Der Ordner `app/` wird so, wie er ist, ausgeliefert. Es gibt keinen Server-Code,
keine Datenbank auf dem Server und keine Schlüssel auf dem Server.

## Auf dem eigenen Server (Caddy)

```
skill.example.de {
    root * /srv/skilltracker/app
    file_server
    encode zstd gzip
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'"
        Referrer-Policy "no-referrer"
        X-Content-Type-Options "nosniff"
        Permissions-Policy "camera=(self), microphone=(), geolocation=()"
    }
    @static path *.woff2 *.png *.svg
    header @static Cache-Control "public, max-age=604800"
}
```

Aktualisieren: `git pull` im Ordner, fertig. Der Service Worker lädt neue Dateien beim nächsten Öffnen (Netz zuerst).
Bei größeren Änderungen in `app/sw.js` den Namen `CACHE` hochzählen.

## GitHub Pages

In den Repo-Einstellungen Pages auf einen Workflow setzen, der den Ordner `app/` veröffentlicht – oder `app/` in
einen `gh-pages`-Zweig legen. Die App nutzt nur relative Pfade und läuft deshalb auch unter `/SkillTracker/`.

## Lokale Modelle (Ollama)

Damit der Browser Ollama ansprechen darf, muss Ollama Anfragen von der Adresse der App erlauben:

```
OLLAMA_ORIGINS=https://skill.example.de ollama serve
```

In der App dann „OpenAI-kompatibel“ mit `http://localhost:11434/v1` wählen. Für Fotos braucht es ein Modell mit
Bildverständnis (z. B. `llava` oder `qwen2.5vl`).

## Wortliste neu erzeugen

```
pip install wordfreq
python tools/make_wordfreq.py
```

## Icons neu erzeugen

```
pip install pillow
python tools/make_icons.py
```

## Sichtprüfung

```
npm run serve
node --experimental-websocket tools/shots.mjs http://127.0.0.1:8820 shots
```
