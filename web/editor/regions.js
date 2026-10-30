import {removalMarkup} from './removal-impact.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class RegionsEditor {
 constructor(host,{change,focus,draw,maximum}){
  Object.assign(this,{host,change,focus,draw,maximum});
  host.onchange=e=>{const key=e.target.dataset.regionField,id=e.target.closest('[data-region]')?.dataset.region;if(!key||!id)return;const value=key==='title'?e.target.value:Number(e.target.value);change('Edit named region',d=>{const r=d.map.regions.find(r=>r.id===id);if(r)r[key]=value;});};
  host.onclick=e=>{const button=e.target.closest('[data-region-action]');if(!button)return;const action=button.dataset.regionAction,id=button.closest('[data-region]')?.dataset.region;
   if(action==='draw')draw();
   if(action==='focus'){const r=this.definition.map.regions.find(r=>r.id===id);if(r)focus(r);}
   if(action==='remove')change('Remove named region',d=>{d.map.regions=d.map.regions.filter(r=>r.id!==id);});
  };
 }
 render(definition){
  this.definition=definition;const regions=definition.map.regions??[],focused=document.activeElement,identity=focused?.closest('[data-region]')?.dataset.region,key=focused?.dataset.regionField;
  this.host.innerHTML=`<p>Named areas guide scenario goals. A building counts only when its whole occupied plot fits inside the region. Overlapping regions are allowed. Drag between cells with Draw region, then name the area here.</p><button data-region-action="draw" ${regions.length>=this.maximum?'disabled':''}>Draw region</button>${regions.map((r,i)=>`<details data-region="${escape(r.id)}" ${r.id===identity?'open':''}><summary>${escape(r.title)}</summary><label class="creator-field">Name<input type="text" data-region-field="title" maxlength="100" value="${escape(r.title)}"></label><div class="creator-coordinates">${[['x','Column',0,63],['y','Row',0,63],['width','Width',1,64],['height','Height',1,64]].map(([key,label,min,max])=>`<label class="creator-field">${label}<input data-region-field="${key}" type="number" min="${min}" max="${max}" step="1" value="${escape(r[key])}"></label>`).join('')}</div>${removalMarkup(definition,{region:r.id})}<div class="creator-selection-actions"><button data-region-action="focus">Show region</button><button data-region-action="remove">Remove region</button></div></details>`).join('')}`;
  if(identity&&key)[...this.host.querySelectorAll('[data-region]')].find(el=>el.dataset.region===identity)?.querySelector(`[data-region-field="${key}"]`)?.focus({preventScroll:true});
 }
}
