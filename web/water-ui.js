const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={well:'Cistern',home:'Home',kitchen:'Kitchen',garden:'Garden',greenhouse:'Greenhouse',eco_toilet:'Ecological toilet',wetland:'Reed bed'};
export function installWaterUI({game}){
  const list=document.getElementById('local-water-stores'),summary=document.getElementById('local-water-summary');let key='';
  return {update(state){
    const report=JSON.parse(game().water_report()),v=state.village,visible=report.tanks.filter(p=>p.owner.kind!=='ground'||p.water.some(n=>n>.001));
    const name=p=>p.owner.kind==='camp'?'Arrival barrels':p.owner.kind==='ground'?'Recoverable water containers':p.owner.kind==='source'?`${v.economy.sources[p.owner.id]?.material===0?'Timber plantation':'Bamboo patch'} ${p.owner.id+1}`:`${names[v.buildings.find(b=>b.id===p.owner.id)?.kind]||'Local water'} ${p.owner.id+1}`;
    const n=x=>Number(x.toFixed(1)).toLocaleString('en'),travelling=report.trips.filter(h=>h.carrying).reduce((sum,h)=>sum+h.amount,0);
    const text=`${n(report.present[0])} fresh water · ${n(report.present[1])} irrigation · ${n(travelling)} carried. Totals include loads in transit; only delivered water can be used locally.`;
    if(summary.textContent!==text)summary.textContent=text;
    const markup=visible.map(p=>{
      const closed=p.owner.kind==='building'&&v.building_jobs.some(j=>j.building===p.owner.id);
      const incoming=report.trips.filter(h=>h.to===p.id).reduce((sum,h)=>sum+h.amount,0),reserved=report.trips.filter(h=>h.from===p.id&&!h.carrying).reduce((sum,h)=>sum+h.amount,0);
      return `<article class="storage-location source-row" data-water-container="${p.id}"><div><b>${escape(name(p))}</b><small>Plot ${n(p.x)}, ${n(p.y)}</small><p>${p.capacity[0]>0?`${n(p.water[0])} / ${n(p.capacity[0])} fresh water`:''}${p.capacity.every(c=>c>0)?' · ':''}${p.capacity[1]>0?`${n(p.water[1])} / ${n(p.capacity[1])} irrigation`:''}</p>${closed?'<small>Closed for building work; contents remain here.</small>':''}${incoming?`<small>${n(incoming)} on the way · not usable yet</small>`:''}${reserved?`<small>${n(reserved)} reserved for pickup</small>`:''}</div></article>`;
    }).join('')+report.trips.map(h=>{
      const resident=state.residents.find(r=>r.id===h.resident),from=h.from==null?'the neighbouring farm’s treated-water tap':name(report.tanks.find(p=>p.id===h.from)),to=name(report.tanks.find(p=>p.id===h.to));
      return `<p data-water-carrier="${h.resident}"><b>${escape(resident.name)}</b> · ${h.carrying?'carrying':'collecting'} ${n(h.amount)} ${h.class==='fresh'?'fresh water':'irrigation'}<br><small>${escape(from)} → ${escape(to)}</small></p>`;
    }).join('');
    if(markup!==key){key=markup;list.innerHTML=markup;}
  }};
}
