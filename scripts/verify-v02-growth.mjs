import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ASSETS,createAsset} from '../web/v02/library/catalog.js';
import {gallery,validate} from '../web/v02/land/editor.js';
const height=id=>new THREE.Box3().setFromObject(createAsset(id),true).getSize(new THREE.Vector3()).y;
for(const id of ['jequitiba','jucara','embauba','pau_brasil','pequi','barbatimao','umbuzeiro','jurema','mandacaru']){
  assert(height(`${id}-young-0`)<height(`${id}-young-1`));
  assert(height(`${id}-young-1`)<height(id));
}
for(const crop of ['lettuce','beans','tomato','maize','cassava','fodder']){
  assert(height(`${crop}-alternate-0`)<height(`${crop}-alternate-1`));
  assert(height(`${crop}-alternate-1`)<height(`${crop}-alternate-2`));
}
for(const def of ASSETS.filter(a=>a.constructionOf)){
  const parent=ASSETS.find(a=>a.id===def.constructionOf);
  assert.deepEqual(def.footprint,parent.footprint);
}
const all=validate(gallery()),occupied=new Set();
for(const r of all){const def=ASSETS.find(a=>a.id===r.asset);for(let x=r.column;x<r.column+def.footprint[0];x++)for(let z=r.row;z<r.row+def.footprint[1];z++){
  const key=`${x}:${z}`;assert(!occupied.has(key),`${r.id}: overlapping gallery footprint`);occupied.add(key);
}}
console.log(`PASS: nine native growth sequences, six alternate crop sequences, construction footprints and ${all.length} non-overlapping gallery placements.`);
