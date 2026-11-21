// Browser-Teil der Aussprache: Mustersprecher (speechSynthesis), Aufnahme (MediaRecorder → WAV), Browser-Erkennung.
import { downsample, encodeWav } from "../core/wav.js";

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
export const canSpeak = () => "speechSynthesis" in globalThis;
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const canRecognize = () => !!Recognition;
export const MAX_SECONDS = 60;

let voice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  voice = voices.find((v) => /^en-GB/i.test(v.lang)) || voices.find((v) => /^en-US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
}
if (canSpeak()) {
  pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
}

export function speak(text, { slow = false } = {}) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  if (!voice) pickVoice();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang || "en-GB";
  if (voice) u.voice = voice;
  u.rate = slow ? 0.8 : 1;
  speechSynthesis.speak(u);
}

export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };

const RECOGNITION_ERRORS = {
  "not-allowed": "Die Spracherkennung darf das Mikrofon nicht nutzen – bitte im Browser erlauben.",
  "service-not-allowed": "Die Spracherkennung ist in diesem Browser nicht freigegeben.",
  "audio-capture": "Kein Mikrofon gefunden oder es wird gerade anders benutzt.",
  network: "Die Spracherkennung braucht eine Internetverbindung.",
  "no-speech": "Es wurde nichts gehört – bitte etwas lauter und näher am Mikrofon.",
};

// Aufnahme starten. Mit Browser-Erkennung läuft nur die Erkennung (zwei gleichzeitige Mikrofon-Nutzer
// gehen auf Android oft schief) – dafür gibt es dann kein „Mich anhören“.
// onAutoStop: wird nach MAX_SECONDS aufgerufen.
export async function startRecording({ recognize = false, onAutoStop = () => {} } = {}) {
  const timer = setTimeout(onAutoStop, MAX_SECONDS * 1000);
  if (recognize && Recognition) {
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    const heard = [];
    let error = "";
    recognition.addEventListener("result", (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) heard.push([...ev.results[i]].map((a) => a.transcript));
      }
    });
    recognition.addEventListener("error", (ev) => { error = ev.error || "unknown"; });
    const ended = new Promise((r) => recognition.addEventListener("end", r, { once: true }));
    recognition.start();
    return {
      async stop() {
        clearTimeout(timer);
        try { recognition.stop(); } catch { /* schon beendet */ }
        await Promise.race([ended, new Promise((r) => setTimeout(r, 3000))]);
        const alternatives = heard.length ? [heard.map((h) => h[0]).join(" "), ...heard.flatMap((h) => h.slice(1))] : [];
        return { blob: null, url: null, alternatives, error: error && error !== "aborted" ? RECOGNITION_ERRORS[error] || `Spracherkennung: ${error}` : "" };
      },
      cancel() { clearTimeout(timer); try { recognition.abort(); } catch { /* egal */ } },
    };
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  let rec;
  try {
    rec = new MediaRecorder(stream);
  } catch (e) {
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  const chunks = [];
  rec.addEventListener("dataavailable", (e) => { if (e.data.size) chunks.push(e.data); });
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    async stop() {
      clearTimeout(timer);
      const done = new Promise((r) => rec.addEventListener("stop", r, { once: true }));
      if (rec.state !== "inactive") rec.stop();
      await done;
      release();
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      return { blob, url: URL.createObjectURL(blob), alternatives: [], error: blob.size ? "" : "Die Aufnahme ist leer." };
    },
    cancel() {
      clearTimeout(timer);
      try { if (rec.state !== "inactive") rec.stop(); } catch { /* egal */ }
      release();
    },
  };
}

export async function blobToWav(blob) {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(downsample(audio.getChannelData(0), audio.sampleRate, 16000), Math.min(16000, audio.sampleRate));
  } finally {
    ctx.close?.();
  }
}
