export const residentIsAway=r=>r.trip?.phase==='away';
export function residentIsIndoors(r,village){
  return !r.trip && r.task==='sleep' && Math.hypot(r.target_x-r.x,r.target_y-r.y)<=.1
    && !!village.buildings.filter(b=>b.kind==='home'&&b.progress>=100)[Math.floor(r.id/3)];
}
export const residentVisible=(r,village)=>!residentIsAway(r)&&!residentIsIndoors(r,village);
const clock=minutes=>{const m=Math.floor(minutes)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
export function tripLabel(r){
  const trip=r.trip;if(!trip)return null;
  if(trip.phase==='returning')return trip.purpose==='pickup'?'Back with town supplies':'Returning to the village';
  if(trip.phase==='leaving')return trip.purpose==='pickup'?'Walking to the shared pickup truck':trip.purpose==='work'?'Leaving for an outside job':'Leaving for an overnight stay';
  if(trip.purpose==='pickup')return `Driving to collect supplies · back at ${clock(trip.return_at)}`;
  return `${trip.purpose==='work'?'Working off-site':'Sleeping off-site'} · back at ${clock(trip.return_at)}${trip.purpose==='overnight'&&r.sleep?.duration_minutes?` · ${r.sleep.duration_minutes/60}h rest`:''}`;
}

export function sleepLabel(r){
  if(Math.hypot(r.target_x-r.x,r.target_y-r.y)>.08 || !r.sleep?.started_at)return 'Heading to bed';
  return `Sleeping · wakes at ${clock(r.sleep.wake_at)} · ${r.sleep.duration_minutes/60}h rest`;
}
