import assert from 'node:assert/strict';
import {allBuildingArt,cameraCalibration} from '../web/building-art.js';
import {placementArt,footprintCorners} from '../web/building-footprints.js';
import {BUILDING_DRAW_MARGIN,buildingInViewport} from '../web/world-visibility.js';
import {lampLightOffset} from '../web/night-lighting.js';
let corners=0,decisions=0;
for(const [key,art] of Object.entries(allBuildingArt)){
 const p=placementArt(key,art),{vertical,shear}=cameraCalibration(art),w=art.width*p.scale,h=w*(art.aspect||1);
 for(const x of [-w/2,w/2])for(const y of [-h*art.anchor,h*(1-art.anchor)]){
  assert(Math.abs(p.x+x)<BUILDING_DRAW_MARGIN,key+' horizontal sprite boundary');
  assert(Math.abs(p.y+shear*x+vertical*y)<BUILDING_DRAW_MARGIN,key+' vertical sprite boundary');corners++;
 }
 const kind=key.startsWith('home-')||key.startsWith('adobe-')?'home':key;
 for(const [x,y] of footprintCorners(kind,0,0)){
  assert(Math.abs((x-y)*34)+3<BUILDING_DRAW_MARGIN);
  assert(Math.abs((x+y)*17)+65+3<BUILDING_DRAW_MARGIN);corners++;
 }
}
const bulb=lampLightOffset(allBuildingArt.streetlight);
assert(Math.abs(bulb.x)+28<BUILDING_DRAW_MARGIN);assert(Math.abs(bulb.y)+28<BUILDING_DRAW_MARGIN);
for(const scale of [.18,.5,1,2,4])for(const width of [900,1440,2560])for(const height of [700,1050]){
 const m=BUILDING_DRAW_MARGIN*scale+8;
 for(const x of [-m-1,-m,0,width,width+m,width+m+1])for(const y of [-m-1,-m,0,height,height+m,height+m+1]){
  assert.equal(buildingInViewport({x,y},scale,width,height),x>=-m&&x<=width+m&&y>=-m&&y<=height+m);decisions++;
 }
}
console.log({corners,decisions,margin:BUILDING_DRAW_MARGIN});
