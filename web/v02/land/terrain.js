import * as THREE from 'three';
import { footprint } from './editor.js';
import { ASSETS } from '../library/catalog.js';
const definitions = new Map(ASSETS.map(a=>[a.id,a]));
import { placementPosition } from './layout.js';
export const BIOMES = {
  flat: { name: 'Flat art gallery', colors: ['#a9b983','#a9b983','#a9b983'] },
  'mata-atlantica': { name: 'Mata Atlântica', colors: ['#486d3c','#708c50','#8b7953'] },
  cerrado: { name: 'Cerrado', colors: ['#b3ad68','#b58951','#95613f'] },
  caatinga: { name: 'Caatinga', colors: ['#b6a67b','#c2b18b','#998c76'] },
};
const ease = t => { t = Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
export function baseHeight(id,x,z) {
  if (id === 'flat') return 0;
  const rolling = Math.sin(x*.045+.7)*Math.cos(z*.038-.5);
  const detail = Math.sin(x*.11+z*.07)*Math.cos(z*.09-x*.04);
  // A broad, gently graded central clearing keeps a useful settlement area.
  const clearing = ease((Math.hypot(x,z)-12)/24);
  if (id === 'mata-atlantica') return clearing*(4.5+rolling*4+detail*1.1);
  if (id === 'cerrado') return clearing*(3+rolling*2.5+Math.sin(z*.055)*1.2);
  if (id === 'caatinga') return clearing*(2.5+Math.abs(rolling)*5+detail*.7);
  throw Error(`Unknown biome: ${id}`);
}
export function terrainField(id, records=[]) {
  if (!BIOMES[id]) throw Error('Unknown biome');
  const pads = records.filter(r=>['Homes','Buildings','Props','Supplies'].includes(definitions.get(r.asset)?.category) || r.asset === 'road').map(r=>{
    const f=footprint(r),[x,,z]=placementPosition(r.column,r.row,f);
    return {x,z,w:f[0],d:f[1],y:baseHeight(id,x,z)};
  });
  // Touching structures share one terrace, including connected gardens and roads.
  const visited=new Set();
  for(const first of pads){
    if(visited.has(first))continue;
    const cluster=[first];visited.add(first);
    for(let i=0;i<cluster.length;i++)for(const other of pads){
      const p=cluster[i];
      if(!visited.has(other)&&Math.abs(p.x-other.x)<=p.w+other.w+.01&&Math.abs(p.z-other.z)<=p.d+other.d+.01){visited.add(other);cluster.push(other);}
    }
    const y=cluster.reduce((sum,p)=>sum+p.y,0)/cluster.length;
    for(const p of cluster)p.y=y;
  }
  const height=(x,z)=>{
    let value=baseHeight(id,x,z), nearest=Infinity, pad=null;
    for(const p of pads){const distance=Math.max(Math.abs(x-p.x)-p.w,Math.abs(z-p.z)-p.d);if(distance<nearest){nearest=distance;pad=p;}}
    if(pad && nearest<3) value=THREE.MathUtils.lerp(pad.y,value,ease(nearest/3));
    return value;
  };
  // Sample the same triangles used by the visible mesh, rather than an
  // independent analytic surface, so feet and raycasts agree between vertices.
  const samples=Array.from({length:65},(_,z)=>Array.from({length:65},(_,x)=>height(x*2-64,z*2-64)));
  const sample=(x,z)=>{
    const u=THREE.MathUtils.clamp((x+64)/2,0,64),v=THREE.MathUtils.clamp((z+64)/2,0,64);
    const i=Math.min(63,Math.floor(u)),j=Math.min(63,Math.floor(v)),a=u-i,b=v-j;
    const h00=samples[j][i],h10=samples[j][i+1],h01=samples[j+1][i],h11=samples[j+1][i+1];
    return a+b<=1?h00+(h10-h00)*a+(h01-h00)*b:h11+(h01-h11)*(1-a)+(h10-h11)*(1-b);
  };
  return {sample,samples};
}
export function buildTerrain(id,records=[]) {
  const field=terrainField(id,records),geometry=new THREE.PlaneGeometry(128,128,64,64);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position,colors=[],palette=BIOMES[id].colors.map(c=>new THREE.Color(c));
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),h=field.sample(x,z);
    positions.setY(i,h);
    const patch=(Math.sin(x*.065+z*.04)+Math.cos(z*.085-x*.03)+2)/4;
    const c=palette[0].clone().lerp(palette[1],patch).lerp(palette[2],Math.min(.65,h/14));
    colors.push(c.r,c.g,c.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));mesh.receiveShadow=true;
  const group=new THREE.Group();group.add(mesh);
  // Close the cut edges all the way down to the soil base.
  const rim=[],grid=[];
  for(let n=0;n<64;n++)for(const [a,b] of [ [[-64+n*2,-64],[-62+n*2,-64]],[[64,-64+n*2],[64,-62+n*2]],[[64-n*2,64],[62-n*2,64]],[[-64,64-n*2],[-64,62-n*2]] ]){
    const pa=[a[0],field.sample(...a),a[1]],pb=[b[0],field.sample(...b),b[1]],ba=[a[0],-1,a[1]],bb=[b[0],-1,b[1]];rim.push(...pa,...ba,...pb,...pb,...ba,...bb);
  }
  const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.Float32BufferAttribute(rim,3));skirt.computeVertexNormals();
  group.add(new THREE.Mesh(skirt,new THREE.MeshStandardMaterial({color:'#977451',roughness:1,side:THREE.DoubleSide})));
  for(let a=0;a<=64;a++)for(let b=0;b<64;b++)for(const [x,z,dx,dz] of [[a*2-64,b*2-64,0,2],[b*2-64,a*2-64,2,0]])grid.push(x,field.sample(x,z)+.025,z,x+dx,field.sample(x+dx,z+dz)+.025,z+dz);
  const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(grid,3)),new THREE.LineBasicMaterial({color:'#455840',transparent:true,opacity:.24}));group.add(lines);lines.visible=false;
  group.traverse(o => { if(o.material) o.userData.ownedMaterial=true; });
  return {group,mesh,grid:lines,sample:field.sample};
}

export function biomeLandscape(id) {
  const species = {
    'mata-atlantica':['jequitiba','jucara','embauba','pau_brasil','landscape-0','landscape-1'],
    cerrado:['pequi','barbatimao','bunchgrass','campo','landscape-2','landscape-6'],
    caatinga:['umbuzeiro','jurema','mandacaru','macambira','landscape-3','landscape-4'],
  }[id];
  if(!species)return [];
  const records=[];
  const spacing=id==='mata-atlantica'?4:id==='cerrado'?5:6;
  for(let row=3;row<60;row+=spacing)for(let column=3;column<60;column+=spacing){
    const n=((Math.imul(column+713,374761393)^Math.imul(row+151,668265263))>>>0)%1009;
    if(n%4===0 || Math.hypot(column-31,row-31)<10)continue;
    const asset=species[n%species.length];
    records.push({id:`biome-${column}-${row}`,asset,column:column+n%3,row:row+(n>>2)%3,rotation:(n%4)*90,label:definitions.get(asset).name});
  }
  return records;
}
