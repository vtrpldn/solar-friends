import * as THREE from "three";
import { elevationAt } from "./elevation.js";

// Roads are centred on cells while terrain vertices lie on their boundaries.
// Split at every terrain edge before draping: moving just the original corners
// leaves triangles cutting through crests, foundation shoulders and edited hills.
export function drapeRoadGeometry(geometry, origin, rotation, seed, pads = []) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = source.attributes.position;
  const uv = source.attributes.uv;
  const vertices = [], texcoords = [];
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const world = p => [origin.x + p[0]*cos + p[2]*sin, origin.z + p[2]*cos - p[0]*sin];
  const coordinate = (p, axis) => {
    const [x,z] = world(p);
    return axis === 0 ? x : axis === 1 ? z : x+z;
  };
  const clip = (polygon, axis, line, side) => {
    const result = [];
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i], b=polygon[(i+1)%polygon.length];
      const da=coordinate(a,axis)-line, db=coordinate(b,axis)-line;
      if(side*da >= 0) result.push(a);
      if((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t=da/(da-db);
        result.push(a.map((value,j)=>value+(b[j]-value)*t));
      }
    }
    return result;
  };
  for(let i=0;i<positions.count;i+=3) {
    let polygons = [Array.from({length:3},(_,j)=>{
      const n=i+j;
      return [positions.getX(n),positions.getY(n),positions.getZ(n),uv?.getX(n)||0,uv?.getY(n)||0];
    })];
    // Terrain triangles have edges x=2n, z=2n and x+z=2n.
    for(let axis=0;axis<3;axis++) {
      const values=polygons.flat().map(p=>coordinate(p,axis));
      const min=Math.min(...values), max=Math.max(...values);
      for(let line=(Math.floor(min/2)+1)*2;line<max-1e-8;line+=2) {
        polygons=polygons.flatMap(polygon=>{
          const distances=polygon.map(p=>coordinate(p,axis)-line);
          if(Math.min(...distances)>=-1e-8 || Math.max(...distances)<=1e-8) return [polygon];
          return [clip(polygon,axis,line,1),clip(polygon,axis,line,-1)];
        });
      }
    }
    for(const polygon of polygons) for(let j=1;j<polygon.length-1;j++) {
      for(const p of [polygon[0],polygon[j],polygon[j+1]]) {
        const [x,z]=world(p);
        vertices.push(p[0],p[1]+elevationAt(x,z,seed,pads)-origin.y,p[2]);
        if(uv) texcoords.push(p[3],p[4]);
      }
    }
  }
  const result=new THREE.BufferGeometry();
  result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  if(uv) result.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  if(source!==geometry)source.dispose();
  return result;
}
