// Erzeugt ein VAPID-Schlüsselpaar für den Erinnerungs-Dienst und schreibt es als JSON auf stdout.
//   node tools/make_vapid.mjs > /etc/skilltracker-push/vapid.json
// Der private Schlüssel bleibt auf dem Server; die App holt den öffentlichen über GET /v1/key.
import { generateVapidKeys } from "../server/webpush.mjs";

const subject = process.argv[2] || "https://shum-panda.github.io/SkillTracker/";
if (!/^https:\/\//.test(subject)) { console.error("Absender muss eine https-Adresse sein (keine E-Mail)."); process.exit(2); }
process.stdout.write(JSON.stringify(await generateVapidKeys(subject), null, 1) + "\n");
