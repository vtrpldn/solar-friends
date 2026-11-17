import { COMMUNITY } from '../library/community-defs.js';
// Coordinates are simulation cells (2 metres). Placement reservations remain unchanged.
export const BODY_RADIUS=.16;
const small={ 'rain-barrel':[.48,.425], 'wayfinding-sign':[.18,.18], 'tool-rack':[.65,.24], 'supply-5':[1,.45], 'garden-bench':[.8,.3] };
export function accessGeometry(p,def,size) {
 const [w,d]=size,cx=p.x+(w-1)/2,cz=p.z+(d-1)/2;
 const completed=p.work>=def.work;
 let dimensions=completed&&small[p.key];
 if(dimensions&&(p.rotation||0)%2)dimensions=[dimensions[1],dimensions[0]];
 const open=completed&&['shed','rain-shelter'].includes(def.kind);
 const solids=open?[]:[{x:cx,z:cz,w:dimensions?.[0]||w,d:dimensions?.[1]||d}];
 const angle=(p.rotation||0)*Math.PI/2;
 const depth=(p.rotation||0)%2?w:d;
 const front={x:cx+Math.round(Math.sin(angle))*(depth+1)/2,z:cz+Math.round(Math.cos(angle))*(depth+1)/2};
 if(completed&&COMMUNITY[def.kind]?.sheltered&&!open){
  const rect=solids[0],rotation=p.rotation||0;
  if(rotation%2){rect.w=Math.max(0,w-1);rect.x-=rotation===1?.5:-.5;}
  else {rect.d=Math.max(0,d-1);rect.z-=rotation===0?.5:-.5;}
 }
 const doorway=['home','workshop','kitchen','wash-station','eco_toilet'].includes(def.kind);
 const work=dimensions?[{x:cx+Math.round(Math.sin(angle))*.75,z:cz+Math.round(Math.cos(angle))*.75}]:[front];
 return {solids,entrances:doorway?[front]:[],work,delivery:[front],placement:{x:cx,z:cz,w,d}};
}
export function insideSolid(point,solid,radius=0) {
 return Math.abs(point.x-solid.x)<solid.w/2+radius&&Math.abs(point.z-solid.z)<solid.d/2+radius;
}
export function segmentHitsSolid(from,to,solid,radius=BODY_RADIUS) {
 const penetration=p=>Math.min(solid.w/2+radius-Math.abs(p.x-solid.x),solid.d/2+radius-Math.abs(p.z-solid.z));
 if(penetration(from)>=0&&penetration(to)<penetration(from)-1e-8)return false;
 let enter=0,leave=1;
 for(const [a,b,c,width] of [[from.x,to.x,solid.x,solid.w],[from.z,to.z,solid.z,solid.d]]){
  const delta=b-a,lo=c-width/2-radius,hi=c+width/2+radius;
  if(Math.abs(delta)<1e-9){if(a<lo||a>hi)return false;}
  else {const t1=(lo-a)/delta,t2=(hi-a)/delta;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));}
 }
 return enter<=leave;
}
