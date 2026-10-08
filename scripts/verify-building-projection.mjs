import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allBuildingArt, cameraCalibration, drawBuildingArt } from '../web/building-art.js';
import { buildingProjection } from '../web/building-projection.js';
import { pergolaMesh, meshPoint, buildingTexture } from '../web/building-mesh.js';
const review=JSON.parse(readFileSync(new URL('../assets/art-direction/building-projection-review.json',import.meta.url)));
const files=[...new Set(Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]))];
assert.deepEqual(Object.keys(review.files).sort(),files.sort(),'Review every current day/night source');
for(const file of files){
  const bytes=readFileSync(new URL('../web/art/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),review.files[file],`Re-trace and visually review replaced artwork: ${file}`);
}
let largest=0;
for(const[key,art]of Object.entries(allBuildingArt)){
  const measurement=buildingProjection[key];
  if(key==='grove'){assert(!measurement && !art.axes,'Organic grove has no architectural axes');continue;}
  assert(measurement,`Missing measured structure: ${key}`);
  const {vertical,shear}=cameraCalibration(art);
  const project=(x,y)=>{const[u,v]=meshPoint(art.mesh,[x,y]);return[u,vertical*v+shear*u];};
  for(const[direction,slope]of [['right',.5],['left',-.5]]){
    assert(measurement[direction].length>=2,'Use separate painted edges for each direction');
    for(const[x,y,X,Y]of measurement[direction]){
      const p=project(x,y),q=project(X,Y);
      const error=Math.abs(q[1]-p[1]-slope*(q[0]-p[0]))*art.width/measurement.size;
      largest=Math.max(largest,error);
      assert(error<=2,`${key}: painted ${direction} edge drifts ${error.toFixed(2)} px at zoom 1`);
    }
  }
  const[x,y,X,Y]=measurement.upright;
  assert(Math.abs(project(X,Y)[0]-project(x,y)[0])<1e-7,`Leaning upright: ${key}`);
}
// Independently verify the corrected prism, including interpolation along each
// constrained beam and post. A fitted pair of slopes alone cannot catch this.
const mesh=pergolaMesh,close=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const structuralEdges=[[4,5],[4,6],[5,7],[6,7],[4,8],[5,9],[6,10],[7,11]];
const triangleEdges=new Set(mesh.triangles.flatMap(t=>t.map((v,i)=>[v,t[(i+1)%3]].sort((a,b)=>a-b).join(','))));
for(const[a,b]of structuralEdges){
  assert(triangleEdges.has([a,b].join(',')),'Structural edges must not bend across triangles');
  for(const fraction of [0,.25,.5,.75,1]){
    const source=mesh.source[a].map((v,i)=>v+(mesh.source[b][i]-v)*fraction);
    const expected=mesh.target[a].map((v,i)=>v+(mesh.target[b][i]-v)*fraction);
    meshPoint(mesh,source).forEach((v,i)=>close(v,expected[i]));
  }
}
for(const[a,b]of structuralEdges.slice(0,4)){
  const p=mesh.target[a],q=mesh.target[b];close(Math.abs((q[1]-p[1])/(q[0]-p[0])),.5);
}
for(let i=4;i<8;i++){close(mesh.target[i][0],mesh.target[i+4][0]);close(mesh.target[i+4][1]-mesh.target[i][1],430);}
const area=(points,t)=>{const[a,b,c]=t.map(i=>points[i]);return((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;};
for(const t of mesh.triangles)assert(area(mesh.source,t)*area(mesh.target,t)>0,'Projection must not fold or invert the artwork');
for(const points of [mesh.source,mesh.target])close(mesh.triangles.reduce((sum,t)=>sum+Math.abs(area(points,t)),0),mesh.size**2);
// Check the actual Canvas transforms, cache and day/night separation without
// needing a browser for the geometry regression.
const transforms=[];
const context={save(){},restore(){},scale(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},clip(){},drawImage(){},transform(...matrix){transforms.push(matrix);}};
const savedDocument=globalThis.document;
try{
  globalThis.document={createElement:()=>({getContext:()=>context})};
  const day={complete:true,naturalWidth:1254,naturalHeight:1254},night={...day};
  const texture=buildingTexture(day,mesh);
  assert.equal(buildingTexture(day,mesh),texture);
  assert.equal(transforms.length,mesh.triangles.length,'Cache the rectification instead of rebuilding it each frame');
  mesh.triangles.forEach((triangle,i)=>{
    const[a,b,c,d,e,f]=transforms[i];
    for(const vertex of triangle){const[x,y]=mesh.source[vertex];close(a*x+c*y+e,mesh.target[vertex][0]);close(b*x+d*y+f,mesh.target[vertex][1]);}
  });
  assert.notEqual(buildingTexture(night,mesh),texture,'Night lighting needs its own texture');
  let drawn;
  drawBuildingArt({...context,globalAlpha:1,translate(){},drawImage(image){drawn=image;}},day,allBuildingArt.square,0,0);
  assert.equal(drawn,texture,'The actual game draw path must use the corrected artwork');
}finally{if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
console.log(`PASS: ${Object.keys(allBuildingArt).length*2} reviewed views; painted-edge drift ≤ ${largest.toFixed(2)} px at zoom 1; exact pergola beam axes, equal upright posts, unfolded texture mesh and cached day/night rendering.`);
