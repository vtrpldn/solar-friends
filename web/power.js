import {usesUtilities} from './sandbox-rules.js';
// The simulation owns supply and load. The renderer only consumes its snapshot.
export function buildingLighting(power, id, kind, complete = true) {
  if (!complete) return 0;
  const connection=power?.connections.find(c=>c.id===id);
  return connection?.source==='grid' || connection?.source==='roof' ? connection.light_level : kind==='streetlight'?0:1;
}
export function unlitFilter(night=1, saturation=1) {
  if(night<=0&&saturation===1)return 'none';
  return `brightness(${1-night*.35}) saturate(${(1-night*.28)*saturation})`;
}
export function lightingLayers(night, level, alpha=1) {
  const layers=[{source:'day',weight:1-night,filter:'none'},
    {source:'day',weight:night*(1-level),filter:unlitFilter()},
    {source:'night',weight:night*level,filter:'brightness(1.45)'}];
  let later=0;
  for(let i=layers.length-1;i>=0;i--){const layer=layers[i];layer.alpha=layer.weight?alpha*layer.weight/(1-alpha*later):0;later+=layer.weight;}
  return layers.filter(layer=>layer.alpha>0);
}
export function connectionLabel(connection, power) {
  if(!connection)return '';
  if(power.comfortable&&['roof','grid'].includes(connection.source))return connection.enabled?'Sandbox operating power · owned battery charge is preserved':'Lights switched off or construction unfinished';
  if(connection.source==='roof')return !connection.enabled?'Rooftop panels available after construction':power.darkness>.1&&connection.light_level<.01?'Private rooftop battery empty · lights off':'Own rooftop panels · private battery';
  if(connection.source==='solar')return connection.enabled?'Adds 6 energy/hour at midday and 36 battery capacity':'Connects after construction';
  if(connection.source==='hydro')return connection.enabled?'River flow · up to 2.3 energy/hour · 18 battery capacity':'Connects after construction';
  if(connection.source==='none')return 'No electricity needed';
  if(!connection.enabled)return 'Lights switched off or construction unfinished';
  if(connection.connected===false)return 'No local cable supply · connect a generator or recovered battery';
  if(!power.capacity)return 'Needs a solar farm or river generator';
  if(power.darkness===0)return 'Connected · lights turn on at dusk';
  return connection.light_level>=.99?'Powered by its local circuit':connection.light_level>.01?'Low charge · lights dimming':'No available circuit energy · lights off';
}
// Building identities survive cancellations; array positions do not.
export function powerConnections(state) {
  const buildings=new Map(state.village.buildings.map(b=>[b.id,b]));
  return state.environment.power.connections.filter(c=>c.source==='grid').map(c=>({...c,building:buildings.get(c.id)})).filter(c=>c.building);
}
export function updatePowerUI(state,kinds) {
  const p={...state.environment.power,comfortable:!usesUtilities(state.village)},$=id=>document.getElementById(id);
  $('power-title').textContent=!(p.farms+p.hydros)?'Shared village power':p.darkness>.1?'Light after sunset':'Charging our battery';
  $('power-summary').textContent=!(p.farms+p.hydros)?'Build a solar farm or river generator to light shared buildings and streets. Homes with rooftop panels provide their own lighting.':p.generation>p.demand?(p.stored>=p.capacity-.01?'The battery is full. Extra generation is left unused.':'Our generators are powering the village and charging its battery.'):p.stored>.01?'Stored energy is supplying the village.':'The shared battery is empty. Connected lights wait for generation.';
  $('power-charge').textContent=`${p.stored.toFixed(1)} / ${p.capacity.toFixed(0)} energy`;
  $('power-battery').max=p.capacity||1;$('power-battery').value=p.stored;
  $('power-generation').textContent=`${p.generation.toFixed(1)} / hour · solar ${p.solar_generation.toFixed(1)} + river ${p.hydro_generation.toFixed(1)}`;
  $('power-demand').textContent=`${p.demand.toFixed(1)} / hour`;
  $('power-pumps').textContent=p.pump_demand?`Active water pumps can draw up to ${p.pump_demand.toFixed(1)} energy/hour. They stop when a source is empty or its receiving buffer is full. Pause individual lines in Supplies → Water & weather.`:'';
  const loads=powerConnections(state),nightLoad=loads.filter(c=>c.enabled).reduce((sum,c)=>sum+c.load,0);
  $('power-outlook').textContent=!(p.farms+p.hydros)?'Solar farms charge in daylight; river generators produce through the night.':!nightLoad?'No shared lights are drawing power.':`${(p.stored/nightLoad).toFixed(1)} hours of full-night lighting stored for ${loads.filter(c=>c.enabled).length} connected ${loads.filter(c=>c.enabled).length===1?'building or light':'buildings and lights'}.`;
  if(p.pump_demand)$('power-outlook').textContent=`${(p.stored/(nightLoad+p.pump_demand)).toFixed(1)} hours stored at full night lighting and current pump demand. Pumps stop when buffers fill; generation can extend this.`;
  if(state.village.power.network){
    $('power-title').textContent='Village circuits';
    $('power-explanation').textContent='Residents install cables between local ports. Each route carries up to twelve energy per hour in either direction. A disconnected battery cannot supply a distant building. Solar farms generate by day; river generators run through the night. Rain boosts river flow and dry days reduce it.';
    $('power-tools-explanation').textContent='Rooftop batteries stay private. Cooking and hand tools need no shared electricity. Connected workshop tools double attended work speed and draw 1.2 energy per hour while working. Outages preserve batches; switch to hand tools to continue. Pumps draw first, then attended tools, then lighting.';
    $('power-summary').textContent='Stored energy belongs to each circuit. A charged battery only supplies connected equipment; private rooftop energy stays with its home.';
    $('power-outlook').textContent=`${loads.filter(c=>c.enabled).length} shared lights enabled · ${loads.filter(c=>c.enabled&&!c.connected).length} without a connected battery. Compare local charge and cable routes below; combined storage cannot predict every building’s running time.`;
    $('power-pumps').textContent='Pumps draw first, then attended powered tools, then lighting. Tools draw only while a resident works; the circuit cards show their possible operating demand.';
  }
  if(p.comfortable){
    $('power-title').textContent='Comfortable Sandbox power';
    $('power-summary').textContent='Operating power is free. Owned generators, charge and installed cables remain available for a later utility challenge.';
    $('power-outlook').textContent=`${(state.village.sandbox_rules?.supplied_energy||0).toFixed(1)} energy supplied freely; this is separate from physical generation and battery use.`;
    $('power-explanation').textContent='Enable Local utilities in Settings to require connected circuits and available charge. Existing lines and charge are preserved when changing this rule.';
  }
  $('power-roofs').textContent=`${p.connections.filter(c=>c.source==='roof' && c.enabled).length} ${p.connections.filter(c=>c.source==='roof' && c.enabled).length===1?'home uses its':'homes use their'} own rooftop panels and batteries.`;
  if(p.comfortable)$('power-roofs').textContent='All enabled lights have free operating power. Rooftop battery charge remains with each home.';
  const list=$('power-loads'),key=loads.map(c=>`${c.id}:${c.building.kind}`).join(',');
  if(list.dataset.key!==key){
    list.dataset.key=key;list.replaceChildren();
    for(const c of loads){
      const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),title=document.createElement('b'),detail=document.createElement('small');
      input.type='checkbox';input.dataset.powerBuilding=c.id;input.setAttribute('aria-label',`Power ${kinds[c.building.kind][0]} ${c.id+1}`);
      title.textContent=`${kinds[c.building.kind][0]} ${c.id+1}`;detail.id=`power-load-${c.id}`;text.append(title,detail);label.append(input,text);list.append(label);
    }
  }
  for(const c of loads){const b=c.building,input=list.querySelector(`[data-power-building="${c.id}"]`);input.checked=!state.village.power.disabled.includes(c.id);input.disabled=b.progress<100;$(`power-load-${c.id}`).textContent=`${c.load.toFixed(1)} energy/hour at night · ${connectionLabel(c,p)}`;}
}
