import { ITEMS } from './items.js';
// Wear is active-use seconds; one unit needs repair after 13.5 game work-hours.
export const EQUIPMENT_LIFE = 1800;
const SOAP_LIFE = 10 * 60 / .45;
export function equipmentState(s) {
  return s.equipment ??= {wear:{},loans:{},soapLeft:0};
}
export function equipmentSummary(s, id) {
  const e=equipmentState(s), owned=s.materials[id]||0;
  const wear=e.wear[id]||0, broken=Math.min(owned,Math.floor(wear/EQUIPMENT_LIFE));
  const repairing=(s.operations||[]).filter(o=>!o.done&&o.recipe===`repair_${id}`).length;
  const borrowers=Object.entries(e.loans).filter(([,loan])=>loan.item===id).map(([person])=>s.people.find(r=>r.id===person)?.name || person);
  return {owned,broken,repairing,borrowers,available:Math.max(0,owned-Math.max(broken,repairing)-borrowers.length),wear};
}
export function protectedEquipment(s,id) {
  if (!ITEMS[id]?.durable) return 0;
  const status=equipmentSummary(s,id);
  // Retain worn units as well as borrowed tools; sales cannot erase repair debt.
  return Math.min(status.owned,Math.ceil(status.wear/EQUIPMENT_LIFE)+status.borrowers.length);
}
export function releaseEquipment(s) {
  const e=equipmentState(s);
  for (const [id,loan] of Object.entries(e.loans)) {
    const r=s.people.find(p=>p.id===id);
    const active=loan.task.startsWith('job:')
      ? r?.job===Number(loan.task.slice(4)) && s.projects.some(p=>p.id===r.job && p.work<loan.total)
      : r?.operation===Number(loan.task.slice(3)) && s.operations?.some(o=>o.id===r.operation&&!o.done);
    if (!active || r.needTask || r.tentPhase || r.sleepUntil || r.energy<25 || ['rest','town','idle','blocked'].includes(r.action)) delete e.loans[id];
  }
}
export function useEquipment(s,r,item,task,dt,total=0) {
  if (!item || !ITEMS[item]?.durable) return 1;
  const e=equipmentState(s);
  if(e.loans[r.id]?.task!==task || e.loans[r.id]?.item!==item) delete e.loans[r.id];
  if(!e.loans[r.id]) {
    if(!equipmentSummary(s,item).available)return 1;
    e.loans[r.id]={item,task,total};
  }
  if(item==='cleaning-kit') {
    if(e.soapLeft<=0) {
      if(!(s.materials.soap>0)) {delete e.loans[r.id];return 1;}
      s.materials.soap--;e.soapLeft=SOAP_LIFE;
    }
    e.soapLeft=Math.max(0,e.soapLeft-dt);
  }
  if(s.mode!=='sandbox')e.wear[item]=(e.wear[item]||0)+dt;
  // If a unit wears out, its borrower returns it and continues basic work.
  const status=equipmentSummary(s,item);
  if(status.borrowers.length>status.owned-status.broken)delete e.loans[r.id];
  return 1.25;
}
export function productionEquipment(recipe) {
  if(recipe.equipmentRepair)return null;
  if(['garden','greenhouse','compost'].includes(recipe.kind))return 'garden-tools';
  if(['orchard','grove'].includes(recipe.kind))return 'harvest-basket';
  if(recipe.kind==='supply-5' && !recipe.output['harvest-basket'])return 'carpentry-tools';
  return null;
}
export function repairEquipment(s,id) {
  const e=equipmentState(s);
  e.wear[id]=Math.max(0,(e.wear[id]||0)-EQUIPMENT_LIFE);
}
export function validEquipment(s) {
  if(s.equipment===undefined)return true;
  const e=s.equipment;
  if(!e || !e.wear || !e.loans || !Number.isFinite(e.soapLeft) || e.soapLeft<0 || e.soapLeft>SOAP_LIFE)return false;
  return Object.entries(e.wear).every(([id,n])=>ITEMS[id]?.durable && Number.isFinite(n)&&n>=0&&n<=(s.materials[id]||0)*EQUIPMENT_LIFE+1);
}
