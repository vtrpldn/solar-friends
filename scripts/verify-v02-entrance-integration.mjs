import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAsset} from '../web/v02/library/catalog.js';
import {FUNCTIONAL_LAYOUTS} from '../web/v02/library/functional-layouts.js';
import {createSandbox,PROJECTS,footprint,buildingFront,route,walkSegmentClear,enableFastNavigation} from '../web/v02/weekend/simulation.js';
for(const key of Object.keys(FUNCTIONAL_LAYOUTS))for(let rotation=0;rotation<4;rotation++){
 const p={id:1,key,x:60,z:50,rotation,work:PROJECTS[key].work};
 const model=createAsset(key),door=model.getObjectByName('entrance-door');assert(door,key);
 model.rotation.y=rotation*Math.PI/2;model.updateMatrixWorld(true);
 const measured=door.getWorldPosition(new THREE.Vector3());
 const [w,d]=footprint(p),front=buildingFront(p),a=rotation*Math.PI/2;
 const lateral=(front.x-p.x-(w-1)/2)*Math.cos(a)-(front.z-p.z-(d-1)/2)*Math.sin(a);
 const doorLateral=(measured.x*Math.cos(a)-measured.z*Math.sin(a))/2;
 assert(Math.abs(lateral-doorLateral)<1e-9,`${key} rotation ${rotation}: approach aligns with visible door`);
 const s=createSandbox(42);s.projects=[p];enableFastNavigation(s);
 const from={x:front.x+Math.sin(a)*3,z:front.z+Math.cos(a)*3};
 assert(route(s,from,front),`${key} rotation ${rotation}: approach is reachable`);
 const localWidth=rotation%2?d:w,localDepth=rotation%2?w:d;
 const yardPoint=z=>({x:p.x+(w-1)/2+Math.cos(a)*(localWidth/2-.2)+Math.sin(a)*z,z:p.z+(d-1)/2-Math.sin(a)*(localWidth/2-.2)+Math.cos(a)*z});
 const yardStart=yardPoint(-localDepth/2-1),yardEnd=yardPoint(localDepth/2+1);
 assert(walkSegmentClear(s,yardStart,yardEnd),`${key} rotation ${rotation}: reserved yard stays walkable beside the actual shell`);
 p.work=0;
 assert(!walkSegmentClear(s,yardStart,yardEnd),`${key} rotation ${rotation}: unfinished construction still reserves the full site`);

}
assert.deepEqual(PROJECTS['picnic-table'].size,[2,2],'table reserves seating and access space');
console.log('PASS all catalog home entrances in all rotations align with model doors and remain reachable; picnic access reservation');
