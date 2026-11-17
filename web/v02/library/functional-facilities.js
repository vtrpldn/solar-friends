import * as THREE from 'three';
import {box,cylinder,beam,windowPane,ball} from '../workshop/models.js';
import {hipRoof,leanRoof,metalRoof} from './roof-forms.js';
import {functionalRoof} from './functional-homes.js';
import {FUNCTIONAL_PROGRAM} from './functional-program.js';

const group=()=>new THREE.Group();
const greenhouseGlass=new THREE.MeshStandardMaterial({color:'#c1d8c7',roughness:.4,transparent:true,opacity:.19,depthWrite:false,side:THREE.DoubleSide});
const solarBlue=new THREE.MeshStandardMaterial({color:'#315c80',roughness:.65,flatShading:true});
function glazing(mesh){mesh.material=greenhouseGlass;mesh.castShadow=false;return mesh;}
function placed(g,o,x,z,y=0){o.position.set(x,y,z);g.add(o);return o;}
function bench(g,x,z,w=1.8,rotation=0){
  const b=group();placed(g,b,x,z);b.rotation.y=rotation;
  box(b,w,.1,.45,'timberLight',0,.5,0);
  for(const dx of [-w*.36,w*.36])box(b,.12,.45,.36,'timber',dx,.225,0);
}
function table(g,x,z,w=2,d=.85,h=.9){
  box(g,w,.1,d,'timberLight',x,h,z);
  for(const dx of [-w*.4,w*.4])for(const dz of [-d*.35,d*.35])box(g,.1,h,.1,'timber',x+dx,h/2,z+dz);
}
function rack(g,x,z,w=2,books=false){
  for(const dx of [-w/2,w/2])for(const dz of [-.3,.3])box(g,.08,2,.08,'timber',x+dx,1,z+dz);
  for(const y of [.35,1,1.65]){
    box(g,w,.08,.65,'timberLight',x,y,z);
    if(books)for(let n=0;n<Math.floor(w/.16)-1;n++)box(g,.1,.22+(n%3)*.04,.25,['tile','teal','earth','plaster'][n%4],x-w/2+.18+n*.16,y+.17,z);
    else for(const dx of [-w*.3,0,w*.3])box(g,.35,.25,.4,'earth',x+dx,y+.17,z);
  }
}
function shelter(g,w,d,closed=false,style='gable'){
  box(g,w,.12,d,'stone',0,.06,0);
  const postHeight=z=>style==='workshop'||style==='outdoor-classroom'?3.175-z/d*.75:style==='shed'?2.875-z/d*.45:style==='kitchen'&&z>0?2.45:2.85;
  for(const x of [-w/2+.12,w/2-.12])for(const z of [-d/2+.12,0,d/2-.12]){const h=postHeight(z);box(g,.18,h,.18,'timber',x,h/2,z);}
  for(const z of [-d/2+.12,0,d/2-.12]){
    const h=postHeight(z)-.1;beam(g,[-w/2,h,z],[w/2,h,z],.18,'timber');
    for(const side of [-1,1])beam(g,[side*(w/2-.15),h-.55,z],[side*(w/2-.7),h,z],.12,'timberLight');
  }
  if(closed){
    box(g,w,2.7,.2,'plaster',0,1.47,-d/2+.1);
    for(const x of [-w/2+.1,w/2-.1]){
      if(style==='kitchen'){box(g,.2,2.7,d*.56,'plaster',x,1.47,-d*.22);box(g,.2,1,d*.44,'plaster',x,.62,d*.28);}
      else box(g,.2,2.7,d,'plaster',x,1.47,0);
    }
    // Open receiving/working frontage keeps furniture visible and leaves a
    // generous entrance, without shrinking the rest of the enclosure.
    const frontHeight=['warehouse','workshop'].includes(style)?2.7:1;
    for(const side of [-1,1])box(g,(w-2.4)/2,frontHeight,.2,'plaster',side*(w+2.4)/4,frontHeight/2+.12,d/2-.1);
  }
  const r=group();r.name='functional-roof';g.add(r);
  if(style==='workshop'){
    metalRoof(r,w+.6,d+.6,2.8,3.55);
    for(const x of [-w/2,w/2])beam(g,[x,2.8,d/2],[x,3.55,-d/2],.16,'timber');
    for(let y=2.95;y<3.5;y+=.16)box(g,w,.07,.08,'timberLight',0,y,-d/2);
  }else if(style==='warehouse'){
    r.rotation.y=Math.PI/2;functionalRoof(r,d+.5,w+.5,2.85,1.1);
  }else if(style==='kitchen'){
    const main=group();placed(r,main,0,-1.3);hipRoof(main,w+.6,5.6,2.85,1.3);
    const dining=group();placed(r,dining,0,2.5);leanRoof(dining,w+.6,3.2,2.5,3.05);
  }else if(['reading-room','community-hall'].includes(style))hipRoof(r,w+.8,d+.8,2.85,style==='community-hall'?1.7:1.2);
  else if(style==='outdoor-classroom')leanRoof(r,w+.6,d+.6,2.8,3.55);
  else if(style==='shed')leanRoof(r,w+.5,d+.5,2.65,3.1);
  else functionalRoof(r,w+.5,d+.5,2.85,Math.min(1.45,w*.18));
}
function bed(g,x,z,w,d,plant,kind='lettuce'){
  const b=group();b.name='growing-bed';b.userData.plantedArea=w*d;placed(g,b,x,z);
  box(b,w,.12,d,'earth',0,.06,0);
  for(const dx of [-w/2-.04,w/2+.04])box(b,.08,.22,d+.16,'timberLight',dx,.11,0);
  for(const dz of [-d/2-.04,d/2+.04])box(b,w,.22,.08,'timberLight',0,.11,dz);
  const rows=Math.floor(d/.65);
  for(const dx of [-w*.27,w*.27])for(let n=0;n<rows;n++)placed(b,plant(kind),dx,-d/2+.4+n*.65,.12);
}
function fence(g,w,d,height=1.25){
  const nx=Math.ceil(w/2),nz=Math.ceil(d/2);
  for(const z of [-d/2,d/2])for(let n=0;n<=nx;n++){
    const x=-w/2+n*w/nx;if(z>0&&Math.abs(x)<.7)continue;
    box(g,.12,height,.12,'timber',x,height/2,z);
  }
  for(const x of [-.6,.6])box(g,.12,height,.12,'timber',x,height/2,d/2);
  for(const x of [-w/2,w/2])for(let n=1;n<nz;n++)box(g,.12,height,.12,'timber',x,height/2,-d/2+n*d/nz);
  for(const y of [.4,.85,1.2]){
    box(g,w,.07,.07,'timberLight',0,y,-d/2);
    for(const side of [-1,1]){
      box(g,.07,.07,d,'timberLight',side*w/2,y,0);
      box(g,(w-1.2)/2,.07,.07,'timberLight',side*(w+1.2)/4,y,d/2);
    }
  }
  // Hinged gate drawn open into the pen, leaving its 1.2 m opening legible.
  const gate=group();placed(g,gate,-.6,d/2);gate.rotation.y=Math.PI/3;
  for(const y of [.4,.85,1.2])box(gate,1.15,.07,.07,'teal',.575,y,0);
}
export const REMODELED_FACILITIES=new Set(['shed','workshop','kitchen','warehouse','reading-room','outdoor-classroom','community-hall',
  'orchard','grove','garden','greenhouse','goat_pasture','goat-pasture-empty','coop','apiary','solar_farm',
  'banana_treatment','wetland','compost','square','exercise-garden','volleyball-court','supply-0','supply-1','eco_toilet']);

export function functionalFacility(id,{plant,tree,goat,chicken},stage=2){
  const g=group(),p=FUNCTIONAL_PROGRAM[id];
  const indoors=['shed','workshop','kitchen','warehouse','reading-room','outdoor-classroom','community-hall'];
  if(indoors.includes(id)){
    const [w,d]=p.shell;
    shelter(g,w,d,!['shed','outdoor-classroom'].includes(id),id);
    if(['workshop','warehouse'].includes(id)){
      for(const side of [-1,1])for(let z=-d/2+.3;z<d/2;z+=.4)box(g,.045,2.5,.32,'timberLight',side*(w/2+.025),1.37,z);
      for(const x of [-w/2+.13,w/2-.13])box(g,.13,2.7,.13,'timber',x,1.47,d/2);
    }else if(id!=='shed'&&id!=='outdoor-classroom'){
      for(const side of [-1,1])for(const z of [-d/4,d/4]){
        if(id==='kitchen'&&z>0)continue;
        box(g,.08,1.05,1.3,'timber',side*(w/2+.02),1.65,z);
        windowPane(box(g,.1,.9,1.15,'glass',side*(w/2+.035),1.65,z));
        for(const dz of [-.82,.82])box(g,.12,.95,.3,'teal',side*(w/2+.06),1.65,z+dz);
      }
    }
    if(id==='workshop'){
      // Sliding workshop doors expose the actual working entrance.
      for(const x of [-1.9,1.9]){
        box(g,1.2,2.3,.1,'teal',x,1.27,d/2+.06);
        for(const y of [.35,2.15])box(g,1.15,.09,.12,'timberLight',x,y,d/2+.1);
      }
      box(g,5.4,.09,.12,'timber',0,2.55,d/2+.12);
      for(const x of [2.9,3.4]){
        box(g,.06,.65,.07,'timberLight',x,1.7,d/2+.15);
        box(g,.35,.12,.12,'stone',x,2.03,d/2+.16);
      }
      for(const x of [-2.3,2.3])table(g,x,0,2,.85,.9);
      for(const x of [-2.3,2.3])rack(g,x,-d/2+.65,2);
      table(g,-2,1.8,1.6,.8,.8);
      for(const x of [-2.3,2.3]){
        box(g,.12,.18,.3,'teal',x+.7,1.04,.2);
        box(g,.7,.035,.25,'timber',x-.3,.975,0);
      }
    }else if(id==='kitchen'){
      // Equipment backs onto the rear wall; two clear 1.4 m work positions
      // face it. Dining occupies the front half, outside the cooking aisle.
      for(const x of [-3,-1,1]){
        box(g,1.8,.9,.7,x===-3?'stone':'timberLight',x,.57,-3.3);
        box(g,1.8,.06,.75,'stone',x,1.05,-3.3);
      }
      const oven=new THREE.Mesh(new THREE.SphereGeometry(.75,12,7,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:'#bd7950',roughness:1,flatShading:true}));oven.position.set(-3,1.08,-3.25);oven.castShadow=true;g.add(oven);
      const mouth=cylinder(g,.28,.28,.035,'hair',-3,1.15,-2.53,10);mouth.rotation.x=Math.PI/2;
      box(g,.75,.08,.35,'stone',-3,.93,-2.5);
      for(let n=0;n<3;n++){const log=cylinder(g,.07,.07,.55,'timber',-3.3+n*.25,.3,-2.86,6);log.rotation.x=Math.PI/2;}
      box(g,.7,.05,.5,'glass',1,1.1,-3.3);
      beam(g,[1,1.1,-3.55],[1,1.4,-3.55],.055,'teal');
      rack(g,3.5,-2.5,1.8);
      for(const x of [-2.5,2.5]){
        table(g,x,1.3,2,.9,.78);
        for(const z of [.45,2.15])bench(g,x,z,1.8);
      }
      const flue=box(g,.4,3,.4,'tile',-3,3.1,-3.3);
      box(g,.65,.12,.65,'tileDark',-3,4.63,-3.3);flue.name='kitchen-flue';
    }else if(id==='warehouse'){
      for(const x of [-2,2]){
        box(g,1.5,2.35,.12,'timber',x,1.295,d/2+.06);
        for(const y of [.35,2.2])box(g,1.5,.09,.14,'timberLight',x,y,d/2+.12);
        beam(g,[x-.65,.4,d/2+.15],[x+.65,2.2,d/2+.15],.1,'timberLight');
      }
      box(g,3,.12,.65,'stone',0,.06,d/2+.25);
      for(const x of [-2.5,2.5])for(const z of [-1.7,.6])rack(g,x,z,1.8);
      box(g,1.2,.14,.8,'timberLight',2.5,.19,2.1);
      for(const x of [2.15,2.85])box(g,.5,.45,.6,'earth',x,.5,2.1);
      g.userData.shelfArea=4*3*1.8*.65;
    }else if(id==='reading-room'){
      for(const x of [-2.5,0,2.5])rack(g,x,-2.3,1.8,true);
      for(const x of [-2,2]){
        table(g,x,.5,1.8,.8,.78);
        box(g,.36,.035,.25,'plaster',x,.86,.5);
        box(g,.14,.22,.14,'teal',x+.55,.95,.5);
        for(const z of [-.3,1.3])bench(g,x,z,1.6);
      }
    }else if(id==='outdoor-classroom'||id==='community-hall'){
      const rows=id==='community-hall'?3:2,columns=id==='community-hall'?2:1;
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const x=columns===2?(col-.5)*5:0,z=-1.8+row*2.5;
        table(g,x,z,id==='community-hall'?2:3,.8,.78);
        for(const dz of [-.8,.8])bench(g,x,z+dz,id==='community-hall'?1.8:2.8);
      }
      box(g,2.4,1.25,.1,'teal',0,1.7,-d/2+.4);
      for(let n=0;n<3;n++)box(g,1.3-n*.2,.025,.02,'plaster',-.2,1.95-n*.23,-d/2+.46);
      for(const x of [-1.3,1.3])box(g,.09,2.35,.09,'timber',x,1.175,-d/2+.4);
    }else table(g,-1,0,2,.85,.9);
    g.userData.shell=p.shell;g.userData.clearFloorArea=Number((['shed','outdoor-classroom'].includes(id)?w*d:w*d-(.4*d+.4*w-.64)).toFixed(2));
  }else if(['orchard','grove','supply-0','supply-1'].includes(id)){
    if(id==='supply-1'){
      for(let n=0;n<12;n++){const a=n*2.4,r=.4+(n%3)*.35,x=Math.sin(a)*r,z=Math.cos(a)*r,h=3.2+(n%4)*.3; cylinder(g,.05,.07,h,'leaf',x,h/2,z,7);for(let y=.4;y<h;y+=.7)cylinder(g,.075,.075,.035,'leafLight',x,y,z,4);for(let k=0;k<3;k++){const leaf=box(g,.08,.02,.7,'leaf',x+Math.sin(a+k)*.3,h-.3-k*.35,z+Math.cos(a+k)*.3);leaf.rotation.y=a+k;}}
    }else{
      const spacing=id==='grove'?3:id==='supply-0'?5:4;
      for(const x of [-spacing/2,spacing/2])for(const z of [-spacing/2,spacing/2])placed(g,id==='grove'?plant('banana'):tree(id==='orchard'?'orchard':'timber'),x,z);
      g.userData.plantCount=4;g.userData.plantSpacing=spacing;
    }
  }else if(id==='garden'||id==='greenhouse'){
    if(id==='garden')for(const x of [-1.5,1.5])for(const z of [-2.6,2.6])bed(g,x,z,1.2,4,plant);
    else{
      for(const x of [-1.2,1.2])bed(g,x,0,1.2,8,plant);
      for(const x of [-3,3])for(const z of [-5,-2.5,0,2.5,5])box(g,.08,2.5,.08,'timberLight',x,1.25,z);
      for(const z of [-5,-2.5,0,2.5,5])for(const side of [-1,1])beam(g,[side*3,2.5,z],[0,3.5,z],.07,'timberLight');
      for(const x of [-3,3]){
        glazing(box(g,.025,2.4,10,'glass',x,1.25,0));
        box(g,.07,.07,10,'timberLight',x,2.5,0);
      }
      for(const side of [-1,1]){
        const pane=glazing(box(g,Math.hypot(3,1),.025,10,'glass',side*1.5,3,0));pane.rotation.z=-side*Math.atan2(1,3);
      }
      // Door-sized opening, not a glazed wall across the walking aisle.
      for(const z of [-5,5])for(const side of [-1,1])glazing(box(g,2.5,2.4,.025,'glass',side*1.75,1.25,z));
      for(const x of [-.5,.5])box(g,.08,2.5,.08,'timberLight',x,1.25,5);
      box(g,1.1,.08,.08,'timberLight',0,2.2,5);
    }
    g.userData.plantedArea=id==='garden'?19.2:19.2;
  }else if(['goat_pasture','goat-pasture-empty','coop'].includes(id)){
    const hens=id==='coop',[w,d]=hens?[7,7]:[11,9];fence(g,w,d);
    const home=group();placed(g,home,-w/2+2,-d/2+2);shelter(home,hens?2:3,hens?2:3,false,hens?'gable':'shed');
    box(home,hens?2:3,1.6,.12,'timberLight',0,.8,hens?-1:-1.5);
    if(hens){
      for(const x of [-.95,.95])box(home,.1,2.1,2,'timberLight',x,1.17,0);
      box(home,2,.5,.1,'timberLight',0,1.97,-1);
      box(home,1.15,2.1,.1,'timberLight',-.425,1.17,1);
      box(home,.35,2.1,.1,'timberLight',.825,1.17,1);
      box(home,.5,1.4,.1,'timberLight',.4,1.52,1);
      box(home,.75,1.85,.06,'teal',-.5,1.045,1.07);
      for(const y of [.25,1.8])box(home,.7,.07,.08,'timber',-.5,y,1.11);
      for(const z of [-.45,.45])beam(home,[-.8,.8,z],[.8,.8,z],.06,'timber');
      for(const x of [-.6,0,.6])box(home,.5,.4,.45,'timber',x,.3,-.7);
      for(let n=0;n<6;n++)placed(g,chicken(n%3),-.5+(n%3)*1.2,.3+Math.floor(n/3)*1.2);
    }else{
      box(home,.12,1.6,3,'timberLight',-1.5,.8,0);
      if(id==='goat_pasture')for(const x of [-1.2,1.2])placed(g,goat(),x,1);
    }
    box(g,1.4,.3,.45,'timberLight',w/2-1,.15,-1);
    box(g,1.2,.03,.3,'glass',w/2-1,.32,-1);
    g.userData.shelterArea=hens?4:9;
    g.userData.outdoorPenArea=w*d-(hens?4:9);
  }else if(id==='apiary'){
    for(const x of [-1.1,0,1.1]){
      box(g,.12,.9,.12,'timber',x,.45,0);
      for(const y of [.9,1.15])box(g,.45,.22,.45,'timberLight',x,y,0);
      box(g,.6,.06,.6,'tile',x,1.32,0);
      cylinder(g,.035,.035,.06,'hair',x,1.12,.25,8).rotation.x=Math.PI/2;
    }
  }else if(id==='solar_farm'){
    for(const z of [-1.8,1.8])for(const x of [-1.3,0,1.3]){
      const p=group();p.name="solar-panel";placed(g,p,x,z,1.2);p.rotation.x=-.35;
      box(p,1.1,.07,1.8,'stone');box(p,1.02,.02,1.72,'glass',0,.045,0).material=solarBlue;
      for(const dx of [-.34,0,.34])box(p,.018,.025,1.72,'plaster',dx,.06,0);
      for(const dz of [-.55,0,.55])box(p,1.02,.025,.018,'plaster',0,.06,dz);
      for(const dz of [-.65,.65]){
        // Support the underside at the actual panel-plane slope, in world Z.
        const height=1.2+Math.tan(.35)*dz-.055;
        box(g,.08,height,.08,'teal',x,height/2,z+dz).name='solar-support';
      }
    }
    for(const z of [-1.8,1.8])for(const dz of [-.65,.65])
      box(g,3.8,.06,.08,'stone',0,1.2+Math.tan(.35)*dz-.055,z+dz).name='solar-rail';
    box(g,.5,.7,.3,'teal',3,.35,0).name='shared-inverter';g.userData.panelArea=6*1.1*1.8;
  }else if(id==='wetland'||id==='banana_treatment'){
    const w=4,d=id==='wetland'?8:6;
    box(g,w,.2,d,'earth',0,.1,0);
    for(const x of [-w/2,w/2])box(g,.16,.35,d,'stone',x,.175,0);
    for(const z of [-d/2,d/2])box(g,w,.35,.16,'stone',0,.175,z);
    if(id==='wetland')for(let x=-1.5;x<=1.5;x++)for(let z=-3.3;z<3.5;z+=1.1)placed(g,plant('reed'),x,z,.2);
    else for(const z of [-1.5,1.5])placed(g,plant('banana'),0,z,.2);
    for(const z of [-d/2-.4,d/2+.4]){
      cylinder(g,.15,.15,.6,'teal',1.5,.3,z,10);
      beam(g,[1.5,.45,z],[1.5,.45,z>0?d/2-.4:-d/2+.4],.12,'teal');
    }
    g.userData.effectiveBedArea=w*d;
  }else if(id==='compost'){
    for(const x of [-1.4,0,1.4]){
      const bin=group();bin.name='compost-bin';placed(g,bin,x,-.5);
      for(const dx of [-.55,.55])for(const z of [-.55,.55])box(bin,.1,1.1,.1,'timber',dx,.55,z);
      for(let y=.15;y<1.1;y+=.2){
        for(const dx of [-.55,.55])box(bin,.08,.15,1.1,'timberLight',dx,y,0);
        box(bin,1.1,.15,.08,'timberLight',0,y,-.55);
      }
      box(bin,1,.6,1,'earth',0,.3,0);
    }
    g.userData.bayVolume=3;
  }else if(id==='square'){
    cylinder(g,1.2,1.2,.04,'earth',0,.02,0,16);
    for(const [x,z,a] of [[0,-3.5,0],[0,3.5,Math.PI],[-3.5,0,Math.PI/2],[3.5,0,-Math.PI/2]])bench(g,x,z,2.4,a);
    g.userData.seats=12;
  }else if(id==='exercise-garden'){
    for(const x of [-3,-2]){
      for(const z of [-2,0])box(g,.1,1.1,.1,'timber',x,.55,z);
      beam(g,[x,1.1,-2],[x,1.1,0],.08,'timberLight');
    }
    for(const x of [1,3])box(g,.12,2.4,.12,'timber',x,1.2,-2);
    beam(g,[1,2.4,-2],[3,2.4,-2],.07,'timberLight');
    box(g,3,.1,2,'timberLight',1,.05,2);
    for(let n=0;n<4;n++)cylinder(g,.23,.25,.2,'timber',-3+n*.7,.1,2,10);
  }else if(id==='volleyball-court'){
    box(g,22,.035,14,'earth',0,.02,0);
    for(const x of [-8,8])box(g,.05,.02,8,'plaster',x,.05,0);
    for(const z of [-4,4])box(g,16,.02,.05,'plaster',0,.05,z);
    for(const z of [-4.7,4.7])cylinder(g,.06,.08,2.6,'timber',0,1.3,z,8);
    for(const y of [1.4,2.4])beam(g,[0,y,-4.7],[0,y,4.7],.025,'plaster');
    for(let z=-4.4;z<=4.4;z+=.22)beam(g,[0,1.4,z],[0,2.4,z],.008,'timber');
    for(let y=1.6;y<2.4;y+=.2)beam(g,[0,y,-4.4],[0,y,4.4],.008,'timber');
    g.userData.playingArea=128;g.userData.freeZone=3;
  }else if(id==='eco_toilet'){
    shelter(g,1.8,2.2,false);
    for(const x of [-.8,.8])box(g,.2,2.7,2.2,'plaster',x,1.47,0);
    box(g,1.8,2.7,.2,'plaster',0,1.47,-1);
    for(const x of [-.65,.65])box(g,.5,2.7,.2,'plaster',x,1.47,1);
    box(g,.8,2.1,.07,'teal',0,1.17,1.03);
    for(const x of [-.46,.46])box(g,.09,2.2,.14,'timberLight',x,1.22,1.07);
    box(g,1.01,.09,.14,'timberLight',0,2.32,1.07);
    box(g,.06,.06,.08,'stone',.28,1.12,1.11);
    for(const z of [-1.1,1.1])for(let n=0;n<3;n++)box(g,1.5-n*.48,.07,.08,'timberLight',0,2.91+n*.12,z);
    cylinder(g,.17,.17,.05,'teal',1,3.1,-.8,8);
    box(g,.8,.6,.2,'plaster',0,2.55,1);
    cylinder(g,.1,.1,3,'teal',1,1.5,-.8,8);
    box(g,.7,.5,.08,'timber',0,.4,-1.15);
  }
  // Every redesigned facility gets a physically corresponding construction
  // model. Groundwork shows its own site, assembly shows structural members.
  if(stage<2){
    const frame=group(),[w,d]=p.shell||p.site.map(n=>n*2-1);
    const h=['garden','square','exercise-garden'].includes(id)?.25:stage?1.1:.35;
    for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])box(frame,.09,h,.09,'timber',x,h/2,z);
    if(stage===1){
      for(const z of [-d/2,d/2])beam(frame,[-w/2,.25,z],[w/2,.25,z],.1,'timberLight');
      if(indoors.includes(id)){
        const lean=['workshop','outdoor-classroom','shed'].includes(id),rear=id==='shed'?3.1:3.55,front=id==='shed'?2.65:2.8;
        for(const x of [-w/2,w/2])for(const z of [-d/2,d/2]){const h=lean?(z<0?rear:front):2.85;box(frame,.16,h,.16,'timber',x,h/2,z);}
        if(lean)for(const x of [-w/2,w/2])beam(frame,[x,front,d/2],[x,rear,-d/2],.12,'timberLight');
        else if(id==='warehouse')for(const x of [-w/2,w/2])for(const sign of [-1,1])beam(frame,[x,2.85,sign*d/2],[x,3.95,0],.12,'timberLight');
        else if(['reading-room','community-hall'].includes(id)){
          const rx=(w-d)/2,h=id==='community-hall'?4.55:4.05;
          for(const x of [-w/2,w/2])for(const z of [-d/2,d/2])beam(frame,[x,2.85,z],[Math.sign(x)*rx,h,0],.12,'timberLight');
          beam(frame,[-rx,h,0],[rx,h,0],.12,'timber');
        }else for(const z of [-d/2,d/2])for(const sign of [-1,1])beam(frame,[sign*w/2,2.85,z],[0,4.15,z],.12,'timberLight');
      }
    }
    g.traverse(o=>o.geometry?.dispose());return frame;
  }
  return g;
}
