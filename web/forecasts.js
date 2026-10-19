const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>`Day ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n/100);

// Configuration changes invalidate a projection. Ordinary progress, deliveries
// and completed requests are already part of its conditional replay.
export function forecastPlan(s){
  const v=s.village;
  return JSON.stringify({seed:v.simulation.seed,mode:v.mode,roads:v.roads,
    buildings:v.buildings.map(b=>[b.id,b.kind,b.x,b.y]),
    projects:v.economy.projects.map(p=>[p.building,p.recipe,p.priority,p.paused]),
    sources:v.economy.sources.map(p=>[p.material,p.x,p.y,p.active,p.auto_replant]),
    pipes:v.pipes?.lines.map(p=>[p.id,p.plan.kind,p.plan.from,p.plan.to,p.priority,p.paused,['removing','retired'].includes(p.phase)]),
    jobs:v.economy.outside_jobs,preferences:v.workforce.preferences,learning:v.skills?.enabled,
    production:[v.production?.targets,v.production?.sites.filter(s=>s.paused).map(s=>s.id)],
    restoration:v.restoration?.map(j=>[j.id,j.x,j.y,j.size,j.cancelled]),
    requests:s.residents.map(r=>[r.help?.id,r.help?.phase==='cancelled']),
    orders:v.economy.orders.map(o=>[o.id,o.items,o.pickup_by,o.status==='cancelled']),
    targets:v.logistics?.stores.filter(p=>p.owner.kind==='warehouse'&&p.target.some(Boolean)).map(p=>[p.owner.id,p.target]),
    food:[v.supplies.feed_hens,v.supplies.use_eggs,v.circular.use_biogas],
    maintenance:[v.maintenance?.enabled,v.maintenance?.automatic,v.maintenance?.jobs.map(j=>[j.id,j.paused,j.cancelled])],
    tools:v.progress.use_tools,agreements:[v.situations.active?.resident,v.situations.active?.opened,v.situations.active?.response,v.situations.active?.agreed],
  });
}

export function createProjectForecasts({checkpoint,refresh}){
  let worker=null,timer=null,basis=null,report=null,error='',stale=false,generation=0;
  function stop(){generation++;worker?.terminate();worker=null;clearTimeout(timer);timer=null;}
  function invalidate(){
    if(!basis)return;
    stop();stale=true;
  }
  function observe(s){
    if(!basis||stale)return false;
    if(s.village.minutes<basis.minute||forecastPlan(s)!==basis.plan){invalidate();return true;}
    return false;
  }
  function start(){
    stop();
    const saved=checkpoint(),s=JSON.parse(saved);
    basis={minute:s.village.minutes,plan:forecastPlan(s)};
    report=null;error='';stale=false;
    const token=generation;
    try{
      worker=new Worker(new URL('./forecast-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{if(token!==generation)return;report=data.report||null;error=data.error||'';stop();refresh();};
      worker.onerror=()=>{if(token!==generation)return;error='The forecast could not run. Try again.';stop();refresh();};
      worker.postMessage({checkpoint:saved,days:7});
      timer=setTimeout(()=>{if(token!==generation)return;error='The forecast took too long. Try again when the village has fewer unfinished projects.';stop();refresh();},60000);
    }catch{error='The forecast could not start. Try again.';stop();}
    refresh();
  }
  function reset(){stop();basis=null;report=null;error='';stale=false;}
  function cancel(){reset();refresh();}
  function summary(){
    let result='Forecast the next seven days with our current plans and work schedules.';
    if(stale)result='Plans changed. Recalculate to include the current priorities, routes and work schedules.';
    else if(error)result=error;
    else if(worker)result='Considering our routes, supplies and workday… You can keep playing or cancel.';
    else if(report)result=`Projected shared fund at ${time(report.through)}: ${money(report.funds_projected)}.`;
    return {pending:!!worker,label:worker?'Forecasting…':basis?'Recalculate forecast':'Forecast workweek',status:result,
      assumptions:report&&!stale&&!error?`From ${time(report.based_at)}. Assumes current plans and shifts, paid supplies, normal breaks and no new purchases. Dates are conditional and rounded to half-hour windows.`:''};
  }
  function render(p){
    const entry=report?.projects.find(q=>q.building===p.building);
    if(!entry||stale||worker||error)return '';
    const result=entry.window?`If current plans hold: ${time(entry.window[0])} to ${time(entry.window[1])}.`:entry.blocker;
    return `<p class="project-forecast-result"><b>Work outlook</b> ${escape(result)}</p>`;
  }
  return {start,cancel,reset,invalidate,observe,summary,render};
}
