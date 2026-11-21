// Geräte-Abgleich: Stand als Paket packen und ein fremdes Paket beidseitig zusammenführen (nichts wird überschrieben).
// Verweise reisen als geräteübergreifende uid und werden lokal auf IDs umgeschrieben.
import { cleanCard, cleanEntry, cleanSettings, isUid, target } from "./backup.js";
import { mergeCards } from "./cards.js";

const APP = "skilltracker";
const uid = () => crypto.randomUUID();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Fehlende uids vergeben (einmalig je Eintrag/Karte).
export async function ensureUids(store) {
  for (const e of await store.listEntries()) if (!isUid(e.uid)) await store.putEntry({ ...e, uid: uid() });
  for (const c of await store.listCards()) if (!isUid(c.uid)) await store.putCard({ ...c, uid: uid() });
}

// Text löschen und merken, damit er beim nächsten Abgleich nicht zurückkommt.
export async function deleteEntryEverywhere(store, entry) {
  await store.deleteEntry(entry.id);
  if (!isUid(entry.uid)) return;
  const set = new Set((await store.getSetting("deletedEntryUids")) || []);
  set.add(entry.uid);
  await store.setSetting("deletedEntryUids", [...set].slice(-5000));
}

export async function buildSnapshot(store, { includeProviders = false } = {}) {
  await ensureUids(store);
  const entries = await store.listEntries();
  const uidOf = new Map(entries.map((e) => [e.id, e.uid]));
  const out = {
    app: APP, kind: "sync", version: 1, createdAt: new Date().toISOString(),
    entries: entries.map(({ id, revisionOf, ...e }) => ({
      ...e,
      ...(uidOf.has(revisionOf) ? { revisionOfUid: uidOf.get(revisionOf) } : {}),
      revisions: (e.revisions || []).map(({ resultEntryId, ...r }) => ({ ...r, ...(uidOf.has(resultEntryId) ? { resultEntryUid: uidOf.get(resultEntryId) } : {}) })),
    })),
    cards: (await store.listCards()).map(({ id, sources, ...c }) => ({ ...c, sources: [], sourceUids: (sources || []).map((s) => uidOf.get(s)).filter(Boolean) })),
    settings: {
      drills: (await store.getSetting("drills")) || [],
      deletedCardKeys: (await store.getSetting("deletedCardKeys")) || [],
      deletedEntryUids: (await store.getSetting("deletedEntryUids")) || [],
    },
  };
  if (includeProviders) out.providers = (await store.getSetting("providers")) || [];
  return out;
}

const revKey = (r) => `${r.createdAt}|${r.mode}`;
const drillKey = (d) => `${d.createdAt}|${d.category}`;
const strip = ({ _oldId, _revisionOf, _revisionOfUid, ...e }) => ({ ...e, revisions: e.revisions.map(({ _resultOld, _resultUid, ...r }) => r) });

export async function mergeSnapshot(store, snap) {
  if (!isObj(snap) || snap.app !== APP || snap.kind !== "sync") throw new Error("Das sind keine SkillTracker-Daten.");
  const stats = { entriesAdded: 0, entriesUpdated: 0, cardsAdded: 0, cardsUpdated: 0, removed: 0 };
  await ensureUids(store);
  const settings = cleanSettings(snap.settings);

  // Grabsteine vereinigen und anwenden
  const tomb = new Set([...((await store.getSetting("deletedEntryUids")) || []), ...(settings.deletedEntryUids || [])]);
  await store.setSetting("deletedEntryUids", [...tomb].slice(-5000));
  for (const e of await store.listEntries()) {
    if (e.uid && tomb.has(e.uid)) { await store.deleteEntry(e.id); stats.removed++; }
  }

  // Texte
  const incoming = (Array.isArray(snap.entries) ? snap.entries : []).slice(0, 5000)
    .map((raw) => ({ raw, clean: cleanEntry(raw) })).filter((x) => x.clean && x.clean.uid && !tomb.has(x.clean.uid));
  const local = new Map((await store.listEntries()).filter((e) => e.uid).map((e) => [e.uid, e]));
  for (const { clean } of incoming) {
    const have = local.get(clean.uid);
    if (!have) {
      const id = await store.addEntry(strip(clean));
      local.set(clean.uid, { ...strip(clean), id });
      stats.entriesAdded++;
      continue;
    }
    const known = new Set((have.revisions || []).map(revKey));
    const extra = strip(clean).revisions.filter((r) => !known.has(revKey(r)));
    if (extra.length) {
      have.revisions = [...(have.revisions || []), ...extra].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      await store.putEntry(have);
      stats.entriesUpdated++;
    }
  }
  // Verweise auf lokale IDs umschreiben
  const idOf = new Map([...local.values()].map((e) => [e.uid, e.id]));
  for (const { clean } of incoming) {
    const stored = await store.getEntry(idOf.get(clean.uid));
    if (!stored) continue;
    let changed = false;
    if (clean._revisionOfUid && idOf.has(clean._revisionOfUid) && stored.revisionOf !== idOf.get(clean._revisionOfUid)) {
      stored.revisionOf = idOf.get(clean._revisionOfUid);
      changed = true;
    }
    const byKey = new Map(clean.revisions.map((r) => [revKey(r), r._resultUid]));
    stored.revisions = (stored.revisions || []).map((r) => {
      const ru = byKey.get(revKey(r));
      if (ru && idOf.has(ru) && r.resultEntryId !== idOf.get(ru)) { changed = true; return { ...r, resultEntryId: idOf.get(ru) }; }
      return r;
    });
    if (changed) await store.putEntry(stored);
  }

  // Karten
  const deletedKeys = new Set([...((await store.getSetting("deletedCardKeys")) || []), ...(settings.deletedCardKeys || [])]);
  await store.setSetting("deletedCardKeys", [...deletedKeys].slice(-5000));
  const cards = await store.listCards();
  for (const c of cards) if (deletedKeys.has(c.key) && c.type !== "manual") { await store.deleteCard(c.id); stats.removed++; }
  const remaining = (await store.listCards());
  const byUid = new Map(remaining.filter((c) => c.uid).map((c) => [c.uid, c]));
  const fresh = [];
  for (const raw of (Array.isArray(snap.cards) ? snap.cards : []).slice(0, 20000)) {
    const c = cleanCard(raw);
    if (!c || deletedKeys.has(c.key)) continue;
    const { _sourceUids, ...card } = c;
    card.sources = _sourceUids.filter((u) => idOf.has(u)).map((u) => idOf.get(u));
    const have = (card.uid && byUid.get(card.uid)) || remaining.find((x) => x.key === card.key);
    if (!have) { fresh.push(card); continue; }
    const sources = [...new Set([...(have.sources || []), ...card.sources])];
    const theirs = card.sched;
    const mine = have.sched || {};
    const takeTheirs = (theirs.reps || 0) > (mine.reps || 0)
      || ((theirs.reps || 0) === (mine.reps || 0) && String(theirs.due || "") > String(mine.due || ""));
    if (takeTheirs || sources.length !== (have.sources || []).length) {
      await store.putCard({ ...have, sources, ...(takeTheirs ? { sched: theirs, suspended: card.suspended } : {}) });
      stats.cardsUpdated++;
    }
  }
  const { added } = mergeCards(await store.listCards(), fresh, deletedKeys);
  for (const c of added) await store.addCard(c);
  stats.cardsAdded = added.length;

  // Übungsergebnisse
  const drills = (await store.getSetting("drills")) || [];
  const dk = new Set(drills.map(drillKey));
  const newDrills = (settings.drills || []).filter((d) => !dk.has(drillKey(d)));
  if (newDrills.length) await store.setSetting("drills", [...drills, ...newDrills].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-500));

  // KI-Zugänge nur, wenn das andere Gerät sie ausdrücklich mitgeschickt hat
  if (Array.isArray(snap.providers)) {
    const clean = cleanSettings({ providers: snap.providers }).providers || [];
    const current = (await store.getSetting("providers")) || [];
    const byId = new Map(current.map((p) => [p.id, p]));
    for (const p of clean) {
      const old = byId.get(p.id);
      byId.set(p.id, { ...p, apiKey: p.apiKey || (old && target(old) === target(p) ? old.apiKey : "") });
    }
    await store.setSetting("providers", [...byId.values()]);
  }
  return stats;
}
