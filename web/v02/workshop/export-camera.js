import * as THREE from 'three';
export function spriteCamera(model) {
  const make = (ppm) => {
    const camera=new THREE.OrthographicCamera(-256/ppm,256/ppm,384/ppm,-128/ppm,.1,200);
    camera.position.set(12,Math.sqrt(2/3)*12,12);
    camera.lookAt(0,0,0);camera.updateMatrixWorld();
    camera.userData.pixelsPerMetre=ppm;
    return camera;
  };
  const camera=make(48);
  if(!model)return camera;
  const copy=model.clone();copy.rotation.set(0,0,0);copy.updateMatrixWorld(true);
  let fit=1;
  const axis=new THREE.Vector3(0,1,0);
  copy.traverse(o=>{
    if(!o.isMesh)return;
    const points=o.geometry.attributes.position;
    for(let j=0;j<points.count;j++) {
      const world=new THREE.Vector3().fromBufferAttribute(points,j).applyMatrix4(o.matrixWorld);
      for(let turn=0;turn<4;turn++) {
        const p=world.clone().applyAxisAngle(axis,turn*Math.PI/2).project(camera);
        // Keep the ground anchor at (256,384), with a 3% frame margin.
        fit=Math.max(fit,Math.abs(p.x)/.94,(p.y+.5)/1.44,(-.5-p.y)/.44);
      }
    }
  });
  return make(48/fit);
}
