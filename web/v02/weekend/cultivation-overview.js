import {CROPS,farmJobError,harvestExpired} from './cultivation.js';
import {configureBed,queueBedJob} from './simulation.js';

export function configureCultivation(s,p,settings){
 const result={updated:0,skipped:0};
 for(const b of p.cultivation.beds){
  if(configureBed(s,p.id,b.id,settings))result.skipped++;
  else result.updated++;
 }
 return result;
}

export function queueCultivation(s,p,action){
 const result={queued:0,skipped:0,errors:new Set()};
 for(const b of p.cultivation.beds){
  if(farmJobError(s,p,b,action)){result.skipped++;continue;}
  const error=queueBedJob(s,p.id,b.id,action);
  if(error){result.skipped++;result.errors.add(error);}else result.queued++;
 }
 return result;
}

export function renderCultivationOverview({content,s,p,changed,message,inspect,feedback}){
 const beds=p.cultivation.beds;
 const stages={expired:'Harvest expired',failed:'Crop failed',planted:'Planting',unprepared:'Unworked soil',prepared:'Ready to plant',growing:'Growing',harvestable:'Ready to harvest',harvested:'Harvest complete'};
 const count=stage=>beds.filter(b=>(harvestExpired(b,s.time)?'expired':b.stage)===stage).length;
 const busy=b=>(s.operations||[]).some(o=>!o.done&&o.site===p.id&&o.farm?.bed===b.id);
 const editable=b=>!busy(b)&&['unprepared','prepared','harvested'].includes(b.stage);
 const planting=beds.filter(editable),care=beds.filter(b=>!busy(b));
 const common=(items,key)=>items.length&&items.every(b=>b[key]===items[0][key])?String(items[0][key]):'';
 const options=(items,key,choices)=>`<option value="" disabled>${items.length?'Mixed — choose for all':'No available beds'}</option>`+choices.map(([value,label])=>`<option value="${value}" ${common(items,key)===String(value)?'selected':''}>${label}</option>`).join('');
 content.innerHTML=`<section class="farm-overview"><div class="farm-overview-heading"><div><h3>Whole ${p.key==='field'?'field':p.key==='garden'?'garden':'greenhouse'}</h3><span class="farm-area">${beds.length} beds · ${beds.reduce((n,b)=>n+b.w*b.d,0).toFixed(1)} m² cultivated</span></div><span class="farm-stage">${beds.filter(busy).length} busy</span></div>
 <div class="farm-stage-list">${Object.entries(stages).filter(([stage])=>count(stage)).map(([stage,label])=>`<div><span>${label}</span><strong>${count(stage)}</strong></div>`).join('')}</div>
 <p class="farm-intro">Manage this entire planting area. Residents work through queued beds as they become available. ${s.autoBuy===false?'Auto-buy is off; planting needs seeds in stores.':'Missing seeds are bought automatically, with collection costs. Planting starts after they arrive.'}</p><div id="farm-bulk-actions"></div><p id="farm-feedback" role="status"></p></section>
 <section class="farm-settings"><h4>Planting & care</h4><p class="farm-intro">Crop and spacing apply to ${planting.length} empty, available beds. Growing crops and busy beds stay unchanged.</p>
 <div class="farm-control-pair"><label>Crop<select id="farm-crop" ${planting.length?'':'disabled'}>${options(planting,'crop',Object.entries(CROPS).map(([id,c])=>[id,c.name]))}</select></label><label>Spacing<select id="farm-density" ${planting.length?'':'disabled'}>${options(planting,'density',[[.5,'Wide'],[1,'Standard'],[1.5,'Dense']])}</select></label></div>
 <label class="farm-check"><input id="farm-irrigation" type="checkbox" ${care.length?'':'disabled'}><span>Irrigate from village supplies</span></label>
 <label class="farm-residues-label">After harvest<select id="farm-residues" ${care.length?'':'disabled'}>${options(care,'residues',[['leave','Leave residues as cover'],['collect','Collect for compost']])}</select></label>
 <p class="farm-care-note">Care settings apply to ${care.length} beds without queued work.</p></section>
 <details class="farm-details"><summary>Soil care & clearing</summary><div id="farm-secondary-actions"></div></details>
 <button id="farm-inspect-bed" class="farm-inspect">Inspect an individual bed</button>`;
 content.querySelector('#farm-feedback').textContent=feedback||'';
 for(const id of ['farm-crop','farm-density'])content.querySelector('#'+id).dataset.disabledReason='No empty, available beds. Finish queued work or clear existing crops before changing planting settings.';
 for(const id of ['farm-irrigation','farm-residues'])content.querySelector('#'+id).dataset.disabledReason='All beds have queued work. Wait for that work to finish before changing care settings.';
 const irrigation=content.querySelector('#farm-irrigation');irrigation.checked=common(care,'irrigation')==='true';irrigation.indeterminate=care.length>0&&common(care,'irrigation')==='';
 for(const [id,key]of [['farm-crop','crop'],['farm-density','density'],['farm-irrigation','irrigation'],['farm-residues','residues']])content.querySelector('#'+id).onchange=e=>{
  const value=key==='irrigation'?e.target.checked:key==='density'?Number(e.target.value):e.target.value;
  const result=configureCultivation(s,p,{[key]:value});e.target.blur();message(`Updated ${result.updated} beds.${result.skipped?` ${result.skipped} busy or planted beds unchanged.`:''}`);changed();
 };
 for(const [action,label,secondary]of [['prepare','Prepare soil'],['plant','Plant'],['harvest','Harvest'],['amend','Apply compost',true],['collect','Collect residues',true],['clear','Clear crops',true]]){
  const available=beds.filter(b=>!farmJobError(s,p,b,action)).length;
  if(!available)continue;
  const button=document.createElement('button');button.dataset.farmAction=action;button.textContent=`${label} · ${available} bed${available===1?'':'s'}`;button.className=secondary?(action==='clear'?'farm-danger':''):'farm-primary';
  button.onclick=()=>{
   if(action==='clear'&&!confirm(`Clear standing crops in ${available} beds? Only recoverable residues will remain.`))return;
   const result=queueCultivation(s,p,action);
   message(`${label}: ${result.queued} beds queued.${result.skipped?` ${result.skipped} beds skipped.`:''}${result.errors.size?` ${[...result.errors].join(' ')}`:''}`);changed();
  };
  content.querySelector(secondary?'#farm-secondary-actions':'#farm-bulk-actions').append(button);
 }
 if(!content.querySelector('#farm-bulk-actions').children.length)content.querySelector('#farm-bulk-actions').textContent='No planting or harvest work needed right now.';
 content.querySelector('#farm-inspect-bed').onclick=inspect;
}
