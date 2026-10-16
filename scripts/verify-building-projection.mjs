import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allBuildingArt, cameraCalibration, drawBuildingArt } from '../web/building-art.js';
import { buildingProjection } from '../web/building-projection.js';
import { placementArt } from '../web/building-footprints.js';
import { meshPoint } from '../web/building-mesh.js';
import { readAlpha } from './lib/png-alpha.mjs';
const review=JSON.parse(readFileSync(new URL('../assets/art-direction/building-projection-review.json',import.meta.url)));
const files=[...new Set(Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]))];
assert.deepEqual(Object.keys(review.files).sort(),files.sort(),'Review every current day/night source');
for(const file of files){
  const bytes=readFileSync(new URL('../web/art/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),review.files[file],`Re-trace and visually review replaced artwork: ${file}`);
}
for(const [file,expected]of Object.entries(review.geometry_files))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),expected,`Renew the visual review after changing ${file}`);
execFileSync(process.execPath,['scripts/rectify-buildings.mjs','--check']);
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
  const measurement=buildingProjection[key];
  if(['grove','orchard'].includes(key)){assert(!measurement && !art.axes,'Organic grove has no architectural axes');continue;}
  assert(measurement,`Missing measured structure: ${key}`);
  const {vertical,shear}=cameraCalibration(art);
  const project=(x,y)=>{const[u,v]=meshPoint(art.mesh,[x,y]);return[u,vertical*v+shear*u];};
  for(const[direction,slope]of [['right',.5],['left',-.5]]){
    assert(measurement[direction].length>=2,'Use separate painted edges for each direction');
    for(const[x,y,X,Y]of measurement[direction]){
      const p=project(x,y),q=project(X,Y);
      const error=Math.abs(q[1]-p[1]-slope*(q[0]-p[0]))*art.width/measurement.size*placementArt(key,art).scale;
      largest=Math.max(largest,error);
      assert(error<=.00001,`${key}: painted ${direction} edge drifts ${error.toFixed(2)} px at zoom 1`);
    }
  }
  const[x,y,X,Y]=measurement.upright;
  assert(Math.abs(project(X,Y)[0]-project(x,y)[0])<1e-7,`Leaning upright: ${key}`);
}
// A corrected sprite may not hide geometry by folding or clipping source pixels.
for(const [key,art]of Object.entries(allBuildingArt)){
 const m=buildingProjection[key];if(!m)continue;
 assert(art.mesh,`Missing local geometry repair: ${key}`);
 const {vertical,shear}=cameraCalibration(art),project=p=>{const [x,y]=meshPoint(art.mesh,p);return [x,vertical*y+shear*x];};
 for(const [peak,left,right]of m.gables||[]){assert(Math.abs(project(peak)[0]-(project(left)[0]+project(right)[0])/2)<1e-5,`${key}: off-center gable`);}
 for(const circle of m.circles||[]){
  const [cx,cy]=circle.center,center=[cx,vertical*cy+shear*cx];
  for(let j=0;j<8;j++){
   if(circle.hidden?.includes(j))continue;
   const angle=j*Math.PI/4,p=project([cx+Math.cos(angle)*circle.radius,cy+Math.sin(angle)*circle.ry]);
   assert(Math.hypot(p[0]-center[0]-Math.cos(angle)*circle.radius,p[1]-center[1]-Math.sin(angle)*circle.radius*.5)<1e-5,`${key}: wrong tank-rim projection`);
  }
 }
 for(const [A,B,C,D]of m.parallelograms||[]){const points=[A,B,C,D].map(project);for(const axis of [0,1])assert(Math.abs(points[0][axis]-points[1][axis]+points[2][axis]-points[3][axis])<1e-5,`${key}: four-post footprint fails to close`);}
 for(const [E,F]of m.spans||[]){const [a,b,c,d]=[E.slice(0,2),E.slice(2),F.slice(0,2),F.slice(2)].map(project);for(const axis of [0,1])assert(Math.abs(b[axis]-a[axis]-d[axis]+c[axis])<1e-5,`${key}: roof ridge/eaves converge`);}
 if(m.structure==='roofed'){assert(m.spans?.length,`${key}: check equal roof spans`);assert(m.gables?.length,`${key}: check centered roof gable`);}
 if(m.structure==='roofed')assert([...m.rightLabels,...m.leftLabels].some(label=>/Roof|eave/.test(label)),`${key}: audit the roof separately from its base`);
 if(m.equalPosts){const heights=m.uprights.map(e=>project(e.slice(2))[1]-project(e.slice(0,2))[1]);assert(Math.max(...heights)-Math.min(...heights)<1e-5,`${key}: unequal post heights`);}
}
assert(buildingProjection.shed.right.some(e=>Math.hypot(e[2]-e[0],e[3]-e[1])>300),'Shed tests must use whole beams, not tiny stone feet');
console.log(`PASS: 25 complete architectural meshes; exact traced roof/frame/ground axes, gable centers and equal shed posts; 2 organic plantings; day/night source fingerprints unchanged. Largest drift ${largest.toFixed(8)} px.`);
