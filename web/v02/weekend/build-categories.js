// Functional categories are stable; Camp essentials is a curated starter shortcut.
export const BUILD_CATEGORIES = ['Camp essentials', 'Homes & shelter', 'Food & farming', 'Animals', 'Water & sanitation', 'Power', 'Storage & production', 'Paths & boundaries', 'Community & leisure', 'All'];
const essentials = new Set(['gathering', 'water', 'shelter', 'toilet', 'rain-tent', 'covered-stores', 'tarp-stores']);
const groups = {
  'Homes & shelter': ['home', 'shed', 'rain-shelter', 'canvas-tent-teal', 'canvas-tent-ochre'],
  'Food & farming': ['kitchen', 'garden', 'greenhouse', 'grove', 'orchard', 'compost', 'watering-can', 'seedling-bench'],
  Animals: ['coop', 'goat_pasture', 'apiary'],
  'Water & sanitation': ['water-storage', 'well', 'groundwater-well', 'water-pump', 'rain-barrel', 'wash-station', 'eco_toilet', 'wetland', 'banana_treatment', 'biodigester', 'clothesline'],
  Power: ['solar_farm', 'hydro', 'streetlight', 'supply-6'],
  'Storage & production': ['warehouse', 'workshop', 'covered-storage', 'camp-storage', 'supply-0', 'supply-1', 'supply-2', 'supply-3', 'supply-5', 'woodpile', 'produce-crates', 'tool-rack', 'wheelbarrow'],
  'Paths & boundaries': ['road', 'bridge', 'farm-gate', 'wayfinding-sign'],
  'Community & leisure': ['square', 'picnic-table', 'garden-bench', 'hammock', 'bicycle', 'fire-circle', 'reading-room', 'outdoor-classroom', 'community-hall', 'exercise-garden', 'volleyball-court'],
};
export function buildingCategory(definition) {
  return Object.entries(groups).find(([, kinds]) => kinds.includes(definition.kind))?.[0];
}
export function inBuildCategory(key, definition, category) {
  return category === 'All' || (category === 'Camp essentials' ? essentials.has(key) : buildingCategory(definition) === category);
}
