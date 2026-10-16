import {natureArt} from '../nature-art.js';
import {economyArt,economyAtlasFile} from '../economy-art.js';
import {batteryArt} from '../battery-art.js';
import { RESIDENT_WIDTH, FRAME_ANCHOR } from '../sprite-frames.js';
import { allBuildingArt } from '../building-art.js?v=night-1';
import { CHICKEN_WIDTH, chickenFrame } from '../chickens.js?v=painted-hens-1';
// Cell coordinates are fractions of the original image; originals are never rewritten.
export const catalog = [];
function add(id, name, file, group, options = {}) {
  catalog.push({ id, name, file: `../art/${file}`, group, usage: 'Active', cell: [0, 0, 1, 1], width: 152, anchor: .76, ...options });
}
for (const [kind, art] of Object.entries(allBuildingArt)) {
  const id = { home: 'village-atlas-isometric.png-0', kitchen: 'village-atlas-isometric.png-1', grove: 'village-atlas-isometric.png-3', garden: 'garden-simple', well: 'cistern' }[kind] || kind;
  add(id, art.name, art.file, 'Buildings', { ...art, file: `../art/${art.file}`, building: true });
  add(`${id}-night`, `${art.name} · night`, art.nightFile, 'Buildings', { ...art, name: `${art.name} · night`, file: `../art/${art.nightFile}`, renderFilter:art.nightTint, building: true });
}
['Jequitibá-rosa','Juçara','Embaúba','Pau-brasil'].forEach((name,i) => add(`forest-${i}`,name,'mata-atlantica-atlas.png','Vegetation',{cell:[i%2/2,Math.floor(i/2)/2,.5,.5],width:[145,112,113,125][i],anchor:.85}));
['Meadow','Red earth'].forEach((name,i) => add(`terrain-${i}`,name,'terrain-atlas.png','Terrain',{cell:[i/2,0,.5,1],anchor:.5}));
['Iara','Bento','Luz','Cauã','Nina'].forEach((name,i) => add(`portrait-${i}`,name,`animations/${['iara','bento','luz','caua','nina'][i]}.png`,'Portraits',{portrait:true,cell:[0,.5,.25,.25],width:RESIDENT_WIDTH,anchor:FRAME_ANCHOR}));
add('resident-reference','Original resident study','residents-cistern.png','References',{usage:'Reference',width:200,anchor:.5});
['iara','bento','luz','caua','nina'].forEach((id,i) => add(id,['Iara','Bento','Luz','Cauã','Nina'][i],`animations/${id}.png`,'Animations',{animation:true,width:RESIDENT_WIDTH,anchor:FRAME_ANCHOR}));
['Cream','Ochre','Brown'].forEach((name,i) => add(`hen-${i}`,`${name} chicken`,'chickens.png','Animals',{chicken:true,variant:i,cell:[i/3,0,1/3,.5],width:CHICKEN_WIDTH,anchor:chickenFrame({variant:i,peck:0}).anchor}));

['iara','bento','luz','caua','nina'].forEach((id,i) => add(`${id}-idle`,`${['Iara','Bento','Luz','Cauã','Nina'][i]} · standing idles`,`animations/${id}-idle.png`,'Animations',{animation:true,idleAnimation:true,width:RESIDENT_WIDTH,anchor:FRAME_ANCHOR}));

['iara','bento','luz','caua','nina'].forEach((id,i) => add(`${id}-activities`,`${['Iara','Bento','Luz','Cauã','Nina'][i]} · daily work`,`animations/${id}-activities.png`,'Animations',{animation:true,activityAnimation:true,width:RESIDENT_WIDTH,anchor:FRAME_ANCHOR}));
['Lettuce','Beans','Tomatoes'].forEach((name,column) => ['Seedling','Growing','Harvestable'].forEach((stage,row) => add(`crop-${column}-${row}`,`${name} · ${stage}`,'crops.png','Crops',{crop:true,frame:row*3+column,cell:[column/3,row/3,1/3,1/3],width:column?26:22,anchor:FRAME_ANCHOR})));

economyArt.forEach((art,i)=>add(`economy-${i}`,art.name,economyAtlasFile,'Land & supplies',{...art}));
add('recovered-battery','Recovered battery','recovered-battery.png','Land & supplies',{cell:batteryArt.crop.map(n=>n/1254),width:batteryArt.width,anchor:batteryArt.anchor,aspect:batteryArt.crop[3]/batteryArt.crop[2]});

add('economy-original','Original economy prop study','economy-atlas.png','References',{usage:'Reference',width:250,anchor:.95});

['Maize','Cassava','Fodder grass'].forEach((name,column)=>['Seedling','Growing','Harvestable'].forEach((stage,row)=>add(`field-crop-${column}-${row}`,`${name} · ${stage}`,'field-crops.png','Crops',{crop:true,frame:row*3+column,cell:[column/3,row/3,1/3,1/3],width:column===2?26:30,anchor:FRAME_ANCHOR})));

natureArt.forEach((art,i)=>add(`landscape-${i}`,art.name,art.file,i<4?'Vegetation':'Terrain',{...art,file:'../art/'+art.file}));

add('shed-proposal','Shed proposal · geometry correction needed','starter-shed-isometric.png','References',{usage:'Unapproved candidate',width:185,anchor:.8});
