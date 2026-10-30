import {canonical} from './journal.js';
import {prepareBiomePreview} from './prepare-biome-preview.js';
import {compatibleSpecies,regionalSpecies,suggestedReplacement} from './biome-change.js';
import {EditorMap} from './map-view.js';
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=n=>Number(n.toFixed(2));
const weatherText=p=>`${p.season_days} days per season · rain ${p.wet_rain_chance}% wet / ${p.dry_rain_chance}% dry · drying ${amount(p.wet_evaporation)} / ${amount(p.dry_evaporation)} · ${p.intro_days} beginner days`;
export class BiomeEditor{
 constructor(root,{catalog,art,source,change,notify,prepare=prepareBiomePreview}){
  this.catalog=catalog;this.prepare=prepare;this.generation=0;this.source=source;this.change=change;this.notify=notify;
  root.innerHTML='<label for="creator-biome-target">Regional setting</label><select id="creator-biome-target"></select><button type="button" id="creator-biome-preview">Preview biome change</button>';
  this.select=root.querySelector('select');for(const b of catalog.biomes)this.select.append(new Option(b.name,b.id));
  this.dialog=document.getElementById('creator-biome-dialog');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="Cancel biome change" data-biome-cancel>×</button><h2 id="creator-biome-change-title">Reshape our landscape</h2><p>Buildings, roads, people, supplies, goals, river and reserve locations stay in place. This changes the draft, not any saved playthrough.</p><div class="creator-biome-options"><label>Weather<select id="creator-biome-weather"><option value="destination">Use destination weather</option><option value="keep">Keep current weather</option></select></label><label>Existing regional habitats<select id="creator-biome-ground"><option value="labels">Remap habitat names, keep soil values</option><option value="keep">Keep all authored habitats and soil</option><option value="defaults">Remap and use destination soil defaults</option></select></label></div><p id="creator-biome-weather-summary"></p><div id="creator-biome-plants"></div><button type="button" id="creator-biome-suggest">Suggest plant replacements</button><p>Plant identities and positions stay in place unless you explicitly remove a group. Larger replacements may need more room.</p><p id="creator-biome-summary" role="status"></p><div class="creator-selection-actions"><button type="button" id="creator-biome-cancel-preview" hidden>Cancel preview preparation</button><button type="button" id="creator-biome-refresh" hidden>Refresh preview</button></div><canvas hidden id="creator-biome-map" aria-label="Proposed biome landscape"></canvas><p id="creator-biome-validation" role="status"></p><div class="dialog-actions"><button type="button" data-biome-cancel>Keep current landscape</button><button type="button" id="creator-biome-apply">Apply biome change</button></div>';
  this.apply=this.dialog.querySelector('#creator-biome-apply');this.validation=this.dialog.querySelector('#creator-biome-validation');this.cancel=this.dialog.querySelector('#creator-biome-cancel-preview');this.refresh=this.dialog.querySelector('#creator-biome-refresh');
  this.preview=new EditorMap(this.dialog.querySelector('canvas'),art,{action:()=>{},viewChanged:()=>{},onTerrainReady:()=>this.ready(),onArtworkReady:()=>this.ready()});this.preview.onRender=()=>this.ready();
  this.cancel.onclick=()=>{this.stop();this.validation.textContent='Preview cancelled. Your draft is unchanged. Refresh the preview to continue.';this.refresh.hidden=false;};this.refresh.onclick=()=>this.update();
  root.querySelector('button').onclick=()=>this.open();
  for(const b of this.dialog.querySelectorAll('[data-biome-cancel]'))b.onclick=()=>this.dialog.close();
  this.dialog.onchange=()=>this.update();
  this.dialog.addEventListener('close',()=>{this.stop();this.original=null;this.render(this.source().definition);});
  this.dialog.querySelector('#creator-biome-suggest').onclick=()=>{for(const input of this.dialog.querySelectorAll('[data-species-from]'))input.value=suggestedReplacement(input.dataset.speciesFrom,this.target,catalog)||'';this.update();};
  this.dialog.querySelector('#creator-biome-apply').onclick=()=>{
   if(this.apply.disabled||!this.result||!this.result.report.ok||this.result.unresolved.length)return;
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
   if(!Array.isArray(definition.map.terrain)||!Array.isArray(definition.map.nature)||!Array.isArray(definition.map.deposits))throw Error('Resolve the current property before changing its biome.');
   const known=new Set(this.catalog.nature.map(s=>s.key)),groups=new Map();for(const plant of definition.map.nature)if(!known.has(plant.species)||!compatibleSpecies(plant.species,this.target))groups.set(plant.species,(groups.get(plant.species)??0)+1);
   const options=this.catalog.nature.filter(s=>regionalSpecies(this.target).includes(s.key));
   this.dialog.querySelector('#creator-biome-plants').innerHTML=[...groups].map(([key,count])=>({key,count})).map(g=>`<div class="creator-field"><label>${escape(this.catalog.nature.find(s=>s.key===g.key)?.name||g.key)} · ${g.count} plants<select data-species-from="${escape(g.key)}"><option value="">Choose a replacement…</option><option value="remove">Remove these plants</option>${options.map(s=>`<option value="${escape(s.key)}">${escape(s.name)}</option>`).join('')}</select></label></div>`).join('')||'<p>All existing plants are compatible with this biome.</p>';
   this.dialog.showModal();this.update();
  }catch(error){this.notify(error.message);}
 }
 stop(){
  this.generation++;this.controller?.abort();this.controller=null;this.result=null;this.apply.disabled=true;this.cancel.hidden=true;this.preview.clearPreview();this.preview.canvas.hidden=true;
 }
 ready(){
  if(!this.dialog.open||!this.result)return;
  this.apply.disabled=!!this.unchanged||!this.result.report.ok||this.result.unresolved.length>0||this.preview.canvas.getAttribute('aria-busy')==='true'||!!this.preview.artError||!!this.preview.terrainError;
  if(this.preview.artError||this.preview.terrainError){this.validation.textContent='Preview artwork could not load. Refresh the preview to retry.';this.refresh.hidden=false;}
  else if(this.unchanged)this.validation.textContent='This biome setup already matches the draft. Choose another setting or keep the current landscape.';
  else if(this.result.report.ok)this.validation.textContent=this.result.unresolved.length?'The preview keeps undecided plants visible. Resolve every group before applying.':this.apply.disabled?'Painting the proposed landscape…':'Ready to apply as one undoable edit.';
 }
 async update(){
  this.stop();const token=this.generation,controller=this.controller=new AbortController();this.cancel.hidden=false;this.refresh.hidden=true;this.dialog.querySelector('#creator-biome-weather-summary').textContent='';this.validation.textContent='Preparing the biome preview…';this.dialog.querySelector('#creator-biome-summary').textContent='Checking your proposed settings in a separate simulation.';
  try{
   const replacements=Object.fromEntries([...this.dialog.querySelectorAll('[data-species-from]')].map(input=>[input.dataset.speciesFrom,input.value]));
   const result=await this.prepare(this.original,{target:this.target,weather:this.dialog.querySelector('#creator-biome-weather').value,terrain:this.dialog.querySelector('#creator-biome-ground').value,replacements},{signal:controller.signal,onStage:message=>{if(token===this.generation)this.validation.textContent=message;}});
   if(token!==this.generation||!this.dialog.open)return;this.controller=null;this.cancel.hidden=true;
   const latest=this.source();if(latest.id!==this.project||latest.revision!==this.revision){this.validation.textContent='The draft changed. Close this preview and open it again.';return;}this.result=result;this.unchanged=canonical(result.candidate)===canonical(this.original);
   this.dialog.querySelector('#creator-biome-weather-summary').textContent='Current: '+weatherText(result.before)+'. Proposed: '+weatherText(result.after)+'.';
   this.dialog.querySelector('#creator-biome-summary').textContent=`${result.groundChanged} habitat cells remapped · ${result.replaced} plants replaced · ${result.removed} removed · ${result.resized} sizes adjusted · ${result.unresolved.length} plant groups need a decision.`;
   this.validation.textContent=result.report.ok?'Painting the proposed landscape…':result.report.issues.find(i=>i.severity==='error')?.message||'Review this draft.';
   this.preview.canvas.hidden=!result.report.ok;if(result.report.ok)this.preview.set(result.candidate,result.snapshot,{center:result.candidate.map.camera,zoom:1.1,grid:false,tool:'pan'});this.ready();
  }catch(error){if(token!==this.generation||!this.dialog.open)return;this.controller=null;this.cancel.hidden=true;this.refresh.hidden=false;this.validation.textContent=error.message;}
 }
}
