import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAsset,compactModel,disposeModel} from '../web/v02/library/catalog.js';
import {drapeRoadGeometry} from '../web/v02/weekend/road-surface.js';
import {elevationAt} from '../web/v02/weekend/elevation.js';

const edited=[{terraform:true,vertices:{'60,60':4,'62,60':7,'60,62':2,'62,62':8,'58,60':6,'60,58':7,'58,58':3}}];
const cases=[
  {x:60,z:60,seed:42,pads:edited},
  {x:60,z:60,seed:42,pads:[...edited,{left:62,right:68,top:58,bottom:64,height:5}]},
  ...[42,97,1307].flatMap(seed=>[[-70,50],[60,60],[90,-60],[0,0]].map(([x,z])=>({x,z,seed,pads:[]}))),
];
const ray=new THREE.Raycaster();
let samples=0;
for(const {x,z,seed,pads} of cases) for(let turn=0;turn<4;turn++) {
  const root=compactModel(createAsset('road'));
  root.position.set(x,elevationAt(x,z,seed,pads),z);
  root.rotation.y=turn*Math.PI/2;
  root.traverse(o=>{
    if(!o.isMesh)return;
    const old=o.geometry;
    o.geometry=drapeRoadGeometry(old,root.position,root.rotation.y,seed,pads);
    old.dispose();
  });
  root.updateMatrixWorld(true);
  // Interior samples, not just vertices: old corner-only draping fails here.
  for(let ix=0;ix<13;ix++) for(let iz=0;iz<13;iz++) {
    const wx=x-.99+ix*1.98/12,wz=z-.99+iz*1.98/12;
    const ground=elevationAt(wx,wz,seed,pads);
    ray.set(new THREE.Vector3(wx,ground+2,wz),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(root,true)[0];
    assert(hit,'road surface must cover the whole cell');
    assert(hit.point.y>=ground+.0249,`road clips at ${wx},${wz}, rotation ${turn}: ${hit.point.y-ground}`);
    assert(hit.point.y<=ground+.09,'road must follow the surface rather than float over hills');
    samples++;
  }
  disposeModel(root);
}
// Construction props use the same draping path and must remain finite.
for(const id of ['road-construction-0','road-construction-1']) {
  const root=compactModel(createAsset(id));
  root.traverse(o=>{
    if(!o.isMesh)return;
    const geometry=drapeRoadGeometry(o.geometry,new THREE.Vector3(60,elevationAt(60,60,42,edited),60),0,42,edited);
    assert([...geometry.attributes.position.array].every(Number.isFinite));
    geometry.dispose();
  });
  disposeModel(root);
}
console.log(`PASS: ${samples} road-surface raycasts across hills, edited peaks, graded shoulders and four rotations; construction geometry remains finite.`);
