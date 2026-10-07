import assert from 'node:assert/strict';
import { VillageStorage, SAVE_KEY } from '../web/village-storage.js';
const records = new Map([[SAVE_KEY, '{broken original']]);
let full = false;
const storage = new VillageStorage(() => ({
  get length() { return records.size; },
  key: i => [...records.keys()][i],
  getItem: key => records.get(key) ?? null,
  setItem: (key, value) => { if (full) throw new Error('quota'); records.set(key, value); },
}));
const original = storage.read();
full = true;
assert.throws(() => storage.quarantine(original));
assert.throws(() => storage.write('fresh'));
assert.equal(storage.readRecovery(), original, 'failed durable backup still allows downloading original bytes');
assert.throws(() => storage.backup('fresh'));
assert.equal(records.get(SAVE_KEY), original, 'failed recovery must never overwrite the original');
full = false;
storage.quarantine(original);
storage.write('new village');
assert.equal([...records.entries()].find(([key]) => key.includes('-recovery-'))[1], original);
assert.equal(records.get(SAVE_KEY), 'new village');
storage.backup('new village');
storage.write('imported village');
assert.equal(records.get(`${SAVE_KEY}-backup`), 'new village');
assert.equal(storage.readBackup(), 'new village');
const reloaded = new VillageStorage(storage.storage);
assert.equal(reloaded.readRecovery(), original, 'recovery remains discoverable after reload');
const denied = new VillageStorage(() => { throw new Error('storage denied'); });
assert.throws(() => denied.read());
assert.throws(() => denied.write('fresh'));
console.log('Save recovery, quota failure, import backup, and denied storage checks passed.');
