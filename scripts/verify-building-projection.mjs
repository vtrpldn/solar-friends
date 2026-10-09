import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allBuildingArt, cameraCalibration, drawBuildingArt } from '../web/building-art.js';
import { buildingProjection } from '../web/building-projection.js';
import { meshPoint } from '../web/building-mesh.js';
const review=JSON.parse(readFileSync(new URL('../assets/art-direction/building-projection-review.json',import.meta.url)));
const files=[...new Set(Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]))];
assert.deepEqual(Object.keys(review.files).sort(),files.sort(),'Review every current day/night source');
for(const file of files){
  const bytes=readFileSync(new URL('../web/art/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),review.files[file],`Re-trace and visually review replaced artwork: ${file}`);
}
let largest=0;
for(const[key,art]of Object.entries(allBuildingArt)){
  const measurement=buildingProjection[key];
  if(key==='grove'){assert(!measurement && !art.axes,'Organic grove has no architectural axes');continue;}
  assert(measurement,`Missing measured structure: ${key}`);
  const {vertical,shear}=cameraCalibration(art);
  const project=(x,y)=>{const[u,v]=meshPoint(art.mesh,[x,y]);return[u,vertical*v+shear*u];};
  for(const[direction,slope]of [['right',.5],['left',-.5]]){
    assert(measurement[direction].length>=2,'Use separate painted edges for each direction');
    for(const[x,y,X,Y]of measurement[direction]){
      const p=project(x,y),q=project(X,Y);
      const error=Math.abs(q[1]-p[1]-slope*(q[0]-p[0]))*art.width/measurement.size;
      largest=Math.max(largest,error);
      assert(error<=2,`${key}: painted ${direction} edge drifts ${error.toFixed(2)} px at zoom 1`);
    }
  }
  const[x,y,X,Y]=measurement.upright;
  assert(Math.abs(project(X,Y)[0]-project(x,y)[0])<1e-7,`Leaning upright: ${key}`);
}
// The open square is drawn directly, without the removed post-and-beam warp.
assert.equal(allBuildingArt.square.mesh,undefined);
for(const image of [{complete:true,naturalWidth:1280,naturalHeight:1280},{complete:true,naturalWidth:1280,naturalHeight:1280}]){
  let drawn;
  drawBuildingArt({globalAlpha:1,save(){},restore(){},translate(){},transform(){},drawImage(source){drawn=source;}},image,allBuildingArt.square,0,0);
  assert.equal(drawn,image,'Open square retains its painted bench and ground geometry');
}
console.log(`PASS: ${Object.keys(allBuildingArt).length*2} reviewed views; painted-edge drift ≤ ${largest.toFixed(2)} px at zoom 1; open square seating and direct day/night rendering.`);
