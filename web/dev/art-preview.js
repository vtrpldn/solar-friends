import {resetMaterialLocations} from './material-fixture.js';
import {allBuildingArt,homeArtKeys,adobeVariants} from '../building-art.js';
import {placementReason} from '../polish.js';
import {MAP_SIZE} from '../terrain.js';

// Build the gallery from the live registry, not an older village's inventory.
// It is a separate, paused fixture; production saves are never overwritten.
export function makeArtPreview(fresh,established,{night=false}={}) {
  const state=structuredClone(established),v=state.village;
  v.economy=structuredClone(fresh.village.economy);
  v.buildings=[];v.roads=[];v.minutes=1440+(night?1260:600);
  v.simulation=structuredClone(fresh.village.simulation);v.simulation.materials=null;
  v.power={stored:24,disabled:[]};v.circular=structuredClone(fresh.village.circular);
  v.food=100;v.water=100;v.meals=10;v.wood=110;
  v.progress.completed.fill(true);v.progress.later_completed.fill(true);
  v.progress.gathering_delivery=null;v.progress.gathering_until=0;v.progress.invited=0;v.progress.attended=0;
  v.situations=structuredClone(fresh.village.situations);
  const template=established.village.buildings[0],adobeKeys=Object.keys(adobeVariants);
  const candidates=[];
  for(const y of [5,9,13,18,22])for(const x of [5,9,13,17,21])candidates.push([x,y]);
  // Future additions can use other clearings without silently disappearing.
  for(let y=2;y<MAP_SIZE-2;y++)for(let x=2;x<MAP_SIZE-2;x++)candidates.push([x,y]);
  for(const key of Object.keys(allBuildingArt)) {
    const isHome=homeArtKeys.includes(key)||adobeKeys.includes(key),kind=isHome?'home':key;
    const recipe=adobeKeys.includes(key)?'adobe':'standard';
    const appearance=isHome?adobeKeys.includes(key)?4+adobeKeys.indexOf(key):homeArtKeys.indexOf(key):undefined;
    const sites=kind==='hydro'?[[24,13],...candidates]:candidates;
    const position=sites.find(([x,y])=>!placementReason(v,kind,x,y));
    if(!position)throw new Error(`No clear preview plot for ${key}`);
    const id=v.buildings.length,[x,y]=position;
    const crop=structuredClone(template.crop);
    if(['garden','greenhouse'].includes(kind))Object.assign(crop,{planted:true,kind:'lettuce',next_kind:'lettuce',growth:180,moisture:240,harvests:0});
    v.buildings.push({...structuredClone(template),id,kind,x,y,progress:100,contributors:0,next_visit:0,visits:0,crop,poultry:{remaining:0}});
    const stages=fresh.environment.economy.recipes.find(r=>r.kind===kind)?.[recipe];
    if(!stages)throw new Error(`No preview construction recipe for ${key}`);
    v.economy.projects.push({building:id,recipe,appearance,priority:1,paused:false,stage:stages.length,labour:0,committed:false,reserved:Array(v.economy.stock.length).fill(0),consumed:Array(v.economy.stock.length).fill(0)});
  }
  v.economy.next_building=v.buildings.length;
  for(const r of state.residents)Object.assign(r,{task:'idle',reason:'Enjoying our artwork showcase.',remaining:0,requested:false,trip:null,visit_building:null,activity_building:null,activity_material:null,x:8+r.id*.7,y:15.5,target_x:8+r.id*.7,target_y:15.5,energy:90,hunger:20,social:80,last_meal_slot:3,last_sanitation_day:-1});
  return resetMaterialLocations(state);
}
