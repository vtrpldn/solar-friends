import * as THREE from 'three';

const displacement=`
 float heightWeight=smoothstep(.6,4.5,position.y);
 vec3 windOrigin=modelMatrix[3].xyz;
 float phase=dot(windOrigin.xz,vec2(.14,.09));
 float gust=.65+.35*sin(windTime*.37+phase*.6);
 float sway=sin(windTime*1.25+phase)*.10+sin(windTime*2.1+phase*1.7)*.025;
 transformed.x+=heightWeight*sway*gust;
 transformed.z+=heightWeight*sin(windTime*1.05+phase+.8)*.055*gust;
`;
export function createFoliageWind(){
 const time={value:0};
 return {
  update(dt){time.value+=Math.max(0,Math.min(dt,.1));},
  apply(root){
   root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const original=mesh.material,material=original.clone();
    // Keep the displacement identical in the visible and sun-shadow passes.
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
    for(const target of [material,depth]){
     target.customProgramCacheKey=()=> 'solar-tree-wind-v1';
     target.onBeforeCompile=shader=>{
      shader.uniforms.windTime=time;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float windTime;')
       .replace('#include <begin_vertex>','#include <begin_vertex>\n'+displacement);
     };
    }
    material.addEventListener('dispose',()=>depth.dispose());
    if(mesh.userData.ownedMaterial)original.dispose();
    mesh.material=material;mesh.customDepthMaterial=depth;
    mesh.userData.ownedMaterial=true;
    // Culling includes the maximum crown displacement; picking keeps authored geometry.
    mesh.geometry.computeBoundingSphere();mesh.geometry.boundingSphere.radius+=.2;
   });
  },
 };
}
