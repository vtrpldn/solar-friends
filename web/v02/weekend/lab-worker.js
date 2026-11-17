import {createWeekend,chooseCamp,PROJECTS,enableFastNavigation,tick,save,restore} from './simulation.js';
import {ensureNaturalLand} from './natural-resources.js';
import {syncInfrastructure} from './infrastructure.js';
import {LabRunner} from './lab-runner.js';
import {sameLabState,labCommand,labSample,stopReason,SAMPLE_LIMIT,STOP_CONDITIONS} from './lab-debug.js';
import {applySettings,DEFAULT_SETTINGS,validSettings,registerWorld} from './world-settings.js';
import {DAY,HOUR} from './weather.js';
let runner,samples=[],events=[],commands=[],initialState,steps=0,lastHour=-1,droppedSamples=0,stopAt=null,condition='none',replay=null,last=performance.now(),emitted=last,measuredAt=last,advanced=0,actual=0;
const event=text=>{events.push({time:runner?.state.time||0,text});if(events.length>1000)events.shift();};
function start(seed,raw,settings=DEFAULT_SETTINGS){
 if(!raw&&!validSettings(settings))throw Error('Invalid world settings.');
 let s=raw?restore(raw):createWeekend(seed);
 if(!s){if(runner)registerWorld(runner.state.landSeed,runner.state.worldSettings||DEFAULT_SETTINGS);throw Error('Lab save rejected; existing data has not been replaced.');}
 if(!raw){applySettings(s,settings);chooseCamp(s,'entrance');ensureNaturalLand(s,PROJECTS);}
 syncInfrastructure(s,PROJECTS);
 // Canonicalize a fresh start exactly like a checkpoint before recording it.
 if(!raw)s=restore(save(s));
 enableFastNavigation(s);runner=new LabRunner(s,advanceTick);
 samples=[];events=[];commands=[];steps=0;lastHour=-1;droppedSamples=0;stopAt=null;condition='none';replay=null;initialState=save(s);actual=0;advanced=0;last=measuredAt=performance.now();
 event(raw?'Loaded isolated checkpoint; new evidence segment':'New story run');postMessage({type:'notice',text:raw?'Checkpoint loaded. A new evidence segment starts here.':'New story run ready.'});record();
}
function record(){
 const hour=Math.floor(runner.state.time/HOUR);if(hour===lastHour)return;lastHour=hour;
 samples.push(labSample(runner.state));if(samples.length>SAMPLE_LIMIT){samples.shift();droppedSamples++;}
}
function pause(reason){runner.paused=true;stopAt=null;event(reason);postMessage({type:'notice',text:reason});}
function replayCommands(){
 while(replay&&replay.index<replay.commands.length&&replay.commands[replay.index].tick===steps){
  const c=replay.commands[replay.index++];let result;
  try{result=labCommand(runner.state,c.action)||'accepted';}catch(e){pause(`Replay rejected order ${replay.index}: ${e.message}`);replay=null;return;}
  commands.push({...c});
  if(result!==c.result){pause(`Replay diverged at order ${replay.index}: ${result}`);replay=null;return;}
 }
 if(replay&&steps>=replay.endTick){pause(sameLabState(runner.state,replay.expected)?'Replay completed: final state matches the export.':'Replay completed with a final-state mismatch. Check engine changes and the exported evidence.');replay=null;}
}
function advanceTick(s,dt){
 tick(s,dt);steps++;record();
 if(replay){replayCommands();return;}
 const reason=stopReason(s,condition);
 if(reason)pause(reason);else if(stopAt!==null&&steps>=stopAt)pause('Requested interval completed.');
}
function snapshot(){if(runner)postMessage({type:'state',state:runner.state,paused:runner.paused,speed:runner.speed,actual,backlog:runner.debt,condition,replaying:!!replay,stopAt,steps,telemetry:samples.slice(-240).map(({time,day,money,water,food,needs})=>({time,day,money,water,food,needs})),sampleCount:samples.length,droppedSamples,commandCount:commands.length,recentOrders:commands.slice(-12)});}
function importReplay(report){
 if(report?.version!==2||report.step!==.1||!Number.isSafeInteger(report.endTick)||report.endTick<0||!Array.isArray(report.commands)||report.commands.length>10000||typeof report.initialState!=='string')throw Error('Choose a version 2 lab evidence export.');
 if(!report.state||report.state.version!==2||!Number.isFinite(report.state.time))throw Error('Replay final state is invalid.');
 let previous=0;
 for(const c of report.commands){if(!Number.isSafeInteger(c.tick)||c.tick<previous||c.tick>report.endTick||!c.action||typeof c.action.type!=='string'||typeof c.result!=='string')throw Error('Invalid replay order history.');previous=c.tick;}
 start(0,report.initialState);replay={commands:report.commands,index:0,endTick:report.endTick,expected:report.state};replayCommands();event('Replay loaded; resume to replay recorded orders.');
}
onmessage=({data:m})=>{try{
 if(m.type==='new')start(m.seed,undefined,m.settings);
 else if(m.type==='load')start(0,m.raw);
 else if(m.type==='replay')importReplay(m.report);
 else if(!runner)throw Error('Start a lab village first.');
 else if(m.type==='pause')runner.paused=!runner.paused;
 else if(m.type==='speed'){if(![1,4,16,32,64,128,256,512,1024].includes(m.value))throw Error('Unsupported speed');runner.speed=m.value;runner.debt=0;}
 else if(m.type==='stop-condition'){if(!STOP_CONDITIONS.includes(m.value))throw Error('Unknown pause condition');condition=m.value;}
 else if(m.type==='run-for'){
  if(replay)throw Error('Finish the replay before scheduling a new interval.');
  if(!Number.isFinite(m.days)||m.days<=0||m.days>365)throw Error('Choose an interval greater than zero and at most 365 days.');
  stopAt=steps+Math.ceil(m.days*DAY/.1);runner.debt=0;runner.paused=false;
 }
 else if(m.type==='save')postMessage({type:'save',raw:save(runner.state),silent:m.silent});
 else if(m.type==='export')postMessage({type:'export',report:{version:2,seed:runner.state.landSeed,step:.1,initialState,endTick:steps,commands,samples,droppedSamples,events,state:runner.state}});
 else {
  if(replay)throw Error('Orders are disabled during replay. Load a checkpoint to branch the run.');
  if(commands.length>=10000)throw Error('Order history is full. Export evidence, then save/load to start a new segment.');
  const result=labCommand(runner.state,m)||'accepted';commands.push({tick:steps,time:runner.state.time,action:m,result});
  event(`${m.type}: ${result}`);postMessage({type:'notice',text:result==='accepted'?'Order accepted.':result,action:m.type,state:runner.state});
 }
 snapshot();
}catch(e){postMessage({type:'notice',text:e.message,action:m.type,state:runner?.state});}};
function loop(){const now=performance.now(),elapsed=(now-last)/1000;last=now;
 if(runner){try{advanced+=runner.advance(elapsed,24);}catch(e){pause(`Simulation error: ${e.message}. Export evidence to inspect the run.`);}
 if(now-measuredAt>=1000){actual=advanced/((now-measuredAt)/1000);advanced=0;measuredAt=now;}
 if(now-emitted>=500){snapshot();emitted=now;}}
 // A nested timer adds a delay between slices even when a full tick is already due.
 if (runner && !runner.paused && runner.debt >= .1 && globalThis.scheduler?.postTask) {
   scheduler.postTask(loop);
 } else {
   setTimeout(loop, 0);
 }
}loop();
