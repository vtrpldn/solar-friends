import * as THREE from 'three';
import {MAP_HALF} from './map-size.js';

// One small map grounds all projects without extra meshes or screen-space passes.
// RGBA stores contact shade, woodland floor, exposed earth and stone respectively.
const SIZE=256;
export function createLandSurface(){
 const data=new Uint8Array(SIZE*SIZE*4);
 const texture=new THREE.DataTexture(data,SIZE,SIZE);
 texture.minFilter=texture.magFilter=THREE.LinearFilter;
 texture.needsUpdate=true;
 let previous='';
 return {texture,update(projects,defs,footprint){
  const signature=projects.map(p=>`${p.id}:${p.key}:${p.x}:${p.z}:${p.rotation||0}:${!!p.felled}`).join('|');
  if(signature===previous)return false;
  previous=signature;data.fill(0);
  for(const p of projects){
   if(p.felled)continue;
   const def=defs[p.key],[w,d]=footprint(p),tree=def.kind==='wild-tree';
   const cx=(p.x+(w-1)/2-32)*2,cz=(p.z+(d-1)/2-32)*2;
   const rx=tree?3.2:w+1.4,rz=tree?3.2:d+1.4;
   for(let z=Math.max(0,Math.floor(cz-rz+MAP_HALF));z<Math.min(SIZE,cz+rz+MAP_HALF);z++)
    for(let x=Math.max(0,Math.floor(cx-rx+MAP_HALF));x<Math.min(SIZE,cx+rx+MAP_HALF);x++){
     const dx=(x+.5-MAP_HALF-cx)/rx,dz=(z+.5-MAP_HALF-cz)/rz;
     const falloff=Math.max(0,1-dx*dx-dz*dz);
     const i=(z*SIZE+x)*4;
     data[i]=Math.max(data[i],Math.round(falloff*falloff*(tree?130:190)));
     const channel=tree?1:p.natural&&p.key==='supply-2'?2:p.natural&&p.key==='supply-3'?3:0;
     if(channel)data[i+channel]=Math.max(data[i+channel],Math.round(falloff*255));
    }
  }
  texture.needsUpdate=true;return true;
 }};
}

export function terrainMaterial(seed,palette,surface){
 const material=new THREE.MeshStandardMaterial({roughness:1});
 material.customProgramCacheKey=()=> 'solar-land-surface-v1';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{
   landSurface:{value:surface.texture},landSeed:{value:(seed%997)*.071},
   landGrass:{value:new THREE.Color(palette[0])},landDry:{value:new THREE.Color(palette[1])},
   landLush:{value:new THREE.Color(palette[2])},landSoil:{value:new THREE.Color('#c48272')},
   landRock:{value:new THREE.Color('#9f9889')},
  });
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute float bankDistance;
   varying vec3 landPosition;
   varying vec3 landNormal;
   varying float landBank;
  `).replace('#include <begin_vertex>',`#include <begin_vertex>
   landPosition=position;landNormal=normal;landBank=bankDistance;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform sampler2D landSurface;
   uniform float landSeed;
   uniform vec3 landGrass,landDry,landLush,landSoil,landRock;
   varying vec3 landPosition,landNormal;
   varying float landBank;
   float landHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+landSeed)*43758.5453);}
   float landNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(landHash(i),landHash(i+vec2(1,0)),f.x),mix(landHash(i+vec2(0,1)),landHash(i+vec2(1)),f.x),f.y);
   }
  `).replace('#include <color_fragment>',`#include <color_fragment>
   vec2 p=landPosition.xz;
   float broad=landNoise(p*.032);
   float mottle=landNoise(p*.084+vec2(broad*2.0));
   vec2 brushPoint = vec2(p.x + p.y*.39, p.y - p.x*.24);
   float strokes = landNoise(brushPoint*vec2(.21,.67)+mottle*.8);
   float paintBands = smoothstep(.28,.60,mottle*.68+strokes*.32);
   float fine=landNoise(p*1.7);
   vec4 habitat=texture2D(landSurface,(p+${MAP_HALF.toFixed(1)})/${(MAP_HALF*2).toFixed(1)});
   float damp=1.0-smoothstep(2.0,13.0,landBank);
   vec3 turf=mix(landGrass,landLush,smoothstep(.22,.75,broad)*.8);
   turf=mix(turf,landDry,smoothstep(.48,.75,mottle)*(.65-damp*.4));
   float shore=(1.0-smoothstep(0.0,4.0,landBank))*(.65+mottle*.35);
   float wornGround = habitat.r * smoothstep(.15,.72,mottle);
   float soil=max(shore,max(habitat.b,max(habitat.g*.32,wornGround)))*(.75+mottle*.25);
   turf=mix(turf,landSoil,soil*.8);
   float slope=1.0-clamp(normalize(landNormal).y,0.0,1.0);
   float rock=max(habitat.a*.8,smoothstep(.06,.24,slope)*(.5+mottle*.5));
   turf=mix(turf,landRock,rock);
   // Fade tiny grain at distant zooms to prevent shimmering.
   float grain=1.0-smoothstep(.15,.8,length(fwidth(p)));
   float crest = smoothstep(-2.0,15.0,landPosition.y);
   turf*=mix(.87,1.16,crest)+.13*(paintBands-.5)+(fine-.5)*.045*grain;
   diffuseColor.rgb*=turf*(1.0-habitat.r*.25-damp*.06);
  `);
 };
 return material;
}
