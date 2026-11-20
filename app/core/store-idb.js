// IndexedDB-Speicher (nur im Browser). Gleiche Schnittstelle wie MemoryStore.
import { sortEntries } from "./store.js";

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export class IdbStore {
  constructor(db) {
    this.db = db;
    this.persistent = true;
  }

  static open(name = "skilltracker") {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error("IndexedDB nicht verfügbar"));
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
        if (!db.objectStoreNames.contains("entries")) {
          db.createObjectStore("entries", { keyPath: "id", autoIncrement: true }).createIndex("createdAt", "createdAt");
        }
      };
      r.onsuccess = () => resolve(new IdbStore(r.result));
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("Datenbank ist in einem anderen Tab blockiert"));
    });
  }

  tx(store, mode = "readonly") {
    return this.db.transaction(store, mode).objectStore(store);
  }

  getSetting(key) { return req(this.tx("settings").get(key)); }
  async setSetting(key, value) { await req(this.tx("settings", "readwrite").put(value, key)); }
  async addEntry(entry) {
    const { id, ...rest } = entry;
    return req(this.tx("entries", "readwrite").add(rest));
  }
  async putEntry(entry) { await req(this.tx("entries", "readwrite").put(entry)); }
  getEntry(id) { return req(this.tx("entries").get(Number(id))); }
  async listEntries() { return sortEntries(await req(this.tx("entries").getAll())); }
  async deleteEntry(id) { await req(this.tx("entries", "readwrite").delete(Number(id))); }
  async clearAll() {
    await req(this.tx("settings", "readwrite").clear());
    await req(this.tx("entries", "readwrite").clear());
  }
}
