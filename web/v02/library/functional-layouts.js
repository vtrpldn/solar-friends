import { FUNCTIONAL_PROGRAM } from './functional-program.js';
// The room budgets are targets, not measured geometry. The authored plan below
// is measured separately; do not equate the reserved site with indoor floor.
export const FUNCTIONAL_LAYOUTS = Object.fromEntries(
  Object.entries(FUNCTIONAL_PROGRAM).filter(([,p])=>p.capacity.residents).map(([id,p])=>[id,{
    occupants:p.capacity.residents,site:[...p.site],shell:p.shell,wall:.2,
    targetUsableArea:p.targetUsableArea,
    ...(id.includes('veranda')?{site:[5,6],verandaDepth:2}:{}),
    ...(id==='home-courtyard'?{site:[6,5],terrace:[2,8]}:{}),
  }])
);
export function interiorArea(layout) {
  return Number(((layout.shell[0]-2*layout.wall)*(layout.shell[1]-2*layout.wall)).toFixed(2));
}
export function homePlan(layout) {
  const [w,d]=layout.shell.map(n=>n-.4),t=.18,back=-d/2,split=back+3.6;
  const walls=[];
  function wall(x,z,width,depth){walls.push({x,z,width,depth});}
  function across(x,z,length,door=0){
    if(!door)return wall(x,z,length,t);
    const part=(length-door)/2;
    wall(x-(door+part)/2,z,part,t);wall(x+(door+part)/2,z,part,t);
  }
  // Bedroom doors open into the living/circulation zone. Baths have their
  // own door, not a route through another resident's sleeping space.
  if(layout.occupants===2){
    const bedroom=4.2,bath=w-bedroom-t;
    across(-w/2+bedroom/2,split,bedroom,.9);
    across(w/2-bath/2,split,bath,.9);
    wall(-w/2+bedroom+t/2,back+1.8,t,3.6);
    across(w/2-bath/2,back+1.2,bath,.8);
  } else {
    const roomW=(w-t)/2;
    for(const sign of [-1,1])across(sign*(roomW+t)/2,split,roomW,.9);
    wall(0,back+1.8,t,3.6);
    // Wet rooms occupy the side of the middle band, with a central route.
    for(const sign of layout.occupants===4?[-1,1]:[1]){
      const center=sign*(w/2-1.2),z=split+1.25;
      wall(sign*(w/2-2.4),z,t,2.3);
      across(center,split+2.4,2.4,.8);
    }
  }
  // Exact union of partition footprints, including intersecting joins.
  const xs=[...new Set(walls.flatMap(r=>[r.x-r.width/2,r.x+r.width/2]))].sort((a,b)=>a-b);
  const zs=[...new Set(walls.flatMap(r=>[r.z-r.depth/2,r.z+r.depth/2]))].sort((a,b)=>a-b);
  let partitionArea=0;
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
    const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2;
    if(walls.some(r=>Math.abs(x-r.x)<r.width/2&&Math.abs(z-r.z)<r.depth/2))partitionArea+=(xs[i]-xs[i-1])*(zs[j]-zs[j-1]);
  }
  return {walls,split,usableArea:Number((interiorArea(layout)-partitionArea).toFixed(2))};
}

export const HOME_CHARACTER = {
  house:{roof:'hip',doorX:-.65,wall:'#e8d8ab',shutters:'teal'},
  'home-gable':{roof:'front-gable',doorX:.65,wall:'#e5ceb1',shutters:'timber'},
  'adobe-gable':{roof:'side-gable',doorX:-.8,wall:'#c89970',shutters:'timber'},
  'home-veranda':{roof:'hip',doorX:0,wall:'#d6dfc7',shutters:'teal'},
  'adobe-veranda':{roof:'side-gable',doorX:0,wall:'#c49365',shutters:'timberLight'},
  'home-courtyard':{roof:'hip',doorX:-.6,wall:'#e8dec7',shutters:'teal'},
  'home-family':{roof:'twin-gable',doorX:.6,wall:'#e4c49b',shutters:'teal'},
  'home-shared':{roof:'hip-porch',doorX:0,wall:'#cf9f85',shutters:'timber'},
};
