import assert from 'node:assert/strict';
import {compositeDepthLight} from '../web/night-lighting.js';
function probe(transform={a:1,b:0,c:0,d:1,e:0,f:0}){
 const calls=[],stack=[],ctx={globalCompositeOperation:'source-over',getTransform:()=>transform,save(){stack.push(this.globalCompositeOperation);},restore(){this.globalCompositeOperation=stack.pop();},drawImage(...args){assert.equal(this.globalCompositeOperation,'screen');calls.push(args);}};
 return {ctx,calls};
}
const layer={width:385,height:261},rects=[{left:-20,top:-10,right:55,bottom:65},{left:127,top:127,right:260,bottom:260},{left:127,top:127,right:260,bottom:260},{left:370,top:245,right:410,bottom:300}],original=structuredClone(rects);
let pixels=0;
for(const ratio of [1,2,3]){
 const image={width:layer.width*ratio,height:layer.height*ratio},{ctx,calls}=probe({a:ratio,b:0,c:0,d:ratio,e:0,f:0});compositeDepthLight(ctx,image,rects,385,261);
 const covered=new Set();
 for(const [source,x,y,w,h,dx,dy,dw,dh]of calls){assert.equal(source,image);assert.equal(dx*ratio,x);assert.equal(dy*ratio,y);assert.equal(dw*ratio,w);assert.equal(dh*ratio,h);assert(x>=0&&y>=0&&x+w<=image.width&&y+h<=image.height);for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){const key=py*image.width+px;assert(!covered.has(key),'Screen blend must never touch a pixel twice');covered.add(key);}}
 for(const r of rects)for(let y=Math.max(0,Math.ceil(r.top*ratio));y<Math.min(image.height,r.bottom*ratio);y++)for(let x=Math.max(0,Math.ceil(r.left*ratio));x<Math.min(image.width,r.right*ratio);x++){assert(covered.has(y*image.width+x),'Every possible emitted pixel must be blended');pixels++;}
 assert.equal(ctx.globalCompositeOperation,'source-over');
 const empty=probe({a:ratio,b:0,c:0,d:ratio,e:0,f:0});compositeDepthLight(empty.ctx,image,[],385,261);assert.equal(empty.calls.length,0);
}
for(const transform of [{a:1.25,b:0,c:0,d:1.25,e:0,f:0},{a:1,b:.1,c:0,d:1,e:0,f:0},{a:1,b:0,c:0,d:1,e:3,f:0}]){const {ctx,calls}=probe(transform);compositeDepthLight(ctx,layer,rects,385,261);assert.equal(calls.length,1,'Unsupported transforms retain the original complete blend');assert.deepEqual(calls[0],[layer,0,0,385,261,0,0,385,261]);assert.equal(ctx.globalCompositeOperation,'source-over');}
assert.deepEqual(rects,original,'Light bounds must not mutate');console.log({coveredEmissionPixels:pixels,integerRatios:3,fallbackTransforms:3});
