// IndexedDB-Speicher (nur im Browser). Gleiche Schnittstelle wie MemoryStore.
// Schreibvorgänge gelten erst als erledigt, wenn die Transaktion abgeschlossen ist (oncomplete) –
// ein voller Speicher zeigt sich oft erst als Abbruch der Transaktion.
import { sortEntries } from "./store.js";

export class IdbStore {
  constructor(db) {
    this.db = db;
    this.persistent = true;
  }

  static open(name = "skilltracker") {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error("IndexedDB nicht verfügbar"));
      const r = indexedDB.open(name, 2); // 2: Karteikarten
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
        if (!db.objectStoreNames.contains("entries")) {
          db.createObjectStore("entries", { keyPath: "id", autoIncrement: true }).createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("cards")) {
          db.createObjectStore("cards", { keyPath: "id", autoIncrement: true }).createIndex("key", "key");
        }
      };
      r.onsuccess = () => resolve(new IdbStore(r.result));
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("Datenbank ist in einem anderen Tab blockiert"));
    });
  }

  // Führt fn(objectStore) in einer Transaktion aus; liefert das Ergebnis der letzten Anfrage nach Abschluss.
  run(names, mode, fn) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.db.transaction(names, mode);
      } catch (e) {
        reject(e);
        return;
      }
      let result;
      const req = fn(tx);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      const fail = () => {
        const err = tx.error || req?.error || new Error("Speichern fehlgeschlagen");
        reject(err.name === "QuotaExceededError" ? new Error("Der Speicher auf diesem Gerät ist voll.") : err);
      };
      tx.onerror = fail;
      tx.onabort = fail;
    });
  }

  getSetting(key) { return this.run("settings", "readonly", (tx) => tx.objectStore("settings").get(key)); }
  setSetting(key, value) { return this.run("settings", "readwrite", (tx) => tx.objectStore("settings").put(value, key)).then(() => {}); }
  addEntry(entry) {
    const { id, ...rest } = entry;
    return this.run("entries", "readwrite", (tx) => tx.objectStore("entries").add(rest));
  }
  putEntry(entry) { return this.run("entries", "readwrite", (tx) => tx.objectStore("entries").put(entry)).then(() => {}); }
  getEntry(id) { return this.run("entries", "readonly", (tx) => tx.objectStore("entries").get(Number(id))); }
  async listEntries() { return sortEntries((await this.run("entries", "readonly", (tx) => tx.objectStore("entries").getAll())) || []); }
  deleteEntry(id) { return this.run("entries", "readwrite", (tx) => tx.objectStore("entries").delete(Number(id))).then(() => {}); }
  addCard(card) {
    const { id, ...rest } = card;
    return this.run("cards", "readwrite", (tx) => tx.objectStore("cards").add(rest));
  }
  putCard(card) { return this.run("cards", "readwrite", (tx) => tx.objectStore("cards").put(card)).then(() => {}); }
  getCard(id) { return this.run("cards", "readonly", (tx) => tx.objectStore("cards").get(Number(id))); }
  async listCards() { return ((await this.run("cards", "readonly", (tx) => tx.objectStore("cards").getAll())) || []).sort((a, b) => a.id - b.id); }
  deleteCard(id) { return this.run("cards", "readwrite", (tx) => tx.objectStore("cards").delete(Number(id))).then(() => {}); }
  clearAll() {
    return this.run(["settings", "entries", "cards"], "readwrite", (tx) => {
      tx.objectStore("settings").clear();
      tx.objectStore("cards").clear();
      return tx.objectStore("entries").clear();
    }).then(() => {});
  }
}
