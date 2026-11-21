// Sichtprüfung per Chrome DevTools: Ansichten im Demo-Modus × Handy/PC × hell/dunkel.
// Aufruf: node --experimental-websocket tools/shots.mjs http://127.0.0.1:8820 <ausgabeordner>
// Meldet Konsolenfehler und horizontales Scrollen.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const [base = "http://127.0.0.1:8820", out = "shots"] = process.argv.slice(2);
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(out, { recursive: true });
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9334", `--user-data-dir=${out}/profile`,
  "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list = [];
for (let i = 0; i < 50 && !list.length; i++) {
  try { list = (await (await fetch("http://127.0.0.1:9334/json/list")).json()).filter((t) => t.type === "page"); } catch { /* wartet */ }
  await sleep(200);
}
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" "));
  if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push(`${d.params.entry.text} ${d.params.entry.url || ""}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");

const report = [];
async function shot(name) {
  await sleep(700);
  const overflow = await js("document.documentElement.scrollWidth > innerWidth");
  if (overflow) report.push(`${name}: horizontales Scrollen`);
  const { result } = await send("Page.getLayoutMetrics");
  const h = Math.min(Math.ceil(result.cssContentSize.height), 5000);
  const w = Math.ceil(result.cssLayoutViewport.clientWidth);
  const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(`${out}/${name}.png`, Buffer.from(s.result.data, "base64"));
}

const sizes = [["phone", 390, 844, true], ["pc", 1280, 860, false]];
for (const scheme of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  for (const [dev, w, h, mobile] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    const p = `${scheme}-${dev}`;
    await send("Page.navigate", { url: `${base}/#/` });
    await sleep(1200);
    await shot(`${p}-welcome`);
    await js("location.hash = '#/demo'");
    await sleep(1200);
    await shot(`${p}-home`);
    await js("location.hash = '#/e/1'");
    await sleep(800);
    await js("document.querySelector('mark.err')?.click()");
    await shot(`${p}-entry-a2`);
    await js("location.hash = '#/e/4'");
    await shot(`${p}-entry-b2`);
    await js("location.hash = '#/history'");
    await shot(`${p}-history`);
    await js("location.hash = '#/new'");
    await shot(`${p}-new`);
    await js("location.hash = '#/learn'");
    await shot(`${p}-learn`);
    await js("location.hash = '#/learn/session'");
    await sleep(500);
    await js("document.getElementById('flip')?.click()");
    await shot(`${p}-session`);
    await js("location.hash = '#/train'");
    await shot(`${p}-train`);
    await js("location.hash = '#/train/past_simple'");
    await shot(`${p}-drill`);
    await js("location.hash = '#/settings'");
    await shot(`${p}-settings`);
  }
}
console.log(JSON.stringify({ errors: [...new Set(errors)], report }, null, 1));
ws.close();
chrome.kill();
process.exit(0);
