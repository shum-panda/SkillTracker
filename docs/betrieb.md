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

## Vermittler für den Geräte-Abgleich

Für „Geräte verbinden“ (QR-Code, Abgleich im WLAN) braucht es einen kleinen Vermittler. Er reicht nur verschlüsselte
Verbindungsdaten weiter (AES-GCM, der Schlüssel steht nur im QR-Code) und speichert nichts dauerhaft – die Daten selbst
gehen direkt von Gerät zu Gerät.

```
# auf dem Server (Node ≥ 20, keine Pakete nötig)
sudo useradd --system --home /srv/skilltracker skilltracker
sudo git clone https://github.com/shum-panda/SkillTracker.git /srv/skilltracker
sudo cp /srv/skilltracker/server/skilltracker-relay.service /etc/systemd/system/
sudo systemctl enable --now skilltracker-relay
curl http://127.0.0.1:8830/healthz   # → ok
```

Caddy:

```
sync.dein-server.de {
    reverse_proxy 127.0.0.1:8830
}
```

Dann in der App unter Einstellungen → Geräte verbinden `https://sync.dein-server.de` eintragen (auf beiden Geräten
reicht es auf dem, das den QR-Code zeigt – die Adresse steckt im Code). Lokal testen: `RELAY_ORIGINS=http://127.0.0.1:8820 npm run relay`.

## Erinnerungen (Absender für Web Push)

Damit Erinnerungen pünktlich kommen, auch wenn die App zu ist, schickt ein kleiner Dienst sie über die Push-Dienste der
Browser (Google, Mozilla, Apple, Microsoft). Er speichert je Gerät nur die Push-Adresse, die Geräteschlüssel, einen Hash
des Geräte-Geheimnisses und die kurzen Erinnerungszeilen – keine Texte, keine Karten. Ohne Absender erinnert die App nur
im Gerät (Chrome/Android als installierte App, ungefähr).

```
# auf dem Server (Node ≥ 20, keine Pakete) – Code wie beim Vermittler unter /srv/skilltracker
sudo install -d -m 750 -g skilltracker /etc/skilltracker-push
sudo sh -c 'node /srv/skilltracker/tools/make_vapid.mjs > /etc/skilltracker-push/vapid.json'
sudo chgrp skilltracker /etc/skilltracker-push/vapid.json && sudo chmod 640 /etc/skilltracker-push/vapid.json
sudo cp /srv/skilltracker/server/skilltracker-push.service /etc/systemd/system/
sudo systemctl enable --now skilltracker-push
curl http://127.0.0.1:8840/healthz   # → ok
```

Caddy:

```
push.dein-server.de {
    reverse_proxy 127.0.0.1:8840
}
```

Die App nutzt standardmäßig `https://push.91-98-206-40.sslip.io`; unter Einstellungen → Lernplan & Erinnerungen → Absender
lässt sich die Adresse ändern (leer = nur im Gerät). Den Schlüssel nie neu erzeugen, solange Geräte angemeldet sind – sonst
müssen sich alle neu anmelden (passiert beim nächsten Öffnen der App automatisch, wenn der Absender sie ablehnt).
Lokal testen: `PUSH_VAPID=vapid.json PUSH_DATA=state.json PUSH_ORIGINS=http://127.0.0.1:8820 npm run push`.
