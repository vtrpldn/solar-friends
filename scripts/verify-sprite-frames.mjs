import assert from 'node:assert/strict';
import { locateSpriteFrames } from '../web/sprite-frames.js';
import { cropFrame, cropDuration } from '../web/crop-art.js';
import { residentActivity } from '../web/resident-animation.js';
const width=100,height=100,pixels=new Uint8ClampedArray(width*height*4);
const fill=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixels[(yy*width+xx)*4+3]=255;};
// Top figures cross the nominal row boundary. Wide arms overlap the next
// figure's bounding rectangle while remaining separate connected silhouettes.
fill(10,5,12,47);fill(60,7,12,45);fill(9,60,12,35);fill(58,60,12,35);
fill(20,20,25,4);fill(38,40,25,4);
const layout=locateSpriteFrames(pixels,width,height,2,2,0);
assert.equal(layout.frames.length,4);
assert(layout.frames[0].bottom>50,'A whole pose must survive a crossed cell border');
assert(layout.frames[0].right>layout.frames[1].left,'Probe must exercise overlapping crop boxes');
assert.notEqual(layout.owners[21*width+40],layout.owners[41*width+40],'Adjacent poses must not leak across overlapping crops');
assert.deepEqual(layout.frames.map(f=>f.top),[5,7,60,60]);
for(const f of layout.frames){
 assert((f.bottom-f.top)*layout.scale<=.9+1e-10);
 assert(Math.max(f.pivot-f.left,f.right-f.pivot)*layout.scale<=.44+1e-10);
}
assert.throws(()=>locateSpriteFrames(new Uint8ClampedArray(100*100*4),100,100,2,2),/Expected 4/);
for(const [kind,column,duration] of [['lettuce',0,180],['beans',1,360],['tomatoes',2,300]]){
 assert.equal(cropFrame({kind,growth:0,harvests:0}),column);
 assert.equal(cropFrame({kind,growth:duration*.5,harvests:0}),3+column);
 assert.equal(cropFrame({kind,growth:duration,harvests:0}),6+column);
}
assert.equal(cropDuration({kind:'tomatoes',harvests:1}),180);
assert.equal(cropFrame({kind:'tomatoes',harvests:1,growth:180}),8);
const r={id:0,x:1,y:1,target_x:1,target_y:1};
for(const [task,pose] of [['cook','cook'],['water','water'],['garden','tend'],['compost','tend'],['gather','tend'],['build','work'],['craft','work']])assert.equal(residentActivity({...r,task},0),pose);
for(const [visitingKind,pose] of [['kitchen','cook'],['coop','feed'],['garden','tend'],['greenhouse','tend'],['well','water'],['workshop','work']])assert.equal(residentActivity({...r,task:'visit',visitingKind},0),pose);
assert.equal(residentActivity({...r,task:'cook',target_x:2},0),'walk','Travel still takes priority over work poses');
console.log('PASS: complete-pose extraction across cell borders, isolated masks, shared scale bounds, crop stages and task-specific activities');
