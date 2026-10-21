import {sourceMaterial,sourcePlacementReason,sourceOccupies,sourceConflicts} from './resource-sites.js';
import { occupies,footprintSize } from './building-footprints.js';
import { MAP_SIZE, riverBank,hydroSite } from './terrain.js';
import {batteryCells,batteryReserved} from './battery-plots.js';

export function placementReason(village, kind, x, y) {
  const map=village.scenario?.definition?.map;
  const soilReserved=(a,b)=>(village.restoration||[]).some(j=>j.finished==null&&a>=j.x-Math.floor(j.size/2)&&a<j.x-Math.floor(j.size/2)+j.size&&b>=j.y-Math.floor(j.size/2)&&b<j.y-Math.floor(j.size/2)+j.size);
  const reservations=(village.building_jobs||[]).filter(j=>j.destination).map(j=>({...village.buildings.find(b=>b.id===j.building),x:j.destination[0],y:j.destination[1]}));
  if(kind.startsWith('source_'))return sourcePlacementReason(village,sourceMaterial(kind),x,y);
  if (x < 1 || x > MAP_SIZE - 2 || y < 1 || y > MAP_SIZE - 2) return 'Choose a clearing inside the village.';
  if (kind === 'road') {
    if(soilReserved(x,y))return 'That ground is reserved for soil restoration.';
    if (riverBank(x, y,map)) return 'Keep the riverbank clear.';
    if(batteryReserved(village,x,y))return 'Move the recovered battery or its reserved destination before placing a road here.';
    if (village.roads.some(([rx, ry]) => rx === x && ry === y)) return '';
    return reservations.some(b=>occupies(b,x,y)) ? 'That plot is reserved for a building move.' : village.buildings.some(b => occupies(b,x,y))||village.economy.sources.some(s=>sourceOccupies(s,x,y)) ? 'A building or material plot occupies this spot.' : '';
  }
  const radius = ['shed','square','solar_farm','orchard','goat_pasture'].includes(kind) ? 2 : 1;
  if (x - radius < 0 || y - radius < 0 || x + radius >= MAP_SIZE || y + radius >= MAP_SIZE || (kind==='hydro' ? !hydroSite(x,y,map) : Array.from({length:footprintSize(kind)},(_,i)=>x-Math.floor(footprintSize(kind)/2)+i).some(a=>Array.from({length:footprintSize(kind)},(_,i)=>y-Math.floor(footprintSize(kind)/2)+i).some(b=>riverBank(a,b,map))))) return kind==='hydro'?'Place in the shallow village side of the river.':'Keep the riverbank clear. Move farther inland.';
  if (Math.abs(x - (village.camp?.[0]??10)) < radius + 0.5 && Math.abs(y - (village.camp?.[1]??13)) < radius + 0.5) return 'Leave the arrival clearing open for everyone.';
  if (village.buildings.some(b => Math.abs(b.x - x) < radius + (['shed','square','solar_farm','orchard','goat_pasture'].includes(b.kind) ? 2 : 1) && Math.abs(b.y - y) < radius + (['shed','square','solar_farm','orchard','goat_pasture'].includes(b.kind) ? 2 : 1))) return 'Leave a little room between buildings.';
  if(village.logistics?.stores.some(p=>p.owner.kind==='ground'&&p.items.some(n=>n)&&occupies({kind,x,y},Math.round(p.x),Math.round(p.y))))return 'Let residents collect the materials lying on this plot before building here.';
  if((village.restoration||[]).some(j=>j.finished==null&&Array.from({length:j.size},(_,i)=>j.x-Math.floor(j.size/2)+i).some(a=>Array.from({length:j.size},(_,i)=>j.y-Math.floor(j.size/2)+i).some(b=>occupies({kind,x,y},a,b)))))return 'That ground is reserved for soil restoration.';
  if (village.roads.some(([rx,ry])=>occupies({kind,x,y},rx,ry))) return 'Keep roads clear. Choose a plot beside the road.';
  if(batteryCells(village).some(([a,b])=>occupies({kind,x,y},a,b)))return 'Move the recovered battery or its reserved destination before building here.';
  if(reservations.some(b=>Math.abs(b.x-x)<radius+(['shed','square','solar_farm','orchard','goat_pasture'].includes(b.kind)?2:1)&&Math.abs(b.y-y)<radius+(['shed','square','solar_farm','orchard','goat_pasture'].includes(b.kind)?2:1)))return 'That plot is reserved for a building move.';
  if (sourceConflicts(village,kind,x,y)) return 'Keep the local resource site accessible.';
  if(village.pipes?.lines.some(p=>p.phase!=='retired'&&p.plan.cells.some(([a,b])=>occupies({kind,x,y},a,b))))return 'Remove the utility line on this plot before building here.';
  return '';
}

export function milestones(before, after) {
  if (!before) return [];
  const messages = [];
  for (const b of after.buildings) {
    if (b.progress >= 100 && before.buildings.some(old => old.id === b.id && old.progress < 100) && !(before.building_jobs||[]).some(j=>j.building===b.id)) messages.push({ kind: 'building', building: b.kind, x: b.x, y: b.y });
  }
  for(const j of before.building_jobs||[]){
    if((after.building_jobs||[]).some(a=>a.building===j.building))continue;
    const b=after.buildings.find(b=>b.id===j.building);
    if(!b||(j.action==='move'&&j.destination&&b.x===j.destination[0]&&b.y===j.destination[1]))messages.push({kind:'building_work',action:j.action});
  }
  if (after.harvests > before.harvests) messages.push({ kind: 'harvest' });
  after.progress.completed.forEach((done, i) => {
    if (done && !before.progress.completed[i]) messages.push({ kind: 'quest', quest: i });
  });
  (after.progress.later_completed || []).forEach((done,i)=> {
    if(done && !before.progress.later_completed?.[i])messages.push({kind:'quest',quest:i+4});
  });
  if (after.progress.friendships.some((value, i) => value > 0 && !before.progress.friendships[i])) messages.push({ kind: 'friendship' });
  return messages;
}

export function movePlacementReason(v,id,x,y){
  const b=v.buildings.find(b=>b.id===id);
  if(!b)return 'Building not found.';
  if(b.x===x&&b.y===y)return 'Choose a different plot for the move.';
  return placementReason({...v,buildings:v.buildings.filter(other=>other.id!==id),building_jobs:(v.building_jobs||[]).filter(j=>j.building!==id)},b.kind,x,y);
}
