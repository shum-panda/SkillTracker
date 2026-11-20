// Speicher-Schnittstelle. MemoryStore für Tests, Demo und Browser ohne IndexedDB; IdbStore in store-idb.js.
//   getSetting(key) · setSetting(key, value) · addEntry(entry) -> id · putEntry(entry) · getEntry(id)
//   listEntries() (neueste zuerst) · deleteEntry(id) · clearAll()

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export function sortEntries(list) {
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id);
}

export class MemoryStore {
  constructor() {
    this.persistent = false;
    this.settings = new Map();
    this.entries = new Map();
    this.nextId = 1;
  }
  async getSetting(key) { return clone(this.settings.get(key)); }
  async setSetting(key, value) { this.settings.set(key, clone(value)); }
  async addEntry(entry) {
    const id = this.nextId++;
    this.entries.set(id, clone({ ...entry, id }));
    return id;
  }
  async putEntry(entry) {
    this.entries.set(entry.id, clone(entry));
    if (entry.id >= this.nextId) this.nextId = entry.id + 1;
  }
  async getEntry(id) { return clone(this.entries.get(Number(id))); }
  async listEntries() { return sortEntries([...this.entries.values()].map(clone)); }
  async deleteEntry(id) { this.entries.delete(Number(id)); }
  async clearAll() {
    this.settings.clear();
    this.entries.clear();
    this.nextId = 1;
  }
}
