import {pantryForecast} from './food-planning.js';
import {foodPolicy} from './food-policy.js';
import {ensureFoodStorage,FOOD_DAYS} from './food-storage.js';
import {coolingStatus,coolingText} from './cold-storage.js';
import {inventoryOwnership} from './economy-inventory.js';
import {quantityText} from './material-measures.js';

export function foodControls(root,s,projects,recipes,materials,refresh){
 const policy=foodPolicy(s),storage=ensureFoodStorage(s),panel=document.createElement('section');panel.className='food-management';
 const make=(parent,tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
 make(panel,'h3','From pantry to plate');
 make(panel,'p','Keep food for today, cook what needs using, and set aside provisions for later. Residents still need time, water and energy to prepare each batch.');
 const forecast=pantryForecast(s);
 if(s.mode!=='sandbox'&&forecast.shortfall)make(panel,'p',`Food reserve warning: ${forecast.shortfall} portions short of your chosen reserve. Check incoming supplies, prepare meals or buy food.`);
 const controls=make(panel,'fieldset');controls.className='food-policy-controls';make(controls,'legend','Kitchen policy');
 const toggle=make(controls,'button',policy.automatic?'Automatic food management: on':'Manage food automatically');toggle.setAttribute('aria-pressed',String(policy.automatic));toggle.disabled=s.mode==='sandbox';toggle.onclick=()=>{policy.automatic=!policy.automatic;refresh();};
 for(const [key,label]of [['freshDays','Fresh-meal target (days)'],['provisionDays','Dried-provision target (days)']]){
  const field=make(controls,'label',label),input=make(field,'input');input.type='number';input.min=0;input.max=7;input.step=.5;input.value=policy[key];input.disabled=s.mode==='sandbox';
  input.onchange=()=>{policy[key]=Math.max(0,Math.min(7,Number(input.value)||0));refresh();};
 }
 make(controls,'p',s.mode==='sandbox'?'Food automation and spoilage forecasts are inactive in sandbox.':'Targets use two portions per resident per day. Whole batches only; keep one day of edible food untouched. Existing kitchen jobs finish before the policy queues another batch.');
 const cooling=make(panel,'fieldset');make(cooling,'legend','Refrigeration');make(cooling,'p',coolingText(s));
 const label=make(cooling,'label','Chill first'),select=make(label,'select');
 for(const [value,text]of [['expiry','Earliest expiry'],['meals','Prepared meals'],['ingredients','Ingredients']])select.add(new Option(text,value));select.value=policy.coolingPriority;
 select.setAttribute('aria-label','Chill first');
 select.onchange=()=>{policy.coolingPriority=select.value;refresh();};
 const cold=coolingStatus(s);if(cold.powered<cold.installed)make(cooling,'p','Some refrigeration is switched off or without power. That food ages at its normal rate.');
 const soon=Object.entries(storage.lots).filter(([,lots])=>lots.some(l=>l.expires<=s.time+3200)).map(([id,lots])=>`${quantityText(id,lots.filter(l=>l.expires<=s.time+3200).reduce((n,l)=>n+l.n,0))} ${materials[id].name}`);
 if(s.mode!=='sandbox'&&soon.length)make(panel,'p',`Use soon: ${soon.join(', ')}. These batches expire within one day at their current deadlines; cook, preserve or sell what you can use.`);
 make(panel,'h3','On the shelves');
 const table=make(panel,'table');table.className='food-stock-table';
 const header=make(make(table,'thead'),'tr');for(const title of ['Food','Available','Use within','Chilled'])make(header,'th',title);
 const body=make(table,'tbody');
 for(const id of Object.keys(FOOD_DAYS))for(const preserved of id==='meals'?[false,true]:[false]){
  const lots=storage.lots[id].filter(l=>!!l.preserved===preserved),n=lots.reduce((a,l)=>a+l.n,0),next=Math.min(...lots.map(l=>l.expires));
  const row=make(body,'tr');make(row,'th',id==='meals'?(preserved?'Dried provisions':'Fresh meals'):materials[id].name);make(row,'td',quantityText(id,n));
  make(row,'td',s.mode==='sandbox'?'No spoilage':Number.isFinite(next)?`${Math.max(0,(next-s.time)/3200).toFixed(1)} days`:'—');make(row,'td',preserved?'Not needed':quantityText(id,lots.filter(l=>l.chilled).reduce((a,l)=>a+l.n,0)));
 }
 make(panel,'h3','Committed & on the way');
 const ownership=inventoryOwnership(s,projects,recipes,materials).rows;
 let found=false;
 for(const id of Object.keys(FOOD_DAYS)){
  const row=ownership[id];if(!row||!row.reserved&&!row.processing&&!row.transit)continue;found=true;
  make(panel,'p',`${materials[id].name}: ${quantityText(id,row.reserved)} reserved · ${quantityText(id,row.processing)} being processed · ${quantityText(id,row.transit)} in transit`);
 }
 if(!found)make(panel,'p','No food committed or in transit.');
 make(panel,'p','Incoming supplies are not edible stock yet. Delivery delays and spoilage can change what arrives.');
 root.append(panel);
}
