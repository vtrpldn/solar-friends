import {applyRoadStroke} from './editor/road-placement.js';
import {placeNatureObject} from './editor/nature.js';
import {applyAssetPlacement} from './editor/asset-placement.js';
import init,{Game} from './pkg/solar_friends.js';
import {moveBuildings,placeBuildingCopy} from './editor/objects.js';
const ready=init();let context,game;
self.onmessage=async({data})=>{
 if(data.context){context=data.context;return;}
 const {serial,dx,dy}=data;
 try{
  await ready;game??=new Game();const candidate=structuredClone(context.definition);
  if(context.mode==='road')applyRoadStroke(candidate,data.cells);else if(context.mode==='nature'){try{const p=context.copy;candidate.map.nature=placeNatureObject(candidate,p.objects,p.catalog,p.source,dx,dy,p.source.size,{copy:p.copy});}catch(error){self.postMessage({serial,dx,dy,allowed:false,message:error.message,routes:[]});return;}}else if(context.mode==='asset')applyAssetPlacement(candidate,context.copy,dx,dy);else if(context.mode==='place')candidate.start.buildings.push({...context.copy,x:dx,y:dy});else if(context.mode==='copy')placeBuildingCopy(candidate,context.copy,dx,dy);else moveBuildings(candidate,context.ids,dx,dy);
  const report=JSON.parse(game.load_scenario(JSON.stringify(candidate)));
  if(!report.ok){self.postMessage({serial,dx,dy,allowed:false,message:report.issues.find(i=>i.severity==='error')?.message??'Choose another site for this group.',routes:[]});return;}
  const ids=['place','asset','nature','road'].includes(context.mode)?[]:context.mode==='copy'?context.copy.routes?.map(r=>r.id)??[]:(context.definition.start.routes??[]).filter(r=>(candidate.start.routes??[]).find(p=>p.id===r.id)?.cells.some(([x,y],i)=>x!==r.cells[i][0]||y!==r.cells[i][1])).map(r=>r.id);
  const village=ids.length?JSON.parse(game.snapshot()).village:null,routes=ids.flatMap(id=>{const line=village.pipes.lines.find(p=>p.id===village.scenario.routes[id]);return line?[line.plan]:[];});
  self.postMessage({serial,dx,dy,allowed:true,message:context.mode==='road'?'Ready to paint · one undo step.':['place','asset','nature'].includes(context.mode)?'Ready to place.':context.mode==='copy'?'Ready to copy · internal connections included.':'Ready to move · internal connections included.',routes});
 }catch{self.postMessage({serial,dx,dy,unavailable:true,message:'Preview unavailable · placement will still be checked.'});}
};
