import * as THREE from 'three';
import {box,cylinder,beam} from '../workshop/models.js';
// Construction keeps the completed asset's cell allocation and material scale.
export function construction(def, stage) {
  const g=new THREE.Group(),[w,d]=def.footprint.map(n=>n*2-.5);
  if (def.id === 'road') {
    for(const x of [-.88,.88]) for(const z of [-.88,.88]) {
      box(g,.055,.38,.055,'timber',x,.19,z);
      box(g,.09,.08,.07,'plaster',x,.33,z);
    }
    for(const z of [-.88,.88]) box(g,1.76,.025,.025,'plaster',0,.23,z);
    if(stage===1) {
      // Scattered aggregate, not a finished road surface.
      for(let i=0;i<9;i++) {
        const stone=cylinder(g,.12,.2,.12,'stone',Math.sin(i*2.4)*.58,.06,Math.cos(i*2.4)*.58,5);
        stone.rotation.y=i;
      }
      box(g,1.3,.035,.3,'earth',0,.025,0);
    }
    return g;
  }
  const tank=['biodigester','well','eco_toilet','hydro'].includes(def.id);
  const bed=['garden','grove','orchard','wetland','banana_treatment','compost','square'].includes(def.id);
  const solar=def.id==='solar_farm';
  if(def.id==='goat_pasture'||def.id==='goat-pasture-empty'){
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(g,.12,stage?.85:.35,.12,'timber',x,stage?.425:.175,z);
    if(stage===1)for(const y of [.35,.65]){
      for(const z of [-d/2,d/2])box(g,w,.08,.08,'timberLight',0,y,z);
      for(const x of [-w/2,w/2])box(g,.08,.08,d,'timberLight',x,y,0);
    }
  }else if(def.id==='streetlight') {
    cylinder(g,.22,.28,.18,'stone',0,.09,0,8);
    if(stage===1){cylinder(g,.07,.1,2.9,'timber',0,1.45,0,8);beam(g,[0,2.85,0],[.55,2.85,0],.08,'timber');}
  }else if(def.id==='hydro') {
    for(const x of [-1.15,1.15])for(const z of [-.9,.9])box(g,.32,stage?.9:.3,.32,'stone',x,stage?.45:.15,z);
    if(stage===1){
      for(const z of [-.9,.9])box(g,2.6,.13,.18,'timber',0,.8,z);
      const rim=cylinder(g,.8,.8,.1,'timberLight',0,1.15,1.2,12);rim.rotation.x=Math.PI/2;
      box(g,2.7,.1,.1,'stone',0,1.15,1.2);
    }
  }else if(def.id==='apiary') {
    for(const x of [-.45,.45]){
      box(g,.12,stage?1.1:.3,.12,'timber',x,stage?.55:.15,0);
      if(stage===1)box(g,.5,.4,.4,'timberLight',x,1.2,0);
    }
  }else if(tank && def.id!=='eco_toilet') {
    const r=Math.min(w,d)/2-.25;
    // An open masonry ring, never an opaque foundation platform.
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
      beam(g,[Math.sin(a)*r,.18,Math.cos(a)*r],[Math.sin(b)*r,.18,Math.cos(b)*r],.2,'stone');
      if(stage===1){
        if(def.id==='biodigester') {
          let previous=[Math.sin(a)*r,.2,Math.cos(a)*r];
          for(let n=1;n<=4;n++){
            const t=n*Math.PI/8,point=[Math.sin(a)*r*Math.cos(t),.2+1.45*Math.sin(t),Math.cos(a)*r*Math.cos(t)];
            beam(g,previous,point,.07,'timber');previous=point;
          }
        }else beam(g,[Math.sin(a)*r,.2,Math.cos(a)*r],[Math.sin(a)*r,2.1,Math.cos(a)*r],.09,'timber');
      }
    }
  }else if(bed){
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(g,.09,.55,.09,'timber',x,.275,z);
    for(const z of [-d/2,d/2])box(g,w,.08,.08,'timberLight',0,.18,z);
    if(stage===1)for(let z=-d/2+.35;z<d/2;z+=.55)box(g,w-.3,.08,.22,'earth',0,.04,z);
  }else{
    const h=def.id==='shed'?2.35:def.id==='streetlight'?2.8:2.6;
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2]){
      box(g,.3,.2,.3,'stone',x,.1,z);
      if(stage===1)box(g,.13,solar?1.1:h,.13,'timber',x,(solar?1.1:h)/2,z);
    }
    for(const z of [-d/2,d/2])box(g,w,.12,.12,'timber',0,.2,z);
    if(stage===1){
      if(solar){for(const z of [-d/2,0,d/2])box(g,w,.1,.1,'stone',0,1.1,z);}
      else for(const z of [-d/2,0,d/2]){
        beam(g,[-w/2,h,z],[0,h+.8,z],.12,'timberLight');
        beam(g,[0,h+.8,z],[w/2,h,z],.12,'timberLight');
      }
      if(!solar){
        box(g,.12,.12,d,'timber',0,h+.8,0);
        for(const x of [-w/2,w/2])box(g,.12,.12,d,'timber',x,h,0);
        if(def.category==='Homes'||['warehouse','kitchen','workshop','eco_toilet'].includes(def.id)) {
          const material=def.id.startsWith('adobe')?'earth':'plaster';
          box(g,w,.8,.16,material,0,.4,-d/2);
          box(g,.16,1.15,d,material,-w/2,.575,0);
        }
      }
    }
  }
  // Small on-site material stack, kept inside the footprint.
  for(let i=0;i<3;i++)box(g,Math.min(1,w*.45),.11,.18,'timberLight',0,.07+i*.11,d/2-.4);
  if(stage===0)for(const x of [-w/2,w/2])box(g,.06,.65,.06,'timber',x,.325,0);
  return g;
}
