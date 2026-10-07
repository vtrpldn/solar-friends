const STORAGE_KEY = "solar-friends-settings-v1";
const defaults = { placementGrid: false };

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaults, placementGrid: saved?.placementGrid === true };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
