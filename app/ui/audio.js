// Browser-Teil der Aussprache: Mustersprecher (speechSynthesis), Aufnahme (MediaRecorder → WAV), Browser-Erkennung.
import { downsample, encodeWav } from "../core/wav.js";

export const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
export const canSpeak = () => "speechSynthesis" in globalThis;
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const canRecognize = () => !!Recognition;

function englishVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => /^en-GB/i.test(v.lang)) || voices.find((v) => /^en-US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
}

export function speak(text, { slow = false } = {}) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  const v = englishVoice();
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = slow ? 0.8 : 1;
  speechSynthesis.speak(u);
}

export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };

// Startet eine Aufnahme; optional läuft die Browser-Erkennung parallel mit.
export async function startRecording({ recognize = false } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.addEventListener("dataavailable", (e) => { if (e.data.size) chunks.push(e.data); });
  let recognition = null;
  const heard = [];
  if (recognize && Recognition) {
    recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.addEventListener("result", (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) heard.push([...ev.results[i]].map((a) => a.transcript));
      }
    });
    try { recognition.start(); } catch { recognition = null; }
  }
  rec.start();
  return {
    async stop() {
      const done = new Promise((r) => rec.addEventListener("stop", r, { once: true }));
      rec.stop();
      let recogDone = Promise.resolve();
      if (recognition) {
        recogDone = new Promise((r) => { recognition.addEventListener("end", r, { once: true }); setTimeout(r, 2500); });
        recognition.stop();
      }
      await Promise.all([done, recogDone]);
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      // Browser-Erkennung: je Abschnitt alle Alternativen; zusammengesetzt aus den jeweils besten
      const alternatives = heard.length ? [heard.map((h) => h[0]).join(" "), ...heard.flatMap((h) => h.slice(1))] : [];
      return { blob, url: URL.createObjectURL(blob), alternatives };
    },
    cancel() {
      try { rec.stop(); } catch { /* egal */ }
      try { recognition?.abort(); } catch { /* egal */ }
      stream.getTracks().forEach((t) => t.stop());
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
