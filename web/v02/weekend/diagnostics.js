import {BUILD_INFO} from './build-info.js';

// Bounded, read-only observations: keep the lead-up to a stall without copying
// the whole village every frame or changing resident decisions.
export function createDiagnostics({now=()=>performance.now(),limit=120}={}) {
  const samples=[],errors=[];
  let last=-Infinity;
  return {
    observe(state){
      const at=now();if(at-last<1000)return;last=at;
      samples.push({atMs:at,time:state.time,people:state.people.map(r=>({
        id:r.id,x:r.x,z:r.z,action:r.action,job:r.job,operation:r.operation,
        linkJob:r.linkJob,target:r.target,walk:r.walk,work:r.work,cargo:r.cargo,
        needTask:r.needTask,needBlocked:r.needBlocked,tentPhase:r.tentPhase,
        sleepUntil:r.sleepUntil,outsideWork:r.outsideWork,energy:r.energy,needs:r.needs,
      }))});
      // Detach nested paths, cargo and task objects from the live simulation.
      samples[samples.length-1]=JSON.parse(JSON.stringify(samples.at(-1)));
      if(samples.length>limit)samples.shift();
    },
    error(kind,error){errors.push({kind,atMs:now(),message:String(error?.message??error),stack:error?.stack??null});if(errors.length>30)errors.shift();},
    report(state,context={}){
      return JSON.stringify({format:'solar-friends-diagnostics',version:1,capturedAt:new Date().toISOString(),build:BUILD_INFO,
        context,history:{cadence:'At most once per real second while the page runs',samples,errors},state},null,2);
    },
  };
}

export async function copyDiagnostics(text,{clipboard=navigator.clipboard,document:doc=document}={}){
  try{await clipboard.writeText(text);return true;}catch{}
  // Clipboard permission may be unavailable in embedded or non-secure pages.
  const input=doc.createElement('textarea');input.value=text;input.style.cssText='position:fixed;left:-10000px;top:0';doc.body.append(input);input.select();
  try{return !!doc.execCommand('copy');}catch{return false;}finally{input.remove();}
}
