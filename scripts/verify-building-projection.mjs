import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allBuildingArt, cameraCalibration, drawBuildingArt } from '../web/building-art.js';
import { buildingProjection } from '../web/building-projection.js';
import { placementArt } from '../web/building-footprints.js';
import { readAlpha } from './lib/png-alpha.mjs';
const review=JSON.parse(readFileSync(new URL('../assets/art-direction/building-projection-review.json',import.meta.url)));
const files=[...new Set(Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]))];
assert.deepEqual(Object.keys(review.files).sort(),files.sort(),'Fingerprint every current day/night source');
for(const file of files){
  const bytes=readFileSync(new URL('../web/art/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),review.files[file],`Re-trace and visually review replaced artwork: ${file}`);
}
let largest=0;
assert.deepEqual(buildingProjection.workshop.rightLabels,['Side foundation','Side eave','Roof ridge'],'Workshop review must include roof geometry as well as the base');
assert.deepEqual(buildingProjection.workshop.leftLabels,['Front foundation','Front lintel','Workbench front'],'Review the usable opening and interior frame direction');
assert.equal(buildingProjection.workshop.right.length,3);assert.equal(buildingProjection.workshop.left.length,3);
const workshopDay=readAlpha(readFileSync(new URL('../web/art/workshop-isometric.png',import.meta.url))),workshopNight=readAlpha(readFileSync(new URL('../web/art/workshop-isometric-night.png',import.meta.url)));
assert.equal(workshopDay.width,workshopNight.width);assert.equal(workshopDay.height,workshopNight.height);
let union=0,intersection=0;
for(let i=0;i<workshopDay.alpha.length;i++){const day=workshopDay.alpha[i]>=32,night=workshopNight.alpha[i]>=32;union+=day||night;intersection+=day&&night;}
assert(intersection/union>.99,'Workshop lighting must preserve its silhouette without a visible day/night position jump');
for(const[key,art]of Object.entries(allBuildingArt)){
  assert.equal(art.mesh,undefined,`${key}: do not restore local texture warps`);
  const measurement=buildingProjection[key];
  if(['grove','orchard'].includes(key)){assert(!measurement && !art.axes,'Organic grove has no architectural axes');continue;}
  assert(measurement,`Missing measured structure: ${key}`);
  const {vertical,shear}=cameraCalibration(art);
  const project=(x,y)=>{const[u,v]=[x,y];return[u,vertical*v+shear*u];};
  for(const[direction,slope]of [['right',.5],['left',-.5]]){
    assert(measurement[direction].length>=2,'Use separate painted edges for each direction');
    for(const[x,y,X,Y]of [...measurement[direction],...(measurement.heldOut?.[direction]||[])]){
      const p=project(x,y),q=project(X,Y);
      const error=Math.abs(q[1]-p[1]-slope*(q[0]-p[0]))*art.width/measurement.size*placementArt(key,art).scale;
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
console.log(`PASS: source fingerprints, no local texture warps, day/night silhouette continuity and diagnostic edge drift up to ${largest.toFixed(2)} px. This does not certify visual quality.`);
