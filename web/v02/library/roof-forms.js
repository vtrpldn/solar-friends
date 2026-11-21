import * as THREE from 'three';
import {box,beam} from '../workshop/models.js';

// Each face is authored from an eave edge to a ridge edge. Barrel tiles keep
// their ~40 cm width and ~45 cm length on gables, hips and veranda lean-tos.
const clay=new THREE.MeshStandardMaterial({color:'#b95532',roughness:1,flatShading:true,shadowSide:THREE.DoubleSide});
const paleClay=new THREE.MeshStandardMaterial({color:'#bf633b',roughness:1,flatShading:true,shadowSide:THREE.DoubleSide});
const metal=new THREE.MeshStandardMaterial({color:'#7d8d88',roughness:.9,flatShading:true,shadowSide:THREE.DoubleSide});
const V=p=>new THREE.Vector3(...p);
function face(g,a0,b0,c0,d0){
  const a=V(a0),b=V(b0),c=V(c0),d=V(d0);
  const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(d,a)).normalize();
  if(normal.y<0)normal.negate();
  const surface=new THREE.BufferGeometry();
  surface.setAttribute('position',new THREE.Float32BufferAttribute([...a0,...b0,...d0,...b0,...c0,...d0],3));surface.computeVertexNormals();
  const skin=new THREE.Mesh(surface,clay);skin.name='clay-roof-plane';skin.castShadow=true;skin.receiveShadow=true;g.add(skin);
  // Use the far (narrower) edge of each course so no tile crosses a hip seam.
  const slope=new THREE.Vector3().addVectors(c,d).sub(a).sub(b).multiplyScalar(.5);
  const length=slope.length(),rows=Math.ceil(length/.42),u=b.clone().sub(a).normalize(),v=slope.normalize();
  for(let row=0;row<rows;row++){
    const t0=row/rows,t1=(row+1)/rows,tm=(t0+t1)/2;
    const left=a.clone().lerp(d,t1),right=b.clone().lerp(c,t1);
    const width=left.distanceTo(right),cols=Math.floor(width/.4);
    const center=a.clone().lerp(d,tm).add(b.clone().lerp(c,tm)).multiplyScalar(.5);
    for(let col=0;col<cols;col++){
      const origin=center.clone().addScaledVector(u,(col-(cols-1)/2)*.4).addScaledVector(normal,.035);
      const points=[];
      for(let arc=0;arc<5;arc++){
        const verts=[];
        for(const [k,end] of [[arc,-1],[arc+1,-1],[arc,1],[arc+1,1]]){
          const angle=k*Math.PI/5;
          verts.push(origin.clone().addScaledVector(u,Math.cos(angle)*.19).addScaledVector(normal,Math.sin(angle)*.11).addScaledVector(v,end*(length/rows+.04)/2));
        }
        for(const n of [0,2,1,1,2,3])points.push(...verts[n].toArray());
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.computeVertexNormals();
      // The continuous roof skin casts the shadow; sub-pixel tile shadows
      // produce a jagged fringe on the walls at gameplay zoom.
      const tile=new THREE.Mesh(geometry,(row*3+col)%9===0?paleClay:clay);tile.name='roof-tile';tile.castShadow=false;tile.receiveShadow=true;g.add(tile);
    }
  }
  beam(g,a0,b0,.12,'tileDark');
}
export function hipRoof(g,w,d,eave=2.85,rise=1.3){
  const x=w/2,z=d/2,h=eave+rise;
  const ridgeX=Math.max(0,(w-d)/2),ridgeZ=Math.max(0,(d-w)/2);
  const nw=[-x,eave,-z],ne=[x,eave,-z],sw=[-x,eave,z],se=[x,eave,z];
  const r1=[-ridgeX,h,-ridgeZ],r2=[ridgeX,h,ridgeZ];
  if(w>=d){
    face(g,sw,se,r2,r1);face(g,ne,nw,r1,r2);
    face(g,nw,sw,r1,r1);face(g,se,ne,r2,r2);
  }else{
    face(g,sw,se,r2,r2);face(g,ne,nw,r1,r1);
    face(g,nw,sw,r2,r1);face(g,se,ne,r1,r2);
  }
  for(const [a,b] of [[nw,r1],[ne,w>=d?r2:r1],[sw,w>=d?r1:r2],[se,r2],[r1,r2]])
    if(V(a).distanceTo(V(b))>.01)beam(g,a,b,.14,'tileLight');
}
export function leanRoof(g,w,d,front=2.5,back=2.95){
  face(g,[-w/2,front,d/2],[w/2,front,d/2],[w/2,back,-d/2],[-w/2,back,-d/2]);
  for(const x of [-w/2,w/2])beam(g,[x,front,d/2],[x,back,-d/2],.12,'tileDark');
}
export function gableRoof(g,w,d,eave=2.85,rise=1.3){
  const x=w/2,z=d/2,h=eave+rise;
  face(g,[-x,eave,-z],[-x,eave,z],[0,h,z],[0,h,-z]);
  face(g,[x,eave,z],[x,eave,-z],[0,h,-z],[0,h,z]);
  beam(g,[0,h,-z],[0,h,z],.14,'tileLight');
  for(const end of [-z,z])for(const side of [-1,1])beam(g,[side*x,eave,end],[0,h,end],.12,'tileDark');
}
export function metalRoof(g,w,d,front=2.8,back=3.55){
  const angle=Math.atan2(back-front,d),length=Math.hypot(d,back-front);
  const frame=new THREE.Group();frame.position.y=(front+back)/2;frame.rotation.x=angle;g.add(frame);
  box(frame,w,.09,length,'stone').material=metal;
  for(let x=-w/2+.15;x<w/2;x+=.3)box(frame,.035,.035,length,'stone',x,.065,0).material=metal;
  for(const z of [-length/2,length/2])box(frame,w,.12,.12,'timber',0,-.02,z);
}
