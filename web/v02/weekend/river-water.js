import * as THREE from 'three';

// Keep standard lighting and received shadows: foam must darken at night too.
export function createWaterMaterial(rocks,seed){
 const time={value:0};
 const material=new THREE.MeshStandardMaterial({roughness:.68,metalness:0,side:THREE.DoubleSide});
 const stones=Array.from({length:8},(_,i)=>{
  const rock=rocks[i];return rock?new THREE.Vector3(rock.x,rock.z,rock.radius):new THREE.Vector3(1000,1000,0);
 });
 material.customProgramCacheKey=()=> 'solar-flowing-river-v1';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{riverTime:time,riverRocks:{value:stones},riverSeed:{value:(seed%997)*.13},
   riverDeep:{value:new THREE.Color('#397f83')},riverShallow:{value:new THREE.Color('#91b4a0')},
   riverFoam:{value:new THREE.Color('#d0e4d5')}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   varying vec2 waterCoord;
   varying vec2 waterPosition;
  `).replace('#include <begin_vertex>',`#include <begin_vertex>
   waterCoord=uv;waterPosition=position.xz;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   uniform float riverTime,riverSeed;
   uniform vec3 riverRocks[8],riverDeep,riverShallow,riverFoam;
   varying vec2 waterCoord,waterPosition;
   float riverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+riverSeed)*43758.5453);}
   float riverNoise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(riverHash(i),riverHash(i+vec2(1,0)),f.x),mix(riverHash(i+vec2(0,1)),riverHash(i+vec2(1)),f.x),f.y);
   }
  `).replace('#include <color_fragment>',`#include <color_fragment>
   float bank=abs(waterCoord.x);
   vec2 flow=vec2(waterCoord.x*3.5,waterCoord.y-riverTime*.38);
   float eddy=riverNoise(flow*vec2(1.2,.32));
   float shallows=smoothstep(.35,.98,bank+eddy*.12);
   vec3 water=mix(riverDeep,riverShallow,shallows*.85);
   float wave=sin(flow.y*5.0+sin(flow.x*2.5)+eddy*6.0)*.5+.5;
   float streak=smoothstep(.83,.99,wave)*smoothstep(.48,.8,eddy);
   float distant=1.0-smoothstep(.2,1.2,length(fwidth(waterPosition)));
   water=mix(water,riverFoam,streak*.12*distant);
   float foam=0.0;
   for(int i=0;i<8;i++){
    vec2 delta=waterPosition-riverRocks[i].xy;
    float radius=riverRocks[i].z;
    float distanceToRock=length(delta);
    float rim=1.0-smoothstep(.08,.38,abs(distanceToRock-radius));
    // Expanding, broken rings and a short downstream wake follow each boulder.
    float ring=pow(max(0.0,sin((distanceToRock-radius)*11.0-riverTime*2.2)),10.0);
    float reach=(1.0-smoothstep(radius+.25,radius+1.65,distanceToRock))*step(radius,distanceToRock);
    float wake=exp(-abs(delta.x)*3.0)*smoothstep(0.0,.4,delta.y)*(1.0-smoothstep(.4,2.4,delta.y));
    foam=max(foam,rim*.28+ring*reach*.22+wake*streak*.6);
   }
   float edge=smoothstep(.94,1.0,bank)*(.08+eddy*.13);
   diffuseColor.rgb*=mix(water,riverFoam,clamp(foam*distant+edge,0.0,.55));
  `).replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
   vec3 rippleNormal=vec3(sin(waterCoord.y*3.0-riverTime*1.1)*.014,0.0,
      cos(waterCoord.x*9.0+waterCoord.y*2.0-riverTime*.8)*.009);
   normal=normalize(normal+mat3(viewMatrix)*rippleNormal);
  `);
 };
 return {material,time};
}
