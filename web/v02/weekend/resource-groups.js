import {CROPS,SEED_IDS} from './crops.js';
// Shared inventory and trade ordering; processing location does not determine type.
export const RESOURCE_GROUPS = [
  {name:'Items & equipment',ids:['bucket','garden-tools','carpentry-tools','harvest-basket','cleaning-kit','watering-can','wheelbarrow','bicycle','produce-crates','tools']},
  {
    name: "Raw materials",
    ids: ["logs", "bamboo", "earth", "stone"],
  },
  {
    name: "Manufactured / industrial materials",
    ids: [
      "wood", "planks", "frames",
      "walls",
      "tiles",
      "hardware",
      "roofing",
      "tarp",
      "tank",
      "plumbing",
      "sanitation",
      "electrical",
      "covering",
      "panels",
      "batteries",
      "cooling",
      "pumps",
      "wheel_kit", "tool_heads", "repair_supplies", "soap",
    ],
  },
  {
    name: "Food & farm supplies",
    ids: [
      "food", ...Object.keys(CROPS),
      "meals",
      "eggs",
      "milk",
      "honey",
      "fodder",
      "compost",
      "scraps",
    ],
  },
  {
    name: "Plants & animals",
    ids: [...SEED_IDS, "seedlings", "tree_starts", "bamboo_starts", "goats", "bees", "hens"],
  },
];

export const EQUIPMENT_IDS = new Set(RESOURCE_GROUPS[0].ids);
export function inventoryGroups(view) {
  if(view==='food')return [{name:'Food from town & the village',ids:['food',...Object.keys(CROPS),'meals','eggs','milk','honey']}];
  return RESOURCE_GROUPS.filter(group => (view === 'items') === group.ids.some(id => EQUIPMENT_IDS.has(id)));
}
