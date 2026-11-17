import * as THREE from 'three';
import {CROPS,ensureCultivation,bedLayout,farmJobError} from './cultivation.js';
import {planField,fieldPlacementError,queueBedJob,configureBed,resizeField,PROJECTS} from './simulation.js';
export function installFarmingUI({state,selected,scene,hit,controls,select,changed,message,begin}){
 const button=document.getElementById('build-field');
 const style=document.createElement('style');style.textContent='body[data-cultivation-open] #selection{visibility:hidden} #cultivation-panel label{display:block;margin:8px 0} #cultivation-panel select{max-width:100%} #farm-actions{display:flex;flex-wrap:wrap;gap:6px}';document.head.append(style);
 const reopen=document.createElement('button');reopen.textContent='Manage cultivation beds';reopen.hidden=true;document.getElementById('selection').append(reopen);
 const panel=document.createElement('aside');panel.id='cultivation-panel';panel.hidden=true;
 panel.style.cssText='position:fixed;right:20px;top:190px;width:340px;max-height:60vh;overflow:auto;background:#fff6dc;color:#354530;padding:16px;border:2px solid #c0ad7d;border-radius:14px;z-index:12;box-shadow:0 8px 30px #0003';
 panel.innerHTML='<div style="position:sticky;top:-16px;background:#fff6dc;padding:12px 0;z-index:2"><strong>Cultivation</strong><button id="close-farm" style="float:right">Close</button></div><div id="farm-content"></div>';document.body.append(panel);
 let hiddenSite=null,active=false,start=null,end=null,rotation=0,pending=null,bedId=0,lastSite=null,lastRender=null;
 const content=panel.querySelector('#farm-content'),preview=new THREE.Group();scene.add(preview);
 const stop=()=>{delete document.body.dataset.cultivationOpen;lastRender=null;active=false;start=null;pending=null;controls.enabled=true;preview.clear();panel.hidden=true;};
 reopen.onclick=()=>{hiddenSite=null;lastRender=null;refresh();};
 panel.querySelector('#close-farm').onclick=()=>{hiddenSite=selected();stop();};
 const cell=e=>{const p=hit(e);return p&&{x:Math.round(p.x/2+32),z:Math.round(p.z/2+32),y:p.y};};
 const rectangle=()=>{if(!start||!end)return null;const size=[Math.abs(end.x-start.x)+1,Math.abs(end.z-start.z)+1];return {x:Math.min(start.x,end.x),z:Math.min(start.z,end.z),size:rotation?[size[1],size[0]]:size};};
 function draw(){
  for(const child of [...preview.children]){child.geometry?.dispose();child.material?.dispose();preview.remove(child);}
  const r=rectangle();if(!r)return;
  const error=fieldPlacementError(state(),r.x,r.z,r.size,rotation),w=(rotation?r.size[1]:r.size[0])*2,d=(rotation?r.size[0]:r.size[1])*2;
  const material=new THREE.LineBasicMaterial({color:error?'#db684d':'#dfef9b',depthTest:false});
  const bounds=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([x,z])=>new THREE.Vector3(x,.08,z))),material);preview.add(bounds);
  const a=rotation*Math.PI/2;
  for(const b of bedLayout({key:'field',fieldSize:r.size})){
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(b.w,b.d),new THREE.MeshBasicMaterial({color:error?'#db684d':'#b5cb7e',transparent:true,opacity:.45,depthTest:false,side:THREE.DoubleSide}));
   mesh.rotation.x=-Math.PI/2;mesh.rotation.z=-a;mesh.position.set(Math.cos(a)*b.x+Math.sin(a)*b.z,.1,-Math.sin(a)*b.x+Math.cos(a)*b.z);preview.add(mesh);
  }
  preview.position.set((r.x-32)*2+w/2-1,end.y,(r.z-32)*2+d/2-1);
  content.querySelector('#field-summary').textContent=error||`${w} × ${d} m · ${bedLayout({key:'field',fieldSize:r.size}).length} beds · 0.8 m aisles`;
  content.querySelector('#confirm-field').disabled=!!error||!pending;
 }
 button.onclick=()=>{
  begin();document.body.dataset.cultivationOpen='true';active=true;hiddenSite=null;panel.hidden=false;controls.enabled=false;start=null;pending=null;
  content.innerHTML='<p>Drag a rectangle on open ground. Beds follow the terrain.</p><label>Row direction <select id="field-direction"><option value="0">North–south</option><option value="1">East–west</option></select></label><p id="field-summary">Minimum 2 × 2 cells.</p><button id="confirm-field" disabled>Confirm field</button>';
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
  const signature=JSON.stringify([p.id,bedId,p.fieldSize,farm.beds.map(b=>[b.crop,b.stage,b.density,b.irrigation,b.residues,Math.floor(b.growth*100),Math.floor(b.moisture*100),Math.floor(b.fertility*100),Math.floor(b.cover*100),Math.floor(b.residueKg*10),Math.floor(b.irrigated)]),(s.operations||[]).filter(o=>o.site===p.id&&!o.done).map(o=>[o.id,o.status,Math.floor(o.work)])]);
  if(signature===lastRender)return;
  // Preserve focused controls while simulation updates the inspection text.
  if(panel.contains(document.activeElement)&&['SELECT','INPUT'].includes(document.activeElement.tagName))return;
  lastRender=signature;
  bedId=Math.min(bedId,farm.beds.length-1);const b=farm.beds[bedId];if(!b)return;
  const job=s.operations?.find(o=>!o.done&&o.site===p.id&&o.farm?.bed===bedId),standing=['growing','harvestable'].includes(b.stage),locked=standing||!!job;
  const condition=b.elapsed?1-b.stress/b.elapsed:1,max=b.w*b.d*CROPS[b.crop].yieldKg*Math.min(b.density,1.2)/(1+Math.max(0,b.density-1)*1.5)*condition;
  content.innerHTML=`<p><label>Bed <select id="farm-bed">${farm.beds.map(b=>`<option value="${b.id}">${b.id+1} · ${b.stage}</option>`).join('')}</select></label></p>
  <p>${(b.w*b.d).toFixed(1)} m² · ${b.stage} · ${(b.growth*100).toFixed(0)}% grown</p>
  <label>Crop <select id="farm-crop" ${locked?'disabled':''}>${Object.entries(CROPS).map(([id,c])=>`<option value="${id}">${c.name}</option>`).join('')}</select></label>
  <label>Density <select id="farm-density" ${locked?'disabled':''}><option value="0.5">Half density</option><option value="1">Standard spacing</option><option value="1.5">Dense planting</option></select></label>
  <p><label><input type="checkbox" id="farm-irrigation" ${b.irrigation?'checked':''} ${job?'disabled':''}> Irrigate from connected supplies</label></p>
  <label>Residues <select id="farm-residues" ${job?'disabled':''}><option value="leave">Leave as ground cover</option><option value="collect">Collect for compost</option></select></label>
  <p>Moisture ${(b.moisture*100).toFixed(0)}% · fertility ${(b.fertility*100).toFixed(0)}% · organic matter index ${(b.organic*100).toFixed(0)}/100 · cover ${(b.cover*100).toFixed(0)}%</p>
  <p>Water supplied ${b.irrigated.toFixed(1)} L · rain ${b.rainLiters.toFixed(1)} L<br>Residues ${b.residueKg.toFixed(1)} kg · amendments decomposing ${b.amendmentKg.toFixed(1)} kg</p>
  <p>Harvest exported ${b.exportedKg.toFixed(1)} kg · residues collected ${b.residueExportedKg.toFixed(1)} kg<br>Organic matter retained ${b.soilOrganicKg.toFixed(1)} kg · decomposition losses ${b.decomposedGasKg.toFixed(1)} kg</p>
  <p>${standing?`Potential harvest 0–${max.toFixed(1)} kg; future conditions and harvest timing still matter.`:'Preparation and planting require resident work and seeds.'}</p>
  <p>${b.moisture<.4?'Dry soil is limiting growth. ':''}${b.fertility<.5?'Low fertility is limiting growth. ':''}${b.density>1?'Dense planting increases competition. ':''}${condition<.8?'Earlier stress has reduced yield potential.':''}</p>
  <p>${job?job.status||'Resident work queued':'No bed work queued'}</p><div id="farm-actions"></div>
  ${p.key==='field'?'<details><summary>Resize field</summary><label>Width (cells) <input id="farm-width" type="number" min="2" max="32"></label><label>Length (cells) <input id="farm-depth" type="number" min="2" max="32"></label><button id="farm-resize">Apply dimensions</button></details>':''}`;
  for(const [id,value]of [['farm-bed',bedId],['farm-crop',b.crop],['farm-density',b.density],['farm-residues',b.residues]])content.querySelector('#'+id).value=value;
  content.querySelector('#farm-bed').onchange=e=>{bedId=Number(e.target.value);e.target.blur();refresh();};
  for(const [id,key]of [['farm-crop','crop'],['farm-density','density'],['farm-irrigation','irrigation'],['farm-residues','residues']])content.querySelector('#'+id).onchange=e=>{const value=key==='irrigation'?e.target.checked:key==='density'?Number(e.target.value):e.target.value;message(configureBed(s,p.id,bedId,{[key]:value})||'Bed settings updated.');e.target.blur();changed();};
  for(const [action,label]of [['prepare','Prepare soil'],['plant','Plant'],['harvest','Harvest'],['amend','Apply compost'],['collect','Collect residues'],['clear','Clear standing crop']]){
   const button=document.createElement('button');button.textContent=label;button.dataset.farmAction=action;const error=farmJobError(s,p,b,action);button.disabled=!!error;button.title=error;
   button.onclick=()=>{if(action==='clear'&&!confirm('Clear this standing crop? Only recoverable residues will remain.'))return;message(queueBedJob(s,p.id,bedId,action)||`${label} queued for a resident.`);changed();};content.querySelector('#farm-actions').append(button);
  }
  if(p.key==='field'){
   content.querySelector('#farm-width').value=p.fieldSize[0];content.querySelector('#farm-depth').value=p.fieldSize[1];
   content.querySelector('#farm-resize').onclick=()=>{message(resizeField(s,p.id,[Number(content.querySelector('#farm-width').value),Number(content.querySelector('#farm-depth').value)])||'Field dimensions updated.');changed();};
  }
 }
 return {refresh};
}
