import {EditorMap} from './map-view.js';

// Use the shared painted world, without editor markers, tools or selection.
// This detached renderer owns no observers or event listeners.
export function creationThumbnail(definition,snapshot,art){
  const canvas=document.createElement('canvas');
  const map=new EditorMap(canvas,art,{preview:true});
  map.set(definition,snapshot,{center:definition.map.camera,zoom:1.3,grid:false});
  return canvas.toDataURL('image/webp',.72);
}

export function mapThumbnail(definition,snapshot,art){
  return creationThumbnail({...definition,start:{...definition.start,buildings:[],roads:[],resource_sites:[]}}, {...snapshot,residents:[],village:{...snapshot.village,buildings:[],pipes:{lines:[]},power:{network:{nodes:[]}}}},art);
}
