import {EditorMap} from './map-view.js';

// Use the shared painted world, without editor markers, tools or selection.
// This detached renderer owns no observers or event listeners.
// One renderer per loaded art library retains the terrain cache between saves.
// Its normal ground key still invalidates roads, soil, rivers and biome changes.
const renderers=new WeakMap();
export function creationThumbnail(definition,snapshot,art,{showCamp=false}={}){
  let renderer=renderers.get(art);
  if(!renderer){const canvas=document.createElement('canvas');renderer={canvas,map:new EditorMap(canvas,art,{preview:true})};renderers.set(art,renderer);}
  const {canvas,map}=renderer;
  map.set(definition,snapshot,{center:showCamp?definition.map.camp:definition.map.camera,zoom:1.3,grid:false,showCamp});
  if(map.artLoading)throw Error('Resident artwork is still loading; keep the previous preview.');
  return canvas.toDataURL('image/webp',.72);
}

export function mapThumbnail(definition,snapshot,art){
  return creationThumbnail({...definition,start:{...definition.start,buildings:[],roads:[],resource_sites:[]}}, {...snapshot,residents:[],village:{...snapshot.village,buildings:[],pipes:{lines:[]},power:{network:{nodes:[]}}}},art);
}
