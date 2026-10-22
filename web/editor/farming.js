import {cropTypes} from '../crop-art.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function startingCropFields(building,catalog){
 if(!catalog.buildings.includes(building.kind)&&!building.crop)return '';
 if(!building.crop)return building.state==='completed'?'<section class="creator-starting-crop"><h3>Starting crops</h3><p>Standard empty bed · residents plant when supplies are needed.</p><button data-crop-action="configure">Configure starting crops</button></section>':'<p>Starting plants require a completed garden or greenhouse.</p>';
 const c=building.crop,options=(value,choices)=>`${choices.some(([key])=>key===value)?'':`<option selected value="${escape(value)}">Unsupported value · choose another</option>`}${choices.map(([key,name])=>`<option value="${escape(key)}" ${key===value?'selected':''}>${escape(name)}</option>`).join('')}`,crops=catalog.crops.map(id=>[id,cropTypes[id]?.name??id]);
 return `<section class="creator-starting-crop"><h3>Starting crops</h3><p>Residents must still harvest ready crops. Root-zone wetness describes the starting soil, separately from stored water.</p><label class="creator-field">Starting bed<select data-start-crop="stage">${options(c.stage,catalog.stages.map(s=>[s.id,s.name]))}</select></label><label class="creator-field">Crop variety<select data-start-crop="crop">${options(c.crop,crops)}</select></label><label class="creator-field">Plant next<select data-start-crop="next_crop">${options(c.next_crop,crops)}</select></label><label class="creator-rule"><input type="checkbox" data-start-crop="replant" ${c.replant?'checked':''}>Plant again when supplies are needed</label><label class="creator-field">Initial root-zone wetness · %<input type="number" min="0" max="100" step="1" data-start-crop="soil_wetness" value="${escape(c.soil_wetness*100)}"></label>${c.stage==='empty'?`<p>${c.replant?`Residents may plant ${escape(cropTypes[c.next_crop]?.name??c.next_crop)} when needed.`:'This bed stays empty until planting is enabled.'}</p>`:''}<button data-crop-action="reset">Use standard empty bed</button></section>`;
}
export function setStartingCropField(building,field,value){
 const crop=building.crop;
 if(field==='crop'&&crop.next_crop===crop.crop)crop.next_crop=value;
 crop[field]=field==='soil_wetness'?Number(value)/100:value;
}
