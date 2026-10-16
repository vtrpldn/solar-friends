import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildShedModel, projectPoint, shedCamera, shedDimensions} from './art-models/shed.js';
import {allBuildingArt, cameraCalibration} from '../web/building-art.js';
import {buildingProjection} from '../web/building-projection.js';
import {TILE_HALF_HEIGHT, TILE_HALF_WIDTH} from '../web/projection.js';
import {readAlpha} from './lib/png-alpha.mjs';

const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-8,`${label}: ${actual} != ${expected}`);
const model=buildShedModel(), {x,y,postHeight,roofRise}=shedDimensions;
close(shedCamera.halfHeight/shedCamera.halfWidth,TILE_HALF_HEIGHT/TILE_HALF_WIDTH,'Map camera');
assert.deepEqual(model.feet,[[0,0,0],[x,0,0],[x,y,0],[0,y,0]]);
for(const foot of model.feet){
 const bottom=projectPoint(foot),top=projectPoint([foot[0],foot[1],postHeight]);
 close(top[0],bottom[0],'Upright post');close(bottom[1]-top[1],postHeight*shedCamera.halfWidth,'Equal post height');
}
for(const key of ['ridge','nearEave','farEave']){
 const [a,b]=model.features[key].map(p=>projectPoint(p));
 close((b[1]-a[1])/(b[0]-a[0]),.5,`${key} axis`);
 close(b[0]-a[0],(x+2*shedDimensions.overhang)*shedCamera.halfWidth,`${key} span`);
}
for(const [a,b] of model.features.rafters)close(Math.abs((b[2]-a[2])/(b[1]-a[1])),roofRise/(y/2),'Rafters follow roof pitch');
const [a,b]=model.features.frontBeam.map(p=>projectPoint(p));
close(projectPoint(model.features.frontPeak)[0],(a[0]+b[0])/2,'Centered front gable');
for(const face of model.faces){
 assert(face.points.flat().every(Number.isFinite));
 assert(!face.points.every(p=>p[2]===0),'No foundation platform');
 for(const point of face.points){const [u,v]=projectPoint(point);assert(u>0&&u<shedCamera.width&&v>0&&v<shedCamera.height,'No clipped model geometry');}
}
const calibration=cameraCalibration(allBuildingArt.shed);
close(calibration.vertical,1,'No runtime vertical stretch');close(calibration.shear,0,'No runtime shear');
assert.equal(allBuildingArt.shed.mesh,undefined);
const traced=buildingProjection.shed;
for(const [index,key] of [[1,'ridge'],[2,'nearEave'],[3,'farEave']]){
 const points=model.features[key].flatMap(p=>projectPoint(p));
 points.forEach((value,i)=>close(traced.right[index][i],value,`${key} inspector landmark`));
}
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const review=JSON.parse(read('assets/art-direction/isometric/shed-model-review.json'));
for(const [path,expected] of Object.entries(review.fingerprints))assert.equal(createHash('sha256').update(read(path)).digest('hex'),expected,`Review outdated: ${path}`);
const day=readAlpha(read('web/art/'+allBuildingArt.shed.file)),night=readAlpha(read('web/art/'+allBuildingArt.shed.nightFile));
assert.equal(day.width,shedCamera.width);assert.equal(day.height,shedCamera.height);
assert.equal(night.width,day.width);assert.equal(night.height,day.height);
assert.deepEqual(day.alpha,night.alpha,'Day/night geometry is identical');
console.log('PASS: shed camera, structural pitch, source bounds, unchanged day/night silhouette and reviewed source hashes. Style remains a visual judgment.');
