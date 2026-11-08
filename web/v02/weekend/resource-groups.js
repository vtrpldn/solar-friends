// Shared inventory and trade ordering; processing location does not determine type.
export const RESOURCE_GROUPS = [
  {
    name: "Raw materials",
    ids: ["wood", "bamboo", "earth", "stone"],
  },
  {
    name: "Manufactured / industrial materials",
    ids: [
      "frames",
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
      "pumps",
      "tools",
    ],
  },
  {
    name: "Food & farm supplies",
    ids: [
      "food",
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
    ids: ["seedlings", "tree_starts", "bamboo_starts", "goats", "bees", "hens"],
  },
];
