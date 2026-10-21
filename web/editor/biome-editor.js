import {planBiomeChange,regionalSpecies,suggestedReplacement} from './biome-change.js';
import {EditorMap} from './map-view.js';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=n=>Number(n.toFixed(2));
const weatherText=p=>`${p.season_days} days per season · rain ${p.wet_rain_chance}% wet / ${p.dry_rain_chance}% dry · drying ${amount(p.wet_evaporation)} / ${amount(p.dry_evaporation)} · ${p.intro_days} beginner days`;
export class BiomeEditor{
 constructor(root,{catalog,art,Game,source,change,notify}){
  this.catalog=catalog;this.Game=Game;this.source=source;this.change=change;this.notify=notify;
  root.innerHTML='<label for="creator-biome-target">Regional setting</label><select id="creator-biome-target"></select><button type="button" id="creator-biome-preview">Preview biome change</button>';
  this.select=root.querySelector('select');for(const b of catalog.biomes)this.select.append(new Option(b.name,b.id));
  this.dialog=document.getElementById('creator-biome-dialog');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Cancel biome change" data-biome-cancel>×</button><h2 id="creator-biome-change-title">Reshape our landscape</h2><p>Buildings, roads, people, supplies, goals, river and reserve locations stay in place. This changes the draft, not any saved playthrough.</p><div class="creator-biome-options"><label>Weather<select id="creator-biome-weather"><option value="destination">Use destination weather</option><option value="keep">Keep current weather</option></select></label><label>Existing regional habitats<select id="creator-biome-ground"><option value="labels">Remap habitat names, keep soil values</option><option value="keep">Keep all authored habitats and soil</option><option value="defaults">Remap and use destination soil defaults</option></select></label></div><p id="creator-biome-weather-summary"></p><div id="creator-biome-plants"></div><button type="button" id="creator-biome-suggest">Suggest plant replacements</button><p>Plant identities and positions stay in place unless you explicitly remove a group. Larger replacements may need more room.</p><p id="creator-biome-summary" role="status"></p><canvas id="creator-biome-map" aria-label="Proposed biome landscape"></canvas><p id="creator-biome-validation" role="status"></p><div class="dialog-actions"><button type="button" data-biome-cancel>Keep current landscape</button><button type="button" id="creator-biome-apply">Apply biome change</button></div>';
  this.preview=new EditorMap(this.dialog.querySelector('canvas'),art,{action:()=>{},viewChanged:()=>{}});
  root.querySelector('button').onclick=()=>this.open();
  for(const b of this.dialog.querySelectorAll('[data-biome-cancel]'))b.onclick=()=>this.dialog.close();
  this.dialog.onchange=()=>this.update();
  this.dialog.addEventListener('close',()=>this.render(this.source().definition));
  this.dialog.querySelector('#creator-biome-suggest').onclick=()=>{for(const input of this.dialog.querySelectorAll('[data-species-from]'))input.value=suggestedReplacement(input.dataset.speciesFrom,this.target,catalog)||'';this.update();};
  this.dialog.querySelector('#creator-biome-apply').onclick=()=>{
   if(!this.result||this.result.unresolved.length)return;
   const latest=source();if(latest.revision!==this.revision||latest.id!==this.project){notify('The draft changed while this preview was open. Preview it again before applying.');this.dialog.close();return;}
   const candidate=this.result.candidate;
   if(change('Change biome to '+catalog.biomes.find(b=>b.id===this.target).name,d=>{d.map=candidate.map;d.rules=candidate.rules;},{valid:true}))this.dialog.close();
  };
 }
 render(d){if(!this.dialog.open)this.select.value=d.map.biome?.id||'mata-atlantica';}
 open(){
  try{
   const {definition,revision,id}=this.source();this.original=definition;this.revision=revision;this.project=id;this.target=this.select.value;
   this.dialog.querySelector('#creator-biome-weather').value='destination';this.dialog.querySelector('#creator-biome-ground').value='labels';
   const plan=planBiomeChange(definition,this.catalog,{target:this.target});
   const options=this.catalog.nature.filter(s=>regionalSpecies(this.target).includes(s.key));
   this.dialog.querySelector('#creator-biome-plants').innerHTML=plan.groups.map(g=>`<div class="creator-field"><label>${escape(this.catalog.nature.find(s=>s.key===g.key)?.name||g.key)} · ${g.count} plants<select data-species-from="${escape(g.key)}"><option value="">Choose a replacement…</option><option value="remove">Remove these plants</option>${options.map(s=>`<option value="${escape(s.key)}">${escape(s.name)}</option>`).join('')}</select></label></div>`).join('')||'<p>All existing plants are compatible with this biome.</p>';
   this.dialog.showModal();this.update();
  }catch(error){this.notify(error.message);}
 }
 update(){
  try{
   const replacements=Object.fromEntries([...this.dialog.querySelectorAll('[data-species-from]')].map(input=>[input.dataset.speciesFrom,input.value]));
   const result=planBiomeChange(this.original,this.catalog,{target:this.target,weather:this.dialog.querySelector('#creator-biome-weather').value,terrain:this.dialog.querySelector('#creator-biome-ground').value,replacements});
   this.result=result;
   this.dialog.querySelector('#creator-biome-weather-summary').textContent='Current: '+weatherText(result.before)+'. Proposed: '+weatherText(result.after)+'.';
   this.dialog.querySelector('#creator-biome-summary').textContent=`${result.groundChanged} habitat cells remapped · ${result.replaced} plants replaced · ${result.removed} removed · ${result.resized} sizes adjusted · ${result.unresolved.length} plant groups need a decision.`;
   const candidate=new this.Game();let valid;
   try{const report=JSON.parse(candidate.load_scenario(JSON.stringify(result.candidate)));valid=report.ok;this.dialog.querySelector('#creator-biome-validation').textContent=valid?(result.unresolved.length?'The preview keeps undecided plants visible. Resolve every group before applying.':'Ready to apply as one undoable edit.'):(report.issues.find(i=>i.severity==='error')?.message||'Review this draft.');this.preview.canvas.hidden=!valid;if(valid)this.preview.set(result.candidate,JSON.parse(candidate.report_state()),{center:result.candidate.map.camera,zoom:1.1,grid:false,tool:'pan'});}finally{candidate.free();}
   this.dialog.querySelector('#creator-biome-apply').disabled=!valid||result.unresolved.length>0;
  }catch(error){this.result=null;this.preview.canvas.hidden=true;this.dialog.querySelector('#creator-biome-apply').disabled=true;this.dialog.querySelector('#creator-biome-validation').textContent=error.message;}
 }
}
