// Speicher-Schnittstelle. MemoryStore für Tests, Demo und Browser ohne IndexedDB; IdbStore in store-idb.js.
//   getSetting(key) · setSetting(key, value) · addEntry(entry) -> id · putEntry(entry) · getEntry(id)
//   listEntries() (neueste zuerst) · deleteEntry(id) · clearAll()
//   addCard(card) -> id · putCard(card) · getCard(id) · listCards() (nach id) · deleteCard(id)
//   addActivity(ev) (über uid) · listActivity() (nach at) · deleteActivity(uids)

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export const sortActivity = (list) => list.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.uid).localeCompare(String(b.uid)));

export function sortEntries(list) {
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id);
}

export class MemoryStore {
  constructor() {
    this.persistent = false;
    this.settings = new Map();
    this.entries = new Map();
    this.cards = new Map();
    this.activity = new Map();
    this.nextId = 1;
    this.nextCardId = 1;
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
  async addCard(card) {
    const id = this.nextCardId++;
    this.cards.set(id, clone({ ...card, id }));
    return id;
  }
  async putCard(card) {
    this.cards.set(card.id, clone(card));
    if (card.id >= this.nextCardId) this.nextCardId = card.id + 1;
  }
  async getCard(id) { return clone(this.cards.get(Number(id))); }
  async listCards() { return [...this.cards.values()].map(clone).sort((a, b) => a.id - b.id); }
  async deleteCard(id) { this.cards.delete(Number(id)); }
  async addActivity(ev) { this.activity.set(ev.uid, clone(ev)); }
  async listActivity() { return sortActivity([...this.activity.values()].map(clone)); }
  async deleteActivity(uids) { for (const u of uids) this.activity.delete(u); }
  async clearAll() {
    this.settings.clear();
    this.entries.clear();
    this.cards.clear();
    this.activity.clear();
    this.nextId = 1;
    this.nextCardId = 1;
  }
}
