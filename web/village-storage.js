export const SAVE_KEY = "solar-friends-v3";

// Keep the original bytes until a rejected save has a separate durable copy.
export class VillageStorage {
  constructor(storage = () => localStorage, key = SAVE_KEY) {
    this.storage = storage;
    this.key = key;
    this.blocked = false;
    this.rejected = null;
  }
  read() {
    try {
      return this.storage().getItem(this.key);
    } catch (error) {
      this.blocked = true;
      throw error;
    }
  }
  quarantine(raw) {
    this.rejected = raw;
    this.blocked = true;
    this.storage().setItem(`${this.key}-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`, raw);
    this.blocked = false;
  }
  write(raw) {
    if (this.blocked) throw new Error("Original save has not been backed up.");
    this.storage().setItem(this.key, raw);
  }
  backup(raw) {
    if (this.blocked) throw new Error("Original save has not been backed up.");
    this.storage().setItem(`${this.key}-backup`, raw);
  }
  readBackup() {
    return this.storage().getItem(`${this.key}-backup`);
  }
  readRecovery() {
    if (this.rejected !== null) return this.rejected;
    const storage = this.storage();
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter(key => key?.startsWith(`${this.key}-recovery-`)).sort();
    this.rejected = keys.length ? storage.getItem(keys.at(-1)) : null;
    return this.rejected;
  }
}
