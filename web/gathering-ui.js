const activePhases=['preparing','ready','serving'];
export function gatheringInfo(v){
  const p=v.progress.gathering_delivery,active=!!p&&activePhases.includes(p.phase);
  const b=p&&v.buildings.find(b=>b.id===p.building);
  const name=b?`${b.kind==='square'?'Shared table':'Kitchen'} ${b.id+1}`:'the shared table';
  const stored=p&&v.logistics?.stores.find(s=>s.id===p.store);
  const arrived=Math.min(5,stored?.items[17]||0);
  const incoming=p?v.logistics?.shipments.filter(h=>h.to===p.store&&h.material===17).reduce((n,h)=>n+h.amount,0)||0:0;
  const count=`${v.progress.gatherings} ${v.progress.gatherings===1?'gathering':'gatherings'} shared`;
  const deadline=p?`Day ${1+Math.floor(p.deadline/1440)} · 18:00`:'';
  let summary=`${count}. Plan five prepared meals for a shared table; delivery has until the following evening.`;
  if(p?.phase==='preparing')summary=`${name}: ${arrived}/5 meals delivered${incoming?` · ${incoming} on the way`:''}. ${stored?.blocker||`Neighbours bring portions during community hours. Delivery deadline: ${deadline}.`}`;
  if(p?.phase==='ready')summary=`Five meals are at ${name}. Waiting for three fed, rested neighbours to be in the village, between 08:00 and 18:00.`;
  if(p?.phase==='serving')summary=`${name}: ${v.progress.attended.toString(2).replaceAll('0','').length} neighbours arrived · ${Math.max(0,Math.ceil(v.progress.gathering_until-v.minutes))} minutes left. ${p.spent_after==null?'Meals wait for three arrivals.':'Five delivered meals shared.'}`;
  if(p?.phase==='cancelled')summary=`Gathering cancelled. ${p.spent_after==null?'Unserved meals remain stored or in recoverable cargo.':'Meals already shared stay consumed.'}`;
  if(p?.phase==='failed')summary='Too few neighbours reached the shared table. Unserved meals remain available; try a closer table or another time tomorrow.';
  if(p?.phase==='complete')summary=`${count}. Neighbours ate the delivered meals and strengthened their friendships.`;
  return {active,preparing:active&&p.phase!=='serving',summary,name};
}
