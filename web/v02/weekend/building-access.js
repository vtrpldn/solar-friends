import {bedLayout,bedWorld} from './cultivation.js';
import {FUNCTIONAL_PROGRAM} from '../library/functional-program.js';
import {FUNCTIONAL_LAYOUTS, HOME_CHARACTER} from '../library/functional-layouts.js';
import {METRES_PER_CELL} from '../library/scale.js';
import { COMMUNITY } from '../library/community-defs.js';
// Coordinates are simulation cells (2 metres). Placement reservations remain unchanged.
export const BODY_RADIUS=.16;
const small={ 'rain-barrel':[.48,.425], 'wayfinding-sign':[.18,.18], 'tool-rack':[.65,.24], 'supply-5':[1,.45], 'garden-bench':[.8,.3] };
export function accessGeometry(p,def,size) {
 const [w,d]=size,cx=p.x+(w-1)/2,cz=p.z+(d-1)/2;
 const completed=p.work>=def.work;
 if(completed&&(p.cultivation||p.key==='field')){
  const a=(p.rotation||0)*Math.PI/2,beds=bedLayout(p);
  const solids=beds.map(b=>{const c=bedWorld(p,b,size);return {...c,w:((p.rotation||0)%2?b.d:b.w)/2,d:((p.rotation||0)%2?b.w:b.d)/2};});
  const work=beds.map(b=>{const c=bedWorld(p,b,size);return {x:c.x+Math.cos(a)*.5,z:c.z-Math.sin(a)*.5};});
  return {solids,entrances:[],work,delivery:work,placement:{x:cx,z:cz,w,d}};
 }
 const propDimensions=completed&&small[p.key];
 const layout=FUNCTIONAL_LAYOUTS[p.key];
 const angle=(p.rotation||0)*Math.PI/2;
 const shell=completed&&def.kind==='home'&&FUNCTIONAL_PROGRAM[p.key]?.shell;
 let dimensions=propDimensions||(shell&&shell.map(n=>n/METRES_PER_CELL));
 if(dimensions&&(p.rotation||0)%2)dimensions=[dimensions[1],dimensions[0]];
 const open=completed&&['shed','rain-shelter'].includes(def.kind);
 const offset=shell&&layout?.terrace?-1/METRES_PER_CELL:0;
 const solids=open?[]:[{x:cx+Math.cos(angle)*offset,z:cz-Math.sin(angle)*offset,w:dimensions?.[0]||w,d:dimensions?.[1]||d}];
 const depth=(p.rotation||0)%2?w:d;
 const lateral=layout?(HOME_CHARACTER[p.key].doorX-(layout.terrace?1:0))/METRES_PER_CELL:0;
 const front={x:cx+Math.round(Math.sin(angle))*(depth+1)/2+Math.round(Math.cos(angle))*lateral,z:cz+Math.round(Math.cos(angle))*(depth+1)/2-Math.round(Math.sin(angle))*lateral};
 if(completed&&COMMUNITY[def.kind]?.sheltered&&!open){
  const rect=solids[0],rotation=p.rotation||0;
  if(rotation%2){rect.w=Math.max(0,w-1);rect.x-=rotation===1?.5:-.5;}
  else {rect.d=Math.max(0,d-1);rect.z-=rotation===0?.5:-.5;}
 }
 const doorway=['home','workshop','kitchen','wash-station','eco_toilet'].includes(def.kind);
 const work=propDimensions?[{x:cx+Math.round(Math.sin(angle))*.75,z:cz+Math.round(Math.cos(angle))*.75}]:[front];
 return {solids,entrances:doorway?[front]:[],work,delivery:[front],placement:{x:cx,z:cz,w,d}};
}
export function insideSolid(point,solid,radius=0) {
 return Math.abs(point.x-solid.x)<solid.w/2+radius&&Math.abs(point.z-solid.z)<solid.d/2+radius;
}
export function segmentHitsSolid(from,to,solid,radius=BODY_RADIUS) {
 const penetration=p=>Math.min(solid.w/2+radius-Math.abs(p.x-solid.x),solid.d/2+radius-Math.abs(p.z-solid.z));
 if(penetration(from)>=0&&Math.hypot(to.x-from.x,to.z-from.z)>1e-9)return false;
 let enter=0,leave=1;
 for(const [a,b,c,width] of [[from.x,to.x,solid.x,solid.w],[from.z,to.z,solid.z,solid.d]]){
  const delta=b-a,lo=c-width/2-radius,hi=c+width/2+radius;
  if(Math.abs(delta)<1e-9){if(a<lo||a>hi)return false;}
  else {const t1=(lo-a)/delta,t2=(hi-a)/delta;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));}
 }
 return enter<=leave;
}
