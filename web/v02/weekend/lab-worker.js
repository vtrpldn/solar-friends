import {createWeekend,chooseCamp,PROJECTS,enableFastNavigation,plan,queueProduction,repeatProduction,queueWater,queuePurification,queueSanitation,supplyRun,sellMaterial,tick,save,restore} from './simulation.js';
import {ensureNaturalLand} from './natural-resources.js';
import {syncInfrastructure} from './infrastructure.js';
import {LabRunner} from './lab-runner.js';
let runner, samples=[],events=[],lastHour=-1,last=performance.now(),emitted=last,measuredAt=last,advanced=0,actual=0;
const event=text=>{events.push({time:runner?.state.time||0,text});if(events.length>1000)events.shift();};
function start(seed,raw) {
 const s=raw?restore(raw):createWeekend(seed);
 if(!s)throw Error('Lab save rejected; existing data has not been replaced.');
 if(!raw){chooseCamp(s,'entrance');ensureNaturalLand(s,PROJECTS);}
 syncInfrastructure(s,PROJECTS);enableFastNavigation(s);runner=new LabRunner(s,tick);samples=[];events=[];lastHour=-1;event(raw?'Loaded isolated lab save':'New story run');
}
function snapshot(){if(runner)postMessage({type:'state',state:runner.state,paused:runner.paused,speed:runner.speed,actual,backlog:runner.debt});}
function record(){
 const s=runner.state,hour=Math.floor(s.time*.45/60);if(hour===lastHour)return;lastHour=hour;
 const nodes=Object.values(s.infrastructure.nodes), needs=Object.fromEntries(['hunger','bladder','bowels','hygiene','social','fun'].map(k=>[k,Math.min(...s.people.map(r=>r.needs[k]))]));
 samples.push({time:s.time,day:1+Math.floor((540+s.time*.45)/1440),money:s.money,wood:s.wood,food:s.materials.food,meals:s.materials.meals,water:nodes.reduce((n,a)=>n+a.water[0],0),gridSpent:s.infrastructure.grid.spent,energy:s.people.map(r=>+r.energy.toFixed(1)),needs,actions:s.people.map(r=>r.action),projects:s.projects.filter(p=>!p.natural).map(p=>({id:p.id,key:p.key,work:p.work,required:PROJECTS[p.key].work})),jobs:s.operations?.filter(o=>!o.done).map(o=>({site:o.site,status:o.status||o.phase}))});
 if(samples.length>2000)samples.shift();
}
onmessage=({data:m})=>{try{
 if(m.type==='new')start(m.seed);
 else if(m.type==='load')start(0,m.raw);
 else if(!runner)throw Error('Start a lab village first.');
 else if(m.type==='pause')runner.paused=!runner.paused;
 else if(m.type==='speed'){if(![1,4,16,32,64,128,256,512,1024].includes(m.value))throw Error('Unsupported speed');runner.speed=m.value;runner.debt=0;}
 else if(m.type==='save')postMessage({type:'save',raw:save(runner.state),silent:m.silent});
 else if(m.type==='export')postMessage({type:'export',report:{version:1,seed:runner.state.landSeed,step:.1,samples,events,state:runner.state}});
 else {
  const s=runner.state;let error='';
  if(m.type==='build')error=plan(s,m.key,m.x,m.z,m.rotation);
  else if(m.type==='produce')error=queueProduction(s,m.site,m.recipe);
  else if(m.type==='repeat')error=repeatProduction(s,m.site,m.recipe)?'':'Cannot repeat this job.';
  else if(m.type==='buy')error=supplyRun(s,m.material)?'':'No resident, car, storage or savings available.';
  else if(m.type==='sell')error=sellMaterial(s,m.material)?'':'Not enough surplus for one sale batch.';
  else if(m.type==='haul')error=queueWater(s,-1,m.site,'irrigation');
  else if(m.type==='purify')error=queuePurification(s,m.site);
  else if(m.type==='service')error=queueSanitation(s,m.site);
  else if(m.type==='maintain'){const n=s.infrastructure.nodes[m.site];if(!n)throw Error('No completed water facility here.');n[m.field]=!n[m.field];}
  else if(m.type==='food-policy')s.emergencyFood=s.emergencyFood===false;
  else if(m.type==='grid')s.infrastructure.grid.enabled=!s.infrastructure.grid.enabled;
  else throw Error('Unknown lab action');
  event(`${m.type} ${m.key||m.recipe||m.material||m.site||''}: ${error||'accepted'}`);postMessage({type:'notice',text:error||'Order accepted.',action:m.type,state:['sell','buy'].includes(m.type)?s:undefined});
 }
 snapshot();
}catch(e){postMessage({type:'notice',text:e.message,action:m.type,state:runner?.state});}};
function loop(){const now=performance.now(),elapsed=(now-last)/1000;last=now;
 if(runner){advanced+=runner.advance(elapsed,24);record();
 if(now-measuredAt>=1000){actual=advanced/((now-measuredAt)/1000);advanced=0;measuredAt=now;}
 if(now-emitted>=250){snapshot();emitted=now;}}
 setTimeout(loop,0);
}loop();
