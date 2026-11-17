// Metres, at the established 2 m/cell scale. These are game-design layouts,
// not building-code specifications. Net area excludes exterior walls and the
// listed internal partition allowance; outdoor areas never count as interior.
const standard = {
  occupants: 2, shell: [7.6, 7.6], wall: 0.2, partitions: 1.02,
  rooms: { bedroom: 12.24, bathroom: 5.28, kitchen: 10.88, living: 14.4, circulation: 8.02 },
};
export const FUNCTIONAL_LAYOUTS = {
  house: {...standard, site: [4,4], legacySite: [2,2]},
  'home-gable': {...standard, site: [4,4], legacySite: [2,2]},
  'adobe-gable': {...standard, site: [4,4], legacySite: [2,2]},
  'home-veranda': {...standard, site: [4,5], legacySite: [2,2], verandaDepth: 2},
  'adobe-veranda': {...standard, site: [4,5], legacySite: [2,2], verandaDepth: 2},
  'home-courtyard': {...standard, site: [5,5], legacySite: [2,2], terrace: [2,7.6]},
  'home-family': {
    occupants: 3, site: [5,4], legacySite: [3,2], shell: [9.6,7.6], wall: .2, partitions: 3.24,
    rooms: { mainBedroom: 12.24, singleBedroom: 9, bathroom: 5.28, kitchen: 10.88, living: 17.4, circulation: 8.2 },
  },
  'home-shared': {
    occupants: 4, site: [6,5], legacySite: [4,2], shell: [10.6,9.6], wall: .2, partitions: 8.84,
    rooms: { bedrooms: 36, bathrooms: 9.6, kitchen: 12, living: 18, circulation: 9.4 },
  },
};
export function interiorArea(layout) {
  return Number(((layout.shell[0]-2*layout.wall)*(layout.shell[1]-2*layout.wall)-layout.partitions).toFixed(2));
}
