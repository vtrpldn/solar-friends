const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={well:'Cistern',home:'Home',kitchen:'Kitchen',garden:'Garden',greenhouse:'Greenhouse',eco_toilet:'Ecological toilet',wetland:'Reed bed',biodigester:'Biodigester',banana_treatment:'Banana treatment bed'};
export const liquidNames=['fresh water','irrigation','greywater','sealed sewage'];
export function waterContainerName(p,v){
  if(!p)return 'Unavailable container';
  if(p.owner.kind==='camp')return 'Arrival barrels';
  if(p.owner.kind==='service')return 'Neighbouring service point';
  if(p.owner.kind==='ground')return 'Recoverable liquid containers';
  if(p.owner.kind==='source')return `${v.economy.sources[p.owner.id]?.material===0?'Timber plantation':'Bamboo patch'} ${p.owner.id+1}`;
  return `${names[v.buildings.find(b=>b.id===p.owner.id)?.kind]||'Local container'} ${p.owner.id+1}`;
}
export function installWaterUI({game}){
  const $=id=>document.getElementById(id),n=x=>Number(x.toFixed(1)).toLocaleString('en');let keys=['',''];
  return {update(state){
    const report=JSON.parse(game().water_report()),v=state.village;
    for(const [section,indices,list,summary]of [[0,[0,1],$('local-water-stores'),$('local-water-summary')],[1,[2,3],$('local-waste-stores'),$('local-waste-summary')]]){
      const trips=report.trips.filter(h=>indices.includes(report.classes.indexOf(h.class)));
      const travelling=trips.filter(h=>h.carrying).reduce((sum,h)=>sum+h.amount,0);
      const text=indices.map(i=>`${n(report.present[i])} ${liquidNames[i]}${report.sealed[i]?` (${n(report.sealed[i])} sealed in processing)`:''}`).join(' · ')+` · ${n(travelling)} carried. Totals include owned loads and sealed batches; only delivered contents are available locally.`;
      if(summary.textContent!==text)summary.textContent=text;
      const visible=report.tanks.filter(p=>p.owner.kind!=='service'&&indices.some(i=>p.capacity[i]>0)&&(p.owner.kind!=='ground'||indices.some(i=>p.water[i]>.001||p.incoming[i]>.001||p.reserved_processing[i]>.001)));
      const markup=visible.map(p=>{
        const detail=(values,label)=>indices.filter(i=>values[i]>.001).map(i=>`<small>${n(values[i])} ${liquidNames[i]} ${label}</small>`).join('');
        return `<article class="storage-location source-row" data-${section?'waste':'water'}-container="${p.id}"><div><b>${escape(waterContainerName(p,v))}</b><small>Plot ${n(p.x)}, ${n(p.y)}</small><p>${indices.filter(i=>p.capacity[i]>0).map(i=>`${n(p.water[i])} / ${n(p.capacity[i])} ${liquidNames[i]}`).join(' · ')}</p>${!p.open?'<small>Closed for building work; contents remain here.</small>':''}${detail(p.incoming,'on the way · not usable yet')}${detail(p.reserved_pickup,'reserved for pickup')}${detail(p.reserved_processing,'spaces held for processing or returned inputs')}</div></article>`;
      }).join('')+trips.map(h=>{
        const resident=state.residents.find(r=>r.id===h.resident),from=h.from==null?'the neighbouring farm’s treated-water tap':waterContainerName(report.tanks.find(p=>p.id===h.from),v),to=waterContainerName(report.tanks.find(p=>p.id===h.to),v);
        return `<p data-${section?'waste':'water'}-carrier="${h.resident}"><b>${escape(resident?.name||'Neighbour')}</b> · ${h.carrying?'carrying':'collecting'} ${n(h.amount)} ${liquidNames[report.classes.indexOf(h.class)]}${section?' in a closed service container':''}<br><small>${escape(from)} → ${escape(to)}</small></p>`;
      }).join('')+(section?`<p>Neighbouring service point: ${n(report.external[2])} greywater · ${n(report.external[3])} sewage handed over. Off-site treatment returns no village irrigation, gas or compost.</p>${v.mode==='sandbox'?`<p>Sandbox excess disposal: ${n(report.sandbox_disposed[2])} greywater · ${n(report.sandbox_disposed[3])} sewage. Local buffers stay comfortable.</p>`:''}`:'');
      if(markup!==keys[section]){keys[section]=markup;list.innerHTML=markup;}
    }
  }};
}
