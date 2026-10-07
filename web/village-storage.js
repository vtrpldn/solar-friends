export const SAVE_KEY = "solar-friends-v2";

// Keep the original bytes until a rejected save has a separate durable copy.
export class VillageStorage {
  constructor(storage = () => localStorage) {
    this.storage = storage;
    this.blocked = false;
    this.rejected = null;
  }
  read() {
    try {
      return this.storage().getItem(SAVE_KEY);
    } catch (error) {
      this.blocked = true;
      throw error;
    }
  }
  quarantine(raw) {
    this.rejected = raw;
    this.blocked = true;
    this.storage().setItem(`${SAVE_KEY}-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`, raw);
    this.blocked = false;
  }
  write(raw) {
    if (this.blocked) throw new Error("Original save has not been backed up.");
    this.storage().setItem(SAVE_KEY, raw);
  }
  backup(raw) {
    if (this.blocked) throw new Error("Original save has not been backed up.");
    this.storage().setItem(`${SAVE_KEY}-backup`, raw);
  }
}
