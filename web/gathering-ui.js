const activePhases=['preparing','ready','serving'];
export function gatheringInfo(v){
  const p=v.progress.gathering_delivery,active=!!p&&activePhases.includes(p.phase);
  const portions=p?.portions??Object.keys(v.skills.people).length,required=p?.required_guests??Math.ceil(portions*3/5),solo=portions===1;
  const b=p&&v.buildings.find(b=>b.id===p.building);
  const name=b?`${b.kind==='square'?'Shared table':'Kitchen'} ${b.id+1}`:'the shared table';
  const stored=p&&v.logistics?.stores.find(s=>s.id===p.store);
  const arrived=Math.min(portions,stored?.items[17]||0);
  const incoming=p?v.logistics?.shipments.filter(h=>h.to===p.store&&h.material===17).reduce((n,h)=>n+h.amount,0)||0:0;
  const count=solo?`${v.progress.gatherings} ${v.progress.gatherings===1?'meal':'meals'} shared`:`${v.progress.gatherings} ${v.progress.gatherings===1?'gathering':'gatherings'} shared`;
  const deadline=p?`Day ${1+Math.floor(p.deadline/1440)} · 18:00`:'';
  const meals=`${portions} prepared meal${solo?'':'s'}`;
  let summary=`${count}. Set aside ${meals} for the shared table; delivery has until the following evening.`;
  if(p?.phase==='preparing')summary=`${name}: ${arrived}/${portions} meals delivered${incoming?` · ${incoming} on the way`:''}. ${stored?.blocker||`Residents bring portions when they have the energy. Delivery deadline: ${deadline}.`}`;
  if(p?.phase==='ready')summary=`${meals} ${solo?'is':'are'} at ${name}. Waiting for ${required} fed, rested resident${required===1?'':'s'} to be in the village, between 08:00 and 18:00.`;
  if(p?.phase==='serving')summary=`${name}: ${v.progress.attended.length} ${solo?'resident':v.progress.attended.length===1?'neighbour':'neighbours'} arrived · ${Math.max(0,Math.ceil(v.progress.gathering_until-v.minutes))} minutes left. ${p.spent_after==null?`Meals wait for ${required} arrival${required===1?'':'s'}.`:`${portions} delivered meal${solo?'':'s'} shared.`}`;
  if(p?.phase==='cancelled'&&p.spent_after==null&&p.finished>=p.deadline)summary='The delivery deadline passed. Unserved meals remain available. Add a road from the pantry or move the table closer, then try again.';
  else if(p?.phase==='cancelled')summary=`Gathering cancelled. ${p.spent_after==null?'Unserved meals remain stored or in recoverable cargo.':'Meals already shared stay consumed.'}`;
  if(p?.phase==='failed'&&p.attended.length>=required&&p.spent_after==null)summary='Residents reached the table, but the planned fresh meals were no longer available. Prepare fresh portions and try again tomorrow.';
  else if(p?.phase==='failed')summary='Too few residents reached the shared table. Unserved meals remain available; try a closer table or another time tomorrow.';
  if(p?.phase==='complete')summary=solo?`${count}. A quiet meal at the table and time for yourself.`:`${count}. Neighbours ate the delivered meals and strengthened their friendships.`;
  return {active,preparing:active&&p.phase!=='serving',summary,name,portions,required,solo};
}
