import {cropCondition} from './crop-stress.js';
import * as THREE from 'three';
import {elevationAt} from './elevation.js';
import {CROPS,ensureCultivation,bedLayout,farmJobError,farmJobSpec} from './cultivation.js';
import {planField,fieldPlacementError,queueBedJob,configureBed,resizeField,PROJECTS} from './simulation.js';
export function installFarmingUI({state,selected,scene,hit,controls,select,changed,message,begin,placementGrid}){
 const button=document.getElementById('build-field');
 const reopen=document.createElement('button');reopen.textContent='Manage cultivation beds';reopen.hidden=true;document.getElementById('selection').append(reopen);
 const panel=document.createElement('aside');panel.id='cultivation-panel';panel.hidden=true;
 panel.setAttribute('aria-label','Cultivation beds');
 panel.innerHTML='<header class="farm-heading"><div><small>FOOD & FARMING</small><h2 id="farm-title">Cultivation</h2></div><button id="close-farm" aria-label="Close cultivation">×</button></header><div id="farm-content"></div>';document.body.append(panel);
 const openSections=new Set();panel.addEventListener('toggle',e=>{if(e.target.matches('details[data-section]')){if(e.target.open)openSections.add(e.target.dataset.section);else openSections.delete(e.target.dataset.section);}},true);
 let hiddenSite=null,active=false,start=null,end=null,rotation=0,pending=null,bedId=0,lastSite=null,lastRender=null;
 const content=panel.querySelector('#farm-content'),preview=new THREE.Group();scene.add(preview);
 const clearPreview=()=>{for(const child of [...preview.children]){child.geometry?.dispose();child.material?.dispose();preview.remove(child);}};
 const stop=()=>{panel.classList.remove('farm-placement');placementGrid(false);delete document.body.dataset.cultivationOpen;lastRender=null;active=false;start=null;pending=null;controls.enabled=true;clearPreview();panel.hidden=true;};
 reopen.onclick=()=>{hiddenSite=null;lastRender=null;refresh();};
 panel.querySelector('#close-farm').onclick=()=>{hiddenSite=selected();stop();};
 const cell=e=>{const p=hit(e);return p&&{x:Math.round(p.x/2+32),z:Math.round(p.z/2+32),y:p.y};};
 const rectangle=()=>{if(!start||!end)return null;const size=[Math.abs(end.x-start.x)+1,Math.abs(end.z-start.z)+1];return {x:Math.min(start.x,end.x),z:Math.min(start.z,end.z),size:rotation?[size[1],size[0]]:size};};
 function draw(){
  clearPreview();
  const r=rectangle();if(!r)return;
  const error=fieldPlacementError(state(),r.x,r.z,r.size,rotation),w=(rotation?r.size[1]:r.size[0])*2,d=(rotation?r.size[0]:r.size[1])*2;
  const left=(r.x-32)*2-1,back=(r.z-32)*2-1;
  const height=(x,z)=>elevationAt(x,z,state().elevationSeed,state().terrainPads)+.08;
  const line=(points,color)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(([x,z])=>new THREE.Vector3(x,height(x,z),z))),new THREE.LineBasicMaterial({color,depthTest:false}));
  // The boundary uses the same odd-metre cell edges as the terrain map grid.
  const boundary=[];
  for(let x=left;x<=left+w;x+=2)boundary.push([x,back]);
  for(let z=back+2;z<=back+d;z+=2)boundary.push([left+w,z]);
  for(let x=left+w-2;x>=left;x-=2)boundary.push([x,back+d]);
  for(let z=back+d-2;z>=back;z-=2)boundary.push([left,z]);
  preview.add(line(boundary,error?'#ba583e':'#f4e5a9'));
  const a=rotation*Math.PI/2,cx=left+w/2,cz=back+d/2;
  for(const b of bedLayout({key:'field',fieldSize:r.size})){
   const points=[[-b.w/2,-b.d/2],[b.w/2,-b.d/2],[b.w/2,b.d/2],[-b.w/2,b.d/2],[-b.w/2,-b.d/2]].map(([x,z])=>[cx+Math.cos(a)*(b.x+x)+Math.sin(a)*(b.z+z),cz-Math.sin(a)*(b.x+x)+Math.cos(a)*(b.z+z)]);
   preview.add(line(points,error?'#ba583e':'#b6cc8e'));
  }
  content.querySelector('#field-summary').textContent=error||`${w/2} × ${d/2} grid cells · ${w} × ${d} m · ${bedLayout({key:'field',fieldSize:r.size}).length} beds · 0.8 m aisles`;
  content.querySelector('#confirm-field').disabled=!!error||!pending;
 }
 button.onclick=()=>{
  begin();panel.classList.add('farm-placement');placementGrid(true);document.getElementById('farm-title').textContent='New field';document.body.dataset.cultivationOpen='true';active=true;hiddenSite=null;panel.hidden=false;controls.enabled=false;start=null;pending=null;
  content.innerHTML='<p class="farm-intro">Drag across the grid to mark your field. Its edges snap to whole 2 m cells.</p><label>Row direction <select id="field-direction"><option value="0">North–south</option><option value="1">East–west</option></select></label><p id="field-summary">Minimum 2 × 2 cells.</p><button id="confirm-field" disabled>Confirm field</button>';
  content.querySelector('#field-direction').value=String(rotation);
  content.querySelector('#field-direction').onchange=e=>{rotation=Number(e.target.value);draw();};
  content.querySelector('#confirm-field').onclick=()=>{const r=rectangle(),error=planField(state(),r.x,r.z,r.size,rotation);if(error){message(error);return;}stop();select(state().projects.at(-1).id);refresh();};
 };
 const canvas=document.getElementById('world');
 canvas.addEventListener('pointerdown',e=>{if(!active||e.button!==0)return;e.stopImmediatePropagation();e.preventDefault();start=cell(e);end=start;pending=null;canvas.setPointerCapture(e.pointerId);draw();},true);
 canvas.addEventListener('pointermove',e=>{if(!active)return;e.stopImmediatePropagation();if(start&&(e.buttons&1)){end=cell(e)||end;draw();}},true);
 canvas.addEventListener('pointerup',e=>{if(!active)return;e.stopImmediatePropagation();if(start){end=cell(e)||end;pending=rectangle();draw();}if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);},true);
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&(active||!panel.hidden)){stop();hiddenSite=selected();}});
 function refresh(){
  if(active)return;
  const s=state(),p=s.projects.find(p=>p.id===selected());
  reopen.hidden=!p?.cultivation;
  if(!p||p.work<PROJECTS[p.key].work||hiddenSite===p.id){panel.hidden=true;delete document.body.dataset.cultivationOpen;return;}
  if(lastSite!==p.id){lastSite=p.id;bedId=0;hiddenSite=null;}
  const farm=ensureCultivation(s,p);if(!farm){panel.hidden=true;delete document.body.dataset.cultivationOpen;return;}
  panel.hidden=false;document.body.dataset.cultivationOpen='true';
  const signature=JSON.stringify([p.id,bedId,p.fieldSize,s.materials[`${farm.beds[bedId]?.crop}_seed`],s.materials.compost,farm.beds.map(b=>[b.crop,b.stage,b.density,b.irrigation,b.residues,Math.floor((b.droughtDamage||0)*100),Math.floor(b.growth*100),Math.floor(b.moisture*100),Math.floor(b.fertility*100),Math.floor(b.cover*100),Math.floor(b.residueKg*10),Math.floor(b.irrigated)]),(s.operations||[]).filter(o=>o.site===p.id&&!o.done).map(o=>[o.id,o.status,Math.floor(o.work)])]);
  if(signature===lastRender)return;
  // Preserve focused controls while simulation updates the inspection text.
  if(panel.contains(document.activeElement)&&['SELECT','INPUT'].includes(document.activeElement.tagName))return;
  lastRender=signature;
  bedId=Math.min(bedId,farm.beds.length-1);const b=farm.beds[bedId];if(!b)return;
  const job=s.operations?.find(o=>!o.done&&o.site===p.id&&o.farm?.bed===bedId),standing=['growing','harvestable','failed'].includes(b.stage),locked=standing||!!job;
  const condition=Math.min(b.elapsed?1-b.stress/b.elapsed:1,1-(b.droughtDamage||0)),max=b.w*b.d*CROPS[b.crop].yieldKg*Math.min(b.density,1.2)/(1+Math.max(0,b.density-1)*1.5)*condition;
  document.getElementById('farm-title').textContent=`${p.key==='field'?'Field':p.key==='greenhouse'?'Greenhouse':'Garden'} #${p.id}`;
  const stages={unprepared:'Unworked soil',prepared:'Ready to plant',planted:'Planting',growing:'Growing',harvestable:'Ready to harvest',harvested:'Harvest complete',failed:'Crop failed'};
  const primary={failed:['clear','Clear failed crop'],unprepared:['prepare','Prepare soil'],prepared:['plant','Plant bed'],harvestable:['harvest','Harvest crop'],harvested:['prepare','Prepare next planting']}[b.stage];
  const conditionText=[cropCondition(b),b.moisture<.4?'Dry soil is slowing growth.':'',b.fertility<.5?'Low fertility is limiting growth.':'',b.density>1?'Dense spacing increases competition.':'',condition<.8?'Earlier stress has reduced this crop’s yield.':''].filter(Boolean);
  const metric=(label,value)=>`<div class="farm-metric"><span>${label}</span><strong>${Math.round(value*100)}%</strong><meter min="0" max="1" value="${value}" aria-label="${label}"></meter></div>`;
  const details=(id,title,body)=>`<details class="farm-details" data-section="${id}" ${openSections.has(id)?'open':''}><summary>${title}</summary>${body}</details>`;
  const row=(label,value,unit='kg')=>`<div><dt>${label}</dt><dd>${value.toFixed(1)} <span>${unit}</span></dd></div>`;
  content.innerHTML=`<label class="farm-bed-picker" for="farm-bed"><span>Bed</span><select id="farm-bed">${farm.beds.map(b=>`<option value="${b.id}">${b.id+1} of ${farm.beds.length} · ${stages[b.stage]}</option>`).join('')}</select></label>
  <section class="farm-crop-summary"><div><h3>${CROPS[b.crop].name}</h3><span class="farm-area">${(b.w*b.d).toFixed(1)} m² planted area</span></div><span class="farm-stage" data-stage="${b.stage}">${stages[b.stage]}</span></section>
  ${standing?`<div class="farm-growth"><div><span>Growth</span><strong>${Math.round(b.growth*100)}%</strong></div><progress value="${b.growth}" max="1" aria-label="Crop growth"></progress></div>`:''}
  <section class="farm-work"><p>${job?job.status||'Work queued · waiting for a resident':b.stage==='growing'?'Growing naturally. Residents are free for other work.':b.stage==='prepared'?'Soil is ready. Plant when seeds are in stores.':b.stage==='harvestable'?'The crop is ready. Harvest before it declines.':b.stage==='failed'?'Clear the failed crop, then prepare and replant the bed.':b.stage==='harvested'?'Gather residues or leave them to cover the soil.':'A resident will loosen the soil before planting.'}</p><div id="farm-actions"></div><p id="farm-feedback" role="status"></p></section>
  <section class="farm-soil"><h4>Soil conditions</h4><div class="farm-metrics">${metric('Moisture',b.moisture)}${metric('Fertility',b.fertility)}${metric('Ground cover',b.cover)}<div class="farm-metric"><span>Organic matter</span><strong>${Math.round(b.organic*100)}<small> /100</small></strong><meter min="0" max="1" value="${b.organic}" aria-label="Organic matter index"></meter></div></div>${conditionText.length?`<p class="farm-constraint">${conditionText.join(' ')}</p>`:''}</section>
  <section class="farm-settings"><h4>Planting & care</h4><div class="farm-control-pair"><label for="farm-crop">Crop<select id="farm-crop" ${locked?'disabled':''}>${Object.entries(CROPS).map(([id,c])=>`<option value="${id}">${c.name}</option>`).join('')}</select></label><label for="farm-density">Spacing<select id="farm-density" ${locked?'disabled':''}><option value="0.5">Wide</option><option value="1">Standard</option><option value="1.5">Dense</option></select></label></div>
  <label class="farm-check"><input type="checkbox" id="farm-irrigation" ${b.irrigation?'checked':''} ${job?'disabled':''}><span>Irrigate from village supplies</span></label>
  <label class="farm-residues-label" for="farm-residues">After harvest<select id="farm-residues" ${job?'disabled':''}><option value="leave">Leave residues as cover</option><option value="collect">Collect for compost</option></select></label></section>
  ${standing?`<p class="farm-estimate">Potential harvest <strong>0–${max.toFixed(1)} kg</strong><br><span>Future conditions and harvest timing still matter.</span></p>`:''}
  ${details('soil-care','Soil care & clearing','<div id="farm-secondary-actions"></div>')}
  ${details('balances','Water & material balances',`<dl class="farm-ledger">${row('Irrigation supplied',b.irrigated,'L')}${row('Rain received',b.rainLiters,'L')}${row('Residues on soil',b.residueKg)}${row('Compost decomposing',b.amendmentKg)}${row('Harvest carried away',b.exportedKg)}${row('Residues collected',b.residueExportedKg)}${row('Organic matter retained',b.soilOrganicKg)}${row('Decomposition losses',b.decomposedGasKg)}</dl>`)}
  ${p.key==='field'?details('resize','Field dimensions','<div class="farm-control-pair"><label>Width · grid cells<input id="farm-width" type="number" min="2" max="32" step="1"></label><label>Length · grid cells<input id="farm-depth" type="number" min="2" max="32" step="1"></label></div><button id="farm-resize">Update field</button>'):''}`;
  for(const [id,value]of [['farm-bed',bedId],['farm-crop',b.crop],['farm-density',b.density],['farm-residues',b.residues]])content.querySelector('#'+id).value=value;
  content.querySelector('#farm-bed').onchange=e=>{bedId=Number(e.target.value);e.target.blur();refresh();};
  for(const [id,key]of [['farm-crop','crop'],['farm-density','density'],['farm-irrigation','irrigation'],['farm-residues','residues']])content.querySelector('#'+id).onchange=e=>{const value=key==='irrigation'?e.target.checked:key==='density'?Number(e.target.value):e.target.value;message(configureBed(s,p.id,bedId,{[key]:value})||'Bed settings updated.');e.target.blur();changed();};
  const actions=[...(primary?[primary]:[]),['amend','Apply compost'],['collect','Collect residues'],...(['growing','harvestable'].includes(b.stage)?[['clear','Clear crop']]:[])];
  for(const [action,label]of actions){
   const button=document.createElement('button');button.textContent=label;button.dataset.farmAction=action;
   const spec=farmJobSpec(b,action),missing=Object.entries(spec.input).find(([id,n])=>(s.materials[id]||0)<n);
   const error=farmJobError(s,p,b,action)||(missing?`Needs ${missing[1]} ${missing[0]==='compost'?'kg of compost':'seed packet'+(missing[1]===1?'':'s')+' from Resources'}.`:'');button.disabled=!!error;button.title=error;
   if(primary?.[0]===action){button.className='farm-primary';if(error&&!job)content.querySelector('#farm-feedback').textContent=error;}
   if(action==='clear')button.className='farm-danger';
   button.onclick=()=>{if(action==='clear'&&!confirm('Clear this standing crop? Only recoverable residues will remain.'))return;const result=queueBedJob(s,p.id,bedId,action);message(result||`${label} queued for a resident.`);changed();};
   content.querySelector(primary?.[0]===action?'#farm-actions':'#farm-secondary-actions').append(button);
  }
  if(p.key==='field'){
   content.querySelector('#farm-width').value=p.fieldSize[0];content.querySelector('#farm-depth').value=p.fieldSize[1];
   content.querySelector('#farm-resize').onclick=()=>{message(resizeField(s,p.id,[Number(content.querySelector('#farm-width').value),Number(content.querySelector('#farm-depth').value)])||'Field dimensions updated.');changed();};
  }
 }
 return {refresh,open:()=>{hiddenSite=null;lastRender=null;refresh();}};
}
