import { buildingArt } from '../building-art.js?v=night-1';
import { CHICKEN_WIDTH, chickenFrame } from '../chickens.js?v=painted-hens-1';
// Cell coordinates are fractions of the original image; originals are never rewritten.
export const catalog = [];
function add(id, name, file, group, options = {}) {
  catalog.push({ id, name, file: `../art/${file}`, group, usage: 'Active', cell: [0, 0, 1, 1], width: 152, anchor: .76, ...options });
}
for (const [kind, art] of Object.entries(buildingArt)) {
  const id = { home: 'village-atlas-isometric.png-0', kitchen: 'village-atlas-isometric.png-1', grove: 'village-atlas-isometric.png-3', garden: 'garden-simple', well: 'cistern' }[kind] || kind;
  add(id, art.name, art.file, 'Buildings', { ...art, file: `../art/${art.file}`, building: true });
  add(`${id}-night`, `${art.name} · night`, art.nightFile, 'Buildings', { ...art, name: `${art.name} · night`, file: `../art/${art.nightFile}`, building: true });
}
['Jequitibá-rosa','Juçara','Embaúba','Pau-brasil'].forEach((name,i) => add(`forest-${i}`,name,'mata-atlantica-atlas.png','Vegetation',{cell:[i%2/2,Math.floor(i/2)/2,.5,.5],width:[145,112,113,125][i],anchor:.85}));
['Meadow','Red earth'].forEach((name,i) => add(`terrain-${i}`,name,'terrain-atlas.png','Terrain',{cell:[i/2,0,.5,1],anchor:.5}));
['Iara','Bento','Luz','Cauã','Nina'].forEach((name,i) => add(`portrait-${i}`,name,'residents-cistern.png','Portraits',{cell:[i%3/3,Math.floor(i/3)/2,1/3,.5],width:43,anchor:.97}));
['iara','bento','luz','caua','nina'].forEach((id,i) => add(id,['Iara','Bento','Luz','Cauã','Nina'][i],`animations/${id}.png`,'Animations',{animation:true,width:43,anchor:.97}));
['Cream','Ochre','Brown'].forEach((name,i) => add(`hen-${i}`,`${name} chicken`,'chickens.png','Animals',{chicken:true,variant:i,cell:[i/3,0,1/3,.5],width:CHICKEN_WIDTH,anchor:chickenFrame({variant:i,peck:0}).anchor}));

['iara','bento','luz','caua','nina'].forEach((id,i) => add(`${id}-idle`,`${['Iara','Bento','Luz','Cauã','Nina'][i]} · standing idles`,`animations/${id}-idle.png`,'Animations',{animation:true,idleAnimation:true,width:43,anchor:.97}));
