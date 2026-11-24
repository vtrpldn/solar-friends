// Functional categories are stable; Camp essentials is a curated starter shortcut.
export const BUILD_CATEGORIES = ['Camp essentials', 'Homes & shelter', 'Food & farming', 'Animals', 'Water & sanitation', 'Power', 'Storage & production', 'Paths & boundaries', 'Community & leisure', 'All'];
const essentials = new Set(['gathering', 'well', 'shelter', 'toilet']);
// Retain definitions for existing villages while retiring these build choices.
const retired = new Set(['rain-tent', 'covered-stores', 'tarp-stores', 'goat-pasture-empty', 'water']);
export function isBuildOption(key, definition) {
  return !definition.natural && !retired.has(key);
}
const groups = {
  'Homes & shelter': ['home', 'shed', 'carport', 'rain-shelter', 'canvas-tent-teal', 'canvas-tent-ochre'],
  'Food & farming': ['kitchen', 'garden', 'greenhouse', 'grove', 'orchard', 'compost', 'seedling-bench'],
  Animals: ['coop', 'goat_pasture', 'apiary'],
  'Water & sanitation': ['water-storage', 'well', 'groundwater-well', 'water-pump', 'rain-barrel', 'wash-station', 'eco_toilet', 'wetland', 'banana_treatment', 'biodigester', 'clothesline'],
  Power: ['solar_farm', 'hydro', 'streetlight', 'supply-6'],
  'Storage & production': ['warehouse', 'workshop', 'covered-storage', 'camp-storage', 'supply-0', 'supply-1', 'supply-2', 'supply-3', 'supply-5', 'woodpile', 'tool-rack'],
  'Paths & boundaries': ['road', 'bridge', 'farm-gate', 'wayfinding-sign'],
  'Community & leisure': ['square', 'picnic-table', 'garden-bench', 'hammock', 'fire-circle', 'reading-room', 'outdoor-classroom', 'community-hall', 'exercise-garden', 'volleyball-court'],
};
export function buildingCategory(definition) {
  return Object.entries(groups).find(([, kinds]) => kinds.includes(definition.kind))?.[0];
}
export function inBuildCategory(key, definition, category) {
  return category === 'All' || (category === 'Camp essentials' ? essentials.has(key) : buildingCategory(definition) === category);
}
