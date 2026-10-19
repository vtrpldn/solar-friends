import {itemIcon} from './game-ui.js';
export const farmNames={orchard:'Fruit orchard',goat_pasture:'Goat pasture',apiary:'Stingless bee apiary'};
export const farmNotes={
  orchard:'Four fruit trees establish over six moist growing days, then fruit every two. Dry roots pause growth. A tended apiary within six tiles adds two fruit per harvest. Trees stay planted after harvesting.',
  goat_pasture:'Two dairy goats need two delivered fodder and two fresh drinking water per day. A resident feeds and checks them, then collects 2–4 milk and one organic residue. Healthy goats yield more. Milk keeps for two game days; collection waits around eight stored milk. Feed and care continue while stores are full or milk production is paused. No reclaimed drinking water.',
  apiary:'A resident inspects the stingless bee colony every two days. A flowering bean or tomato garden, fruit orchard or food forest within six tiles supports honey. Twelve daylight hours yield three honey; collection waits around eight stored. Inspected hives improve nearby bean, tomato and orchard harvests. Honey keeps for 28 game days.',
};
export function updateAgricultureUI(game,state,locate){
  const report=JSON.parse(game.agriculture_report()),v=state.village,$=s=>document.querySelector(s);
  const b=v.buildings.find(b=>b.id===Number($('#building-choice').value)),plot=report.plots.find(p=>p.building===b?.id);
  $('#farm-controls').hidden=!plot;
  if(plot){
    const p=b.agriculture;
    $('#farm-active').checked=p.enabled;
    $('#farm-active-label').textContent=b.kind==='goat_pasture'?'Produce milk':b.kind==='apiary'?'Keep this hive active':'Grow and harvest fruit';
    $('#farm-status').textContent=!p.enabled&&b.kind==='goat_pasture'&&!plot.status.startsWith('Milk production paused')?`Milk production paused; daily feed and care continue. ${plot.status}`:plot.status;
    $('#farm-progress').value=plot.duration?p.growth/plot.duration*100:0;
    $('#farm-progress').setAttribute('aria-label',`${farmNames[b.kind]} growth`);
    $('#farm-notes').textContent=farmNotes[b.kind];
    $('#farm-detail').textContent=b.kind==='goat_pasture'?`Wellbeing ${Math.round(p.welfare)}% · ${plot.fodder_here} fodder and ${Math.floor(plot.fresh_water_here)} fresh water here · ${p.pending} milk waiting · ${p.harvested} collected so far.`:b.kind==='apiary'?`${plot.flowers} nearby flowering plots · ${p.pending} honey waiting · ${p.harvested} collected so far.`:`${p.fruiting?'Established trees':'Young fruit trees'} · ${plot.pollinated?'Pollinated':'No tended apiary nearby'} · ${p.pending} fruit waiting · ${p.harvested} collected so far.`;
    const workers=state.residents.filter(r=>r.task==='garden'&&r.activity_building===b.id);
    $('#farm-worker').textContent=workers.length?workers.map(r=>`${r.name}: ${Math.hypot(r.x-r.target_x,r.y-r.target_y)>.12?'on the way':'tending this plot'}`).join(' · '):plot.ready?'Neighbours handle care and collection when they have the energy. Ask someone to tend this plot below.':'Neighbours will tend this plot when it is ready. Check the care and supply status above.';
  }
  $('#farm-overview').hidden=!report.plots.length;
  $('#farm-reserves').textContent=`${report.fodder} fodder · ${report.milk} fresh milk · ${report.honey} honey. Grow fodder in a garden or buy it in Trade. Organic residues from goats can go to compost or the biodigester.`;
  const list=$('#farm-plots'),existing=[...list.querySelectorAll('button')];
  if(existing.map(b=>Number(b.dataset.farm)).join(',')!==report.plots.map(p=>p.building).join(',')){
    list.replaceChildren(...report.plots.map(plot=>{const b=v.buildings.find(b=>b.id===plot.building),button=document.createElement('button');button.className='farm-record';button.dataset.farm=b.id;button.onclick=()=>locate(b.id);button.innerHTML=`${itemIcon(b.kind==='orchard'?'food':b.kind==='apiary'?'honey':'milk')}<span><b></b><small></small></span><span aria-hidden="true">›</span>`;return button;}));
  }
  for(const button of list.children){const p=report.plots.find(p=>p.building===Number(button.dataset.farm)),b=v.buildings.find(b=>b.id===p.building);button.querySelector('b').textContent=`${farmNames[b.kind]} ${b.id+1}`;button.querySelector('small').textContent=p.status;}
  return report;
}
