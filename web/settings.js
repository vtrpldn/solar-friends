const STORAGE_KEY = "solar-friends-settings-v1";
const defaults = { placementGrid: false, ambienceVolume: 0.22, effectsVolume: 0.35 };
const volume = (value, fallback) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...defaults, placementGrid: saved?.placementGrid === true,
      ambienceVolume: volume(saved?.ambienceVolume, defaults.ambienceVolume),
      effectsVolume: volume(saved?.effectsVolume, defaults.effectsVolume) };
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
