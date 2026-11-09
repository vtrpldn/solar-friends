// Reading a rejected save must never become permission to start autosaving a new village.
export function loadVillage(storage, key, restore) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const village = restore(raw);
  if (!village) throw new Error('Save could not be restored. Original data preserved; autosaving blocked.');
  return village;
}
