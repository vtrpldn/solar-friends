import * as THREE from 'three';
import {box,beam,cylinder} from '../workshop/models.js';
import {gableRoof} from './roof-forms.js';

// All stages share these anchors: the house occupies the rear-left of its run.
const HOME={x:-1.5,z:-1.5,eave:2.35,ridge:3};
function part(parent,name,x=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,0,z);parent.add(g);return g;}
function enclosure(g,stage){
 const posts=[];
 for(const z of [-3.5,3.5])for(const x of [-3.5,-1.75,1.75,3.5])posts.push([x,z]);
 for(const x of [-3.5,3.5])for(const z of [-1.75,0,1.75])posts.push([x,z]);
 posts.push([-.6,3.5],[.6,3.5],[0,-3.5]);
 const uprights=part(g,'run-posts');
 for(const [x,z]of posts)box(uprights,.12,stage===0?.3:1.3,.12,'timber',x,stage===0?.15:.65,z);
 if(stage===0)return;
 function panel(x,z,width,turn=0){
  const p=part(g,'run-panel',x,z);p.rotation.y=turn;
  for(const y of [.15,1.2])box(p,width,.07,.07,'timberLight',0,y,0);
  if(stage===1)return;
  box(p,width,.055,.055,'timberLight',0,.65,0);
 }
 panel(0,-3.5,7);panel(-3.5,0,7,Math.PI/2);panel(3.5,0,7,Math.PI/2);
 panel(-2.05,3.5,2.9);panel(2.05,3.5,2.9);
 if(stage===2){
  const gate=part(g,'run-gate',0,3.5);
  for(const y of [.2,1.15])box(gate,1.12,.09,.09,'teal',0,y,0);
  for(const x of [-.52,0,.52])box(gate,.07,1,.07,'teal',x,.68,0);
  beam(gate,[-.5,.25,0],[.5,1.1,0],.06,'timberLight');
  box(gate,.17,.05,.1,'stone',.4,.95,.06);
 }
}
export function chickenCoop(chicken,stage=2){
 const g=new THREE.Group();g.userData={shelterArea:4,outdoorPenArea:45};
 enclosure(part(g,'coop-run'),stage);
 const home=part(g,'coop-house',HOME.x,HOME.z);
 for(const x of [-.94,.94])for(const z of [-.94,.94])box(home,.28,.2,.28,'stone',x,.1,z);
 for(const z of [-.94,.94])box(home,2,.13,.13,'timber',0,.29,z);
 for(const x of [-.94,.94])box(home,.13,.13,2,'timber',x,.29,0);
 if(stage===0){
  for(let n=0;n<4;n++)box(g,1.8,.07,.18,'timberLight',1.4,.06+n*.07,-1.8);
  return g;
 }
 // These posts, wall plates and trusses remain in the completed building.
 const frame=part(home,'coop-frame');
 for(const x of [-.94,.94])for(const z of [-.94,.94])box(frame,.12,2.04,.12,'timber',x,1.32,z);
 for(const x of [-.94,.94])beam(frame,[x,HOME.eave,-1],[x,HOME.eave,1],.12,'timber');
 for(const z of [-1,0,1]){
  beam(frame,[-1.25,HOME.eave,z],[1.25,HOME.eave,z],.1,'timber');
  for(const side of [-1,1])beam(frame,[side*1.25,HOME.eave,z],[0,HOME.ridge,z],.09,'timberLight');
 }
 beam(frame,[0,HOME.ridge,-1.25],[0,HOME.ridge,1.25],.1,'timber');
 for(let x=-.9;x<1;x+=.2)box(home,.19,.09,2,'timberLight',x,.36,0);
 if(stage===1)return g;
 // Quiet wall planes keep the small building legible at game zoom.
 box(home,2,1.84,.09,'timberLight',0,1.33,-1);
 for(const x of [-1,1])box(home,.09,1.84,2,'timberLight',x,1.33,0);
 // Full-height cleaning door and a separate low hen hatch.
 box(home,.82,1.85,.08,'teal',-.48,1.33,1.02);
 for(const x of [-.94,-.02,.3,.85])box(home,.07,1.94,.12,'timber',x,1.37,1.03);
 box(home,.32,1.94,.09,'timberLight',.14,1.37,1);
 box(home,.15,1.94,.09,'timberLight',.925,1.37,1);
 box(home,.5,1.18,.09,'timberLight',.575,1.76,1);
 box(home,2,.12,.12,'timber',0,2.31,1);
 for(const y of [.55,2.1])box(home,.8,.07,.1,'timberLight',-.48,y,1.09);
 box(home,.07,.07,.08,'stone',-.18,1.3,1.1);
 const ramp=part(home,'hen-ramp',.575,1.5);ramp.position.y=.22;ramp.rotation.x=.32;
 box(ramp,.48,.06,1,'timberLight');for(const z of [-.3,0,.3])box(ramp,.48,.035,.045,'timber',0,.05,z);
 box(home,.95,.16,.45,'stone',-.48,.08,1.3);
 // Front gable ventilation slats sit below the same roof as the trusses.
 for(let n=0;n<3;n++)box(home,1.65-n*.5,.08,.07,'timberLight',0,2.45+n*.16,1);
 const roof=part(home,'functional-roof');gableRoof(roof,2.5,2.5,HOME.eave,HOME.ridge-HOME.eave);
 // Exterior nest-box access on the right wall, away from the cleaning door.
 const nests=part(home,'nest-boxes',1.24,-.25);
 box(nests,.48,.45,1.2,'timberLight',0,.95,0);
 const lid=box(nests,.62,.07,1.35,'timber',0,1.23,0);lid.rotation.z=-.18;
 for(const z of [-.45,.3])beam(home,[-.8,.85,z],[.8,.85,z],.055,'timber');
 const feed=part(g,'feed-station',1.7,-1);
 cylinder(feed,.22,.3,.42,'teal',0,.27,0,8);cylinder(feed,.38,.38,.07,'tile',0,.07,0,10);
 const water=part(g,'water-station',2.5,.2);
 cylinder(water,.25,.3,.38,'stone',0,.27,0,10);cylinder(water,.4,.4,.08,'teal',0,.08,0,10);
 for(const [i,x,z]of [[0,-.5,.6],[1,1.2,1.5],[2,.4,2.3]]){const bird=chicken(i);bird.position.set(x,0,z);g.add(bird);}
 return g;
}
