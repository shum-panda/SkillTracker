// Briefkasten beim Vermittler: Nachricht ablegen bzw. (mit Warten) abholen.

const url = (base, room, slot, q = "") => `${String(base).replace(/\/+$/, "")}/r/${encodeURIComponent(room)}/${slot}${q}`;

export async function relayPut(base, room, slot, data, { fetch: f = globalThis.fetch, signal } = {}) {
  const res = await f(url(base, room, slot), { method: "PUT", body: data, headers: { "content-type": "text/plain" }, signal });
  if (!res.ok) throw new Error(`Vermittler: ${res.status}`);
}

// Liefert die Nachricht oder null, wenn innerhalb von `wait` Sekunden keine kam.
export async function relayGet(base, room, slot, { wait = 25, fetch: f = globalThis.fetch, signal } = {}) {
  const res = await f(url(base, room, slot, `?wait=${wait}`), { signal });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Vermittler: ${res.status}`);
  return res.text();
}

// Wartet bis zu `totalMs` auf eine Nachricht (mehrere lange Anfragen hintereinander).
export async function relayWait(base, room, slot, { totalMs = 180000, signal, ...rest } = {}) {
  const until = Date.now() + totalMs;
  while (Date.now() < until) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const left = Math.max(1, Math.min(25, Math.round((until - Date.now()) / 1000)));
    const msg = await relayGet(base, room, slot, { wait: left, signal, ...rest });
    if (msg !== null) return msg;
  }
  return null;
}
