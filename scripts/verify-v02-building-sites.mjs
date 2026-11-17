import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { ASSETS, createAsset, compactModel } from '../web/v02/library/catalog.js';
import { BUILDING_MODELS } from '../web/v02/weekend/building-models.js';
import { COMMUNITY } from '../web/v02/library/community-defs.js';
import { SITE_SPACE } from '../web/v02/weekend/site-space.js';
import { FUNCTIONAL_PROGRAM, FUNCTIONAL_DESCRIPTIONS } from '../web/v02/library/functional-program.js';
import {bedLayout} from '../web/v02/weekend/cultivation.js';
import {createCultivationModel} from '../web/v02/weekend/cultivation-models.js';
import { footprint, PROJECTS } from '../web/v02/weekend/simulation.js';
const rows=[], round=n=>Number(n.toFixed(3));
const entries=[...BUILDING_MODELS.map(m=>({...m,asset:m.id})),
  ...Object.entries(PROJECTS).filter(([id,p])=>id!=='field'&&!p.natural&&!BUILDING_MODELS.some(m=>m.id===id)).map(([id,p])=>({id,...p})),
  ...['supply-2','supply-3'].map(key=>({...PROJECTS[key],id:`natural:${key}`,key}))];
for(const model of entries){
  const asset=ASSETS.find(a=>a.id===model.asset);
  assert(asset,`${model.id}: missing art`);
  assert.deepEqual(asset.footprint,model.size,`${model.id}: art/game sites differ`);
  if(COMMUNITY[model.id])assert.deepEqual(COMMUNITY[model.id].size,model.size);
  const states=[asset,...ASSETS.filter(a=>a.constructionOf===model.asset)];
  for(const state of states){
    const raw=createAsset(state.id), visual=new THREE.Box3().setFromObject(raw,true);
    const packed=compactModel(raw);
    for(let rotation=0;rotation<4;rotation++){
      packed.rotation.y=rotation*Math.PI/2;packed.updateMatrixWorld(true);
      const b=new THREE.Box3().setFromObject(packed,true);
      const [w,d]=rotation%2?[...model.size].reverse():model.size;
      assert.deepEqual(footprint({key:model.key||model.id,natural:!!model.natural,rotation,...(model.id==='bridge'?{siteVersion:1}:{})}),[w,d]);
      // Half-width in metres equals the cell count at 2m/cell. Includes roofs,
      // foliage and props, not just foundations: no neighboring-cell clipping.
      assert(b.min.x>=-w-.005&&b.max.x<=w+.005&&b.min.z>=-d-.005&&b.max.z<=d+.005,`${state.id} rotation ${rotation}: exceeds reserved site`);
      assert(b.min.y>=-.001,`${state.id}: below ground`);
    }
    if(state===asset)rows.push({id:model.id,asset:model.asset,name:model.name,role:model.natural?"natural deposit":PROJECTS[model.id]?.natural?"legacy preview prop":"placeable",siteCells:model.size,siteMetres:model.size.map(n=>n*2),visualBoundsMetres:visual.getSize(new THREE.Vector3()).toArray().map(round),edgeClearanceMetres:{left:round(visual.min.x+model.size[0]),right:round(model.size[0]-visual.max.x),back:round(visual.min.z+model.size[1]),front:round(model.size[1]-visual.max.z)},constructionStates:states.length-1,review:SITE_SPACE[model.id]?.note||FUNCTIONAL_DESCRIPTIONS[model.id]||FUNCTIONAL_PROGRAM[model.id]?.requirements||'Human-scale prop; the grid reservation includes access space. No enlargement to fill the cell.'});
  }
}
// Fields use saved dimensions and dynamic terrain-following models; the garden
// catalog asset is their menu illustration, not their physical footprint.
for(const size of [[2,2],[4,6],[6,4]])for(let rotation=0;rotation<4;rotation++)for(const crop of ['greens','beans','corn']){
 const p={id:1,key:'field',fieldSize:size,x:50,z:50,rotation};
 p.cultivation={beds:bedLayout(p).map((b,id)=>({...b,id,crop,stage:'harvestable',density:1,growth:1,moisture:.7,cover:0,elapsed:1,stress:0,ripeAt:0}))};
 const model=createCultivationModel(p,{time:0,operations:[],elevationSeed:42});model.rotation.y=rotation*Math.PI/2;
 const bounds=new THREE.Box3().setFromObject(model,true),[w,d]=footprint(p);
 assert.deepEqual([w,d],rotation%2?[...size].reverse():size);
 assert(bounds.min.x>=-w-1e-6&&bounds.max.x<=w+1e-6&&bounds.min.z>=-d-1e-6&&bounds.max.z<=d+1e-6,`${crop} field ${size} rotation ${rotation}: crop geometry exceeds the reserved ground`);
 model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
}
for(const asset of ASSETS.filter(a=>['Buildings','Homes'].includes(a.category)))assert(rows.some(r=>r.id===asset.id),`${asset.id}: building missing from audit`);
const solar=createAsset('solar_farm');let panels=0,supports=0,rails=0;
solar.traverse(o=>{if(o.name==='solar-panel')panels++;if(o.name==='solar-support')supports++;if(o.name==='solar-rail')rails++;});
assert.deepEqual([panels,supports,rails],[6,12,4]);
const timberModel=createAsset('supply-0');
assert.equal(timberModel.userData.plantCount,4);
assert.equal(timberModel.userData.plantSpacing,3,'four trees reserve 3 m spacing inside the 6 m plot');
const timber=new THREE.Box3().setFromObject(timberModel,true);
assert(timber.max.y>5&&timber.max.y<7,'Managed timber must not silently use dwarf orchard trees');
if(process.argv.includes('--report')){
  fs.mkdirSync('.github/building-site-review',{recursive:true});
  fs.writeFileSync('.github/building-site-review/audit.json',JSON.stringify({metresPerCell:2,coverage:'All building-catalog models, first-camp aliases and natural-deposit replacements; associated construction states and all four rotations after material batching.',boundaryToleranceMetres:.005,notes:['Sites reserve clearance around physical objects; no requirement to fill each cell with geometry.','Edge clearance measures the entire visual silhouette, including canopy/roof edges. It is not a navigable-aisle guarantee.','Productive areas, occupancy assumptions and utility capacities remain separate from site size.','Existing models are retained unless replaced. No automatic save deletion.'],models:rows},null,2)+'\n');
}
console.log(`PASS: ${rows.length} catalog/first-camp/deposit sites and construction variants fit their grid sites in all four rotations; art/game/community footprints agree; solar supports and timber scale checked.`);
