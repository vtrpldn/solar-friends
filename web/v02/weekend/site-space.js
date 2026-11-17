import { METRES_PER_CELL } from '../library/scale.js';
import {FUNCTIONAL_PROGRAM,FUNCTIONAL_DESCRIPTIONS} from '../library/functional-program.js';
import {FUNCTIONAL_LAYOUTS} from '../library/functional-layouts.js';

// Physical dimensions exclude access reservations and roof/canopy overhangs.
// Productive area describes the visible plot, never a production-rate multiplier.
export const SITE_SPACE = {
  house: { object: [3.5, 3.5], label: 'wall shell', note: 'Compact cabin; the site is not its interior floor area.' },
  'home-family': { object: [5.5, 3.35], label: 'wall shell', note: 'Compact family cabin; capacity is not derived from floor area.' },
  'home-shared': { object: [7.5, 3.35], label: 'wall shell', note: 'Shared sleeping cabin; capacity is not derived from floor area.' },
  kitchen: { object: [7.25, 2.9], note: 'Cooking and covered dining bays. Keep the front approach open.' },
  workshop: { object: [3.4, 2.8], note: 'Small workshop. Keep the front work/loading approach open.' },
  warehouse: { object: [3.55, 3.2], note: 'Small storage shed. Storage capacity is not derived from volume.' },
  orchard: { object: [4, 4], note: 'Two compact fruit trees in a 16 m² plot; crowns may overhang. Not a full-size orchard.' },
  grove: { object: [4, 4], note: 'Two banana clumps in a 16 m² plot; leaves may overhang.' },
  garden: { object: [3.2, 3.5], productiveArea: 8.16, note: 'Two growing beds with a central 0.6 m working aisle; about 8 m² planted.' },
  greenhouse: { object: [3.5, 3.5], label: 'wall shell', productiveArea: 4.8, note: 'Two 0.8 × 3 m growing beds with a central aisle; 4.8 m² planted.' },
  goat_pasture: { object: [5.63, 3.63], note: 'A holding pen with shelter for two goats. No grazing land is included.' },
  'goat-pasture-empty': { object: [5.63, 3.63], note: 'An empty holding pen. No grazing land is included.' },
  solar_farm: { object: [5.6, 3.45], note: 'Six small panels and row spacing; electrical capacity is defined separately.' },
  bridge: { object: [16, 1.96], note: '1.75 m walking deck. Both ends must remain reachable on dry land.' },
  'rain-barrel': { object: [0.96, 0.86], note: 'The reserved site includes room to reach the tap; the barrel itself is about 0.74 m across.' },
  'wayfinding-sign': { object: [1.2, 0.15], note: 'A small sign, with a whole-cell placement reservation. Keep a walking route beside it.' },
  'supply-5': { object: [2, 0.85], note: 'A 2 × 0.85 m bench; the rest of the site is working space. Keep one neighbouring side reachable.' },
  'supply-6': { object: [0.78, 0.57], note: 'A compact battery unit with a whole-cell service reservation.' },
  'water-pump': { object: [1.5, 1.4], note: 'Pump pad with service space inside the reserved site.' },
};
for (const id of ['home-veranda','home-gable','home-courtyard','adobe-gable','adobe-veranda'])
  SITE_SPACE[id] = { object: [3.4, id.includes('veranda') || id.includes('courtyard') ? 2.55 : 3.35], label: 'wall shell', note: 'Compact cabin with a porch or threshold. Keep the front approach open.' };

for(const [id,l] of Object.entries(FUNCTIONAL_LAYOUTS))SITE_SPACE[id]={object:l.shell,label:'external wall shell',
  note:`Exterior shell only; rooms and furnishings are not modeled. Reserved outdoor clearance is separate from the house.`};
for(const [id,p] of Object.entries(FUNCTIONAL_PROGRAM)){
  if(FUNCTIONAL_LAYOUTS[id]||!p.shell)continue;
  SITE_SPACE[id]={object:p.shell,label:'structure',note:FUNCTIONAL_DESCRIPTIONS[id]||'Keep the service approach clear.'};
}
Object.assign(SITE_SPACE,{
  garden:{object:[4.28,9.36],productiveArea:19.2,note:'Four 1.2 × 4 m beds; 19.2 m² planted. Central and end aisles remain clear.'},
  greenhouse:{object:[6,10],productiveArea:19.2,note:'Two 1.2 × 8 m beds; 19.2 m² planted, a 1 m central aisle and 1 m end access.'},
  orchard:{object:[10,10],note:'Four compact fruit trees on 4 m centres. Mature size and yield remain species-dependent.'},
  grove:{object:[8,8],note:'Four banana clumps on 3 m centres, with harvesting access.'},
  solar_farm:{object:[5.2,5.4],note:'Six 1.1 × 1.8 m panels: 11.88 m² panel surface, with row and service access. Rated output is separate.'},
  goat_pasture:{object:[11,9],note:'Two-goat pen with a 9 m² shelter and 90 m² outdoor area. Supplied feed or separate grazing is needed.'},
  'goat-pasture-empty':{object:[11,9],note:'Empty pen with a 9 m² shelter and 90 m² outdoor area. This does not include grazing land.'},
  compost:{object:[3.9,1.1],note:'Three 1 m³ bays plus front working access. Actual output depends on feedstock.'},
});

export function siteDimensions(size) {
  return `${size.map(n => n * METRES_PER_CELL).join(' × ')} m`;
}
export function siteDescription(asset, size) {
  const space = asset === "bridge" && size[1] === 2
    ? {object: [16, 3.92], note: "Existing wide bridge: 3.5 m walking deck. Legacy site and centre retained."}
    : SITE_SPACE[asset];
  return `Reserved site: ${siteDimensions(size)} (${size.join(' × ')} cells).${space ? ` ${space.object.join(' × ')} m ${['orchard','grove'].includes(asset) ? 'plot' : space.label || 'physical footprint'}. ${space.note}` : ' Includes the object and placement clearance.'} Access uses reachable neighbouring cells; it is not extra productive land.`;
}

// Only this known historical layout is supported, not arbitrary saved dimensions.
export function unrotatedSiteSize(project, defaultSize) {
  return project.key === 'bridge' && project.siteVersion === 0 ? [8, 2] : defaultSize;
}
export function validSiteVersion(project) {
  return project.siteVersion === undefined || (project.key === 'bridge' && [0, 1].includes(project.siteVersion));
}
export function bridgeWidthScale(project) {
  return project.key === 'bridge' && project.siteVersion === 0 ? 2 : 1;
}

export function projectDescription(def, project) {
  const size = unrotatedSiteSize(project, def.size);
  return def.description.replace(siteDescription(def.asset, def.size),
    siteDescription(def.asset, size)).replace(`${def.size.join(' × ')} cells.`, `${size.join(' × ')} cells.`);
}
