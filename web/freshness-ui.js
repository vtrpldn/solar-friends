const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>`Day ${Math.floor(t/1440)+1} · ${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
export function expiryNote(lots,enabled){
  if(!enabled||!lots?.length)return '';
  return `Next food expires ${time(Math.min(...lots.map(l=>l.expires)))}`;
}
export function freshnessWarning(s){
  const f=s.environment.economy.freshness;if(!f?.enabled)return '';
  const due=f.due_within_day.map((n,i)=>n?`${n} ${s.environment.economy.materials[i].name.toLowerCase()}`:'').filter(Boolean);
  return due.length?`Use within a day: ${due.join(' · ')}. Open Keeping food fresh for dates.`:'';
}
export function freshnessMarkup(s){
  const f=s.environment.economy.freshness;if(!f)return '';
  if(!f.enabled)return '<p>Food does not spoil in Sandbox. Neighbours still use older portions first.</p>';
  const names=s.environment.economy.materials,losses=f.expired.map((n,i)=>n?`${n} ${names[i].name.toLowerCase()}`:'').filter(Boolean);
  return '<p>Neighbours use the oldest reachable food first. Moving food or cancelling a pot keeps its original age.</p>'+f.lifetimes.map(l=>`<p><b>${escape(names[l.material].name)}</b> · ${l.minutes/1440} game days from harvest, cooking or receipt.<br>${f.next_expiry[l.material]==null?'None waiting to be used.':`${f.due_within_day[l.material]?`${f.due_within_day[l.material]} to use within a day · `:''}Next expiry ${time(f.next_expiry[l.material])}.`}</p>`).join('')+`<p>${losses.length?`Spoiled so far: ${escape(losses.join(' · '))}.`:'No food has spoiled.'} Stored goods, carried loads and committed pots share these dates. Keep modest reserves; grow, cook or buy more when needed.</p>`;
}
