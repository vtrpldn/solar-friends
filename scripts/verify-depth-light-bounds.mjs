import assert from 'node:assert/strict';
import {createDepthLightPass} from '../web/night-lighting.js';
import {worldTreeBounds,paintWorldTree} from '../web/world-renderer.js';
import {regionalImages,regionalNatureArt} from '../web/regional-art.js';
const ctx={save(){},restore(){},globalCompositeOperation:'source-over'},area={left:10,top:10,right:20,bottom:20};let masks=0,emits=0;
const pass=createDepthLightPass(ctx),mask=()=>masks++;
pass.paint(mask,null,null);assert.equal(masks,0,'Nothing can occlude an empty light layer');
pass.paint(mask,()=>{emits++;return {...area};},null);assert.equal(masks,0);
pass.paint(mask,null,{left:50,top:50,right:60,bottom:60});assert.equal(masks,0,'Disjoint mask must be skipped');
pass.paint(mask,null,{left:20,top:20,right:30,bottom:30});assert.equal(masks,1,'Touching bounds remain conservative');
pass.paint(mask,null,null);assert.equal(masks,2,'Unknown mask bounds retain original painting');
pass.paint(mask,()=>null,{left:50,top:50,right:60,bottom:60});assert.equal(masks,2);
pass.paint(mask,()=>{emits++;},{left:50,top:50,right:60,bottom:60});
pass.paint(mask,null,{left:500,top:500,right:600,bottom:600});assert.equal(masks,3,'Unknown emission bounds disable rejection');assert.equal(emits,2);
const next=createDepthLightPass(ctx);next.paint(mask,null,null);assert.equal(masks,3,'A new frame must not inherit old light regions');
const mutable={...area},copy=createDepthLightPass(ctx);copy.paint(mask,()=>mutable,null);mutable.left=100;mutable.right=110;copy.paint(mask,null,area);assert.equal(masks,4,'Retain a copy of the emitted area');
const image={complete:true,naturalWidth:1280,naturalHeight:1280,width:1280,height:1280};for(const art of regionalNatureArt)regionalImages[art.file]=image;
let traced=0;
for(let species=0;species<20;species++)for(const size of [.5,1,2])for(const scale of [.18,.75,2]){
 const tree={x:3,y:4,species,size},project=()=>({x:500,y:500}),bounds=worldTreeBounds(tree,{project,scale}),stack=[];let matrix={x:0,y:0,sx:1,sy:1};
 const rect=(x,y,w,h)=>{for(const [px,py]of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]){const xx=matrix.x+px*matrix.sx,yy=matrix.y+py*matrix.sy;assert(xx>=bounds.left&&xx<=bounds.right&&yy>=bounds.top&&yy<=bounds.bottom,JSON.stringify({species,size,scale,bounds,xx,yy}));traced++;}};
 const c={filter:'none',save(){stack.push({...matrix});},restore(){matrix=stack.pop();},translate(x,y){matrix.x+=x*matrix.sx;matrix.y+=y*matrix.sy;},scale(x,y){matrix.sx*=x;matrix.sy*=y;},createRadialGradient(){return {addColorStop(){}};},fillRect:rect,drawImage(...args){rect(...args.slice(-4));}};
 paintWorldTree(c,tree,{project,scale,width:2000,height:2000,forest:image,details:image,night:1});
}
assert.equal(worldTreeBounds({species:999,x:0,y:0},{project:()=>({x:0,y:0}),scale:1}),null);
console.log({traceCorners:traced,conservativeMaskChecks:8,species:20});
