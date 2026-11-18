import {installedProjectMaterials} from './project-materials.js';
// Dismantling conserves ownership: one project becomes recovered stock plus waste.
export function removalYield(p,defs,recipes,mode){
 const items=installedProjectMaterials(p,defs);
 for(const recipe of [p.solarUpgrade&&'solar_upgrade',p.coldStorage&&'cold_storage'])if(recipe)for(const [id,n]of Object.entries(recipes[recipe].input))items[id]=(items[id]||0)+n;
 if(p.key==='goat-pasture-empty'&&p.stocked)items.goats=(items.goats||0)+2;
 const recovered={},lost={};
 for(const [id,n]of Object.entries(items)){
  const living=['goats','hens','bees'].includes(id);
  const factor=living||p.work===0?1:mode==='salvage'?.5:0;
  recovered[id]=Math.floor(n*factor);lost[id]=n-recovered[id];
 }
 return {recovered,lost};
}
export function requestRemoval(s,id,mode,defs,recipes){
 const p=s.projects.find(p=>p.id===id);
 if(!p||defs[p.key].natural||!['salvage','demolish'].includes(mode))return 'Choose a constructed building.';
 if(p.cultivation?.beds.some(b=>['planted','growing','harvestable'].includes(b.stage)))return 'Clear or harvest the standing crops before removing this site.';
 if(p.removal)return 'Resident dismantling is already queued.';
 if(p.pendingMaterials)return 'Wait for the purchased supplies to arrive before dismantling.';
 if(s.operations?.some(o=>!o.done&&o.site===id))return 'Finish the active batch or water job first.';
 if(s.people.some(r=>r.restSite===id&&r.tentPhase))return 'Wait until everyone has left this building.';
 if(s.people.some(r=>r.job===id&&r.cargo))return 'Wait for the current material delivery to finish.';
 p.removal={mode,work:0,required:Math.max(30,defs[p.key].work*(mode==='salvage'?.3:.1)),status:'Waiting for a resident'};
 delete p.repeat;
 for(const r of s.people)if(r.job===id){r.job=null;r.workSpot=null;r.target=null;r.walk=[];}
 return '';
}
export function removalStep(s,r,dt,api){
 if(r.cargo||r.operation||r.outsideWork)return false;
 const p=s.projects.find(p=>p.removal&&!s.people.some(a=>a!==r&&a.removalJob===p.id&&!a.needTask&&!a.tentPhase&&a.energy>=25));if(!p)return false;
 const job=p.removal;
 if(s.people.some(a=>a.restSite===p.id&&a.tentPhase)){job.status='Waiting for residents to leave';return false;}
 if(job.work>=job.required && job.mode!=="move" && job.status==="Make storage space for recovered materials before removal"){
  const recovered=removalYield(p,api.defs,api.recipes,job.mode).recovered;
  if(api.stored(s)+Object.values(recovered).reduce((a,b)=>a+b,0)>api.capacity({...s,projects:s.projects.filter(a=>a!==p)})){if(r.removalJob===p.id)delete r.removalJob;return false;}
 }
 const spot=api.workSpot(s,r,p);if(!spot){job.status='Needs an accessible work position';return false;}
 for(const other of s.people)if(other!==r&&other.removalJob===p.id)delete other.removalJob;
 r.removalJob=p.id;r.job=null;r.action='build';
 if(!api.go(s,r,spot))return true;
 job.status=job.mode==='move'?'Preparing and relocating the structure':job.mode==='salvage'?'Carefully recovering materials':'Dismantling';
 const labor=Math.min(dt,job.required-job.work);job.work+=labor;r.work+=labor;r.energy=Math.max(0,r.energy-labor*.12);
 if(job.work<job.required)return true;
 if(job.mode==='move'){
  const t=job.target,error=api.placement(s,p.key,t.x,t.z,p.id,t.rotation);if(error){job.status=error;return true;}
  api.grade(s,p.key,t.x,t.z,t.rotation);Object.assign(p,t);delete p.removal;
  for(const person of s.people)if(person.removalJob===p.id){delete person.removalJob;person.action='idle';person.walk=[];person.target=null;}
  api.invalidate(s);api.say(s,`${api.defs[p.key].name} relocated by residents.`);return true;
 }
 const {recovered,lost}=removalYield(p,api.defs,api.recipes,job.mode);
 const remaining={...s,projects:s.projects.filter(a=>a.id!==p.id)};
 if(api.stored(s)+Object.values(recovered).reduce((a,b)=>a+b,0)>api.capacity(remaining)){job.status='Make storage space for recovered materials before removal';return true;}
 for(const [id,n]of Object.entries(recovered))if(n)api.change(s,id,n);
 const sys=s.infrastructure,node=sys?.nodes[p.id];
 if(node){sys.account.waterLost+=node.water.reduce((a,b)=>a+b,0);sys.account.curtailed+=node.charge;delete sys.nodes[p.id];sys.links=sys.links.filter(l=>l.from!==p.id&&l.to!==p.id);}
 s.projects=remaining.projects;
 for(const project of s.projects)if(project.depot===p.id){delete project.depot;project.staged=0;}
 const removedOperations=new Set((s.operations||[]).filter(o=>o.site===p.id).map(o=>o.id));
 s.operations=(s.operations||[]).filter(o=>o.site!==p.id);
 for(const person of s.people)if(removedOperations.has(person.operation)){person.operation=null;person.cargo=false;person.action='idle';person.walk=[];person.target=null;}
 if(s.upkeep)s.upkeep.jobs=s.upkeep.jobs.filter(j=>j.target!==p.id);
 for(const person of s.people){if(person.home===p.id)person.home=null;if(person.restSite===p.id){person.restSite=null;person.tentPhase=null;}if(person.removalJob===p.id){delete person.removalJob;person.action='idle';person.walk=[];person.target=null;}}
 s.buildingHistory??=[];s.buildingHistory.push({time:s.time,key:p.key,mode:job.mode,recovered,lost});s.buildingHistory=s.buildingHistory.slice(-64);
 api.invalidate(s);api.say(s,`${api.defs[p.key].name} removed. Recovered materials are back in stores.`);return true;
}
export function validRemovals(s,defs,materials){
 return s.projects.every(p=>!p.removal||(['salvage','demolish','move'].includes(p.removal.mode)&&!defs[p.key].natural&&(p.removal.mode!=='move'||(p.removal.target&&Number.isInteger(p.removal.target.x)&&Number.isInteger(p.removal.target.z)&&[p.removal.target.x,p.removal.target.z].every(n=>n>=-30&&n<=93)&&[0,1,2,3].includes(p.removal.target.rotation)))&&Number.isFinite(p.removal.work)&&p.removal.work>=0&&p.removal.work<=p.removal.required&&p.removal.required===Math.max(30,defs[p.key].work*(p.removal.mode==='move'?.2:p.removal.mode==='salvage'?.3:.1))))&&
 (s.buildingHistory===undefined||(Array.isArray(s.buildingHistory)&&s.buildingHistory.length<=64&&s.buildingHistory.every(e=>defs[e.key]&&['salvage','demolish'].includes(e.mode)&&Number.isFinite(e.time)&&e.time>=0&&e.time<=s.time&&[e.recovered,e.lost].every(a=>a&&Object.entries(a).every(([id,n])=>materials[id]&&Number.isInteger(n)&&n>=0)))))&&s.people.every(r=>r.removalJob===undefined||s.projects.some(p=>p.id===r.removalJob&&p.removal));
}
