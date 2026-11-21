import * as THREE from 'three';
import {MAP_HALF} from './map-size.js';
import {CLOUD_GLSL, useVillageClouds} from './painted-village.js';

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

// `wear` (see ground-wear.js) switches on the lived-in ground: colour follows the
// lie of the land, and yards, footpaths and wildflowers replace the noise patches.
export function terrainMaterial(seed,palette,surface,wear=null){
 const material=new THREE.MeshStandardMaterial({roughness:1});
 material.customProgramCacheKey=()=> wear?'solar-land-surface-lived':'solar-land-surface-v1';
 material.onBeforeCompile=shader=>{
  if(wear){shader.uniforms.landWear={value:wear};useVillageClouds(shader);}
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
   uniform sampler2D landWear;
   uniform float landSeed;
   ${wear?CLOUD_GLSL:''}
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
   turf*=mix(.87,1.16,crest)+(fine-.5)*.045*grain;
   ${wear?`
   // Hollows stay deep green and rises dry out, so colour describes the relief.
   float rise=smoothstep(-1.0,10.0,landPosition.y)+(broad-.5)*.22;
   vec3 lived=mix(landLush*.9,landGrass,smoothstep(.05,.5,rise));
   lived=mix(lived,landDry,smoothstep(.5,1.0,rise+(mottle-.5)*.3)*(.7-damp*.45));
   // Long directional dabs, like a loaded brush dragged across the slope.
   vec2 stroke=vec2(p.x*.82+p.y*.57,p.y*.82-p.x*.57);
   float dab=landNoise(stroke*vec2(2.3,.55)+broad*4.0);
   lived*=1.0+(smoothstep(.35,.65,dab)-.5)*.11*grain;
   lived=mix(lived,landSoil,max(shore,max(habitat.b,habitat.g*.32))*(.75+mottle*.25)*.8);
   lived=mix(lived,landRock,rock);
   vec2 wobble=(vec2(landNoise(p*.45),landNoise(p*.45+31.7))-.5)*2.4;
   vec4 worn=texture2D(landWear,(p+wobble+${MAP_HALF.toFixed(1)})/${(MAP_HALF*2).toFixed(1)});
   float tread=worn.r+(fine-.5)*.16;
   float yard=smoothstep(.36,.5,worn.g+(mottle-.5)*.45);
   float path=smoothstep(.22,.5,tread);
   // Wildflowers gather in drifts and never grow where people walk.
   vec2 bloomCell=floor(p*.75),bloomAt=fract(p*.75)-.5;
   float bloomSeed=landHash(bloomCell);
   bloomAt-=(vec2(landHash(bloomCell+3.1),landHash(bloomCell+5.7))-.5)*.55;
   float drift=smoothstep(.6,.82,landNoise(p*.045+7.3));
   float bloom=(1.0-smoothstep(.13,.24,length(bloomAt)))*step(1.0-drift*.42,bloomSeed)
     *(1.0-smoothstep(.02,.2,worn.r+worn.g))*(1.0-rock)*(1.0-smoothstep(.2,.9,length(fwidth(p))));
   float tint=landHash(bloomCell+9.2);
   lived=mix(lived,tint<.3?vec3(.85,.78,.55):tint<.72?vec3(.88,.5,.03):vec3(.58,.08,.24),bloom*.9);
   // Grass yellows beside a path before it gives way to packed earth.
   lived=mix(lived,landDry*.97,smoothstep(.05,.26,tread)*.55*(1.0-yard));
   // Linear-light values: red earth underfoot, paler where yards are swept daily.
   vec3 trodden=mix(vec3(.40,.13,.06),vec3(.50,.19,.09),mottle);
   vec3 swept=mix(vec3(.62,.37,.2),vec3(.72,.47,.27),mottle);
   lived=mix(lived,trodden*(.94+fine*.12),path*.92*(1.0-yard));
   lived=mix(lived,swept*(.95+fine*.1),yard);
   lived*=mix(.9,1.1,crest);
   diffuseColor.rgb*=lived*(1.0-habitat.r*.1*(1.0-yard)-damp*.06);
   `:'diffuseColor.rgb*=turf*(1.0-habitat.r*.25-damp*.06);'}
  `);
  if(wear)shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
   reflectedLight.directDiffuse*=cloudLight(landPosition.xz);`);
 };
 return material;
}
