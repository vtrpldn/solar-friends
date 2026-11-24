import { brl } from "./money.js";
import {physicalUnit,stockQuantity,quantityText} from './material-measures.js';
import {logisticsPolicy} from './logistics-policy.js';
import {foodChange} from './food-storage.js';
import {pendingExports,cancelExport,transportCost} from './physical-trade.js';
import {economyPolicies,salePreview,WORK_GROUPS} from './economy-policies.js';
let selected='bamboo',expanded=false;
export function economyControls(root,s,materials,recipes,count,refresh){
 const policies=economyPolicies(s),panel=document.createElement('section');panel.className='economy-controls';
 const drawer=document.createElement('details');drawer.className='economy-drawer';drawer.open=expanded;drawer.ontoggle=()=>{expanded=drawer.open;};const title=document.createElement('summary');title.textContent='Village work & trade';drawer.append(title,panel);
 const make=(parent,tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
 const work=make(panel,'fieldset');make(work,'legend','Work priorities');
 make(work,'p','Residents meet their own needs first. Higher priorities are chosen before construction; reserved workers keep essential services and production going. Unused workers help elsewhere.');
 for(const [key,name]of Object.entries(WORK_GROUPS)){
   const label=make(work,'label',name),input=make(label,'select');for(const [i,text]of ['Low','Normal','High','Highest'].entries())input.add(new Option(text,i));input.value=policies.work[key]??2;
   input.onchange=()=>{policies.work[key]=Number(input.value);refresh();};
 }
 for(const [key,name]of [['essentialWorkers','Reserve for food, water & sanitation'],['productionWorkers','Reserve for production']]){
   const label=make(work,'label',name),input=make(label,'select');for(let i=0;i<=s.people.length;i++)input.add(new Option(String(i),i));input.value=policies.work[key]??1;
   input.onchange=()=>{policies.work[key]=Number(input.value);const other=key==='essentialWorkers'?'productionWorkers':'essentialWorkers';policies.work[other]=Math.min(policies.work[other]??1,s.people.length-policies.work[key]);refresh();};
 }
 const trade=make(panel,'fieldset');make(trade,'legend','Sell surplus');
 const resourceLabel=make(trade,'label','Resource'),resource=make(resourceLabel,'select');for(const [id,item]of Object.entries(materials))if(item.quantity&&item.price)resource.add(new Option(item.name,id));resource.value=selected;
 resource.onchange=()=>{selected=resource.value;refresh();};
 const unit=physicalUnit(selected);
 const p=policies.sales[selected]??={enabled:false,keep:['food','meals'].includes(selected)?s.people.length*4:12,above:['food','meals'].includes(selected)?s.people.length*4:12,daily:0};
 for(const [key,name]of [['keep','Keep at least'],['above','Sell when above'],['daily','Maximum units per day (0 = unlimited)']]){
   const label=make(trade,'label',`${name} (${unit.unit})`),input=make(label,'input');input.type='number';input.min=0;input.max=100000*unit.factor;input.step=unit.factor;input.value=p[key]*unit.factor;
   input.oninput=()=>{p[key]=Math.max(0,Math.min(100000,stockQuantity(selected,Number(input.value)||0)));p.above=Math.max(p.above,p.keep);};input.onchange=()=>refresh();
 }
 const offer=salePreview(s,selected,materials,recipes,count);
 make(trade,'p',s.mode==='sandbox'?'Automatic sales are disabled in sandbox. These settings apply to normal villages.':`${quantityText(selected,offer.quantity)} could be queued for ${brl(offer.revenue)} now. Protected reserve: ${quantityText(selected,offer.reserve)}. ${offer.quantity?'':offer.reason+'.'} Sales use whole trade batches. Set production targets at least one trade batch above the protected reserve.`);
 make(trade,'p','Already committed materials cannot be sold. Food and the next two batches at repeating sites stay protected. Automatic sales reserve goods for town trips. Payment arrives in town, subject to buyer demand. Transport costs are shared across batches.');
 const toggle=make(trade,'button',p.enabled?'Automatic sales: on':'Enable automatic sales');toggle.setAttribute('aria-pressed',String(p.enabled));toggle.onclick=()=>{p.enabled=!p.enabled;refresh();};
 const logistics=make(panel,'fieldset');make(logistics,'legend','Consolidate automatic town trips');
 const dispatch=logisticsPolicy(s);
 make(logistics,'p','Wait for a fuller load or the time limit, whichever comes first. Food shopping and explicitly requested trips still leave promptly. Zero load threshold preserves immediate blueprint collection.');
 for(const [key,labelText,min,max,step]of [['minimumLoad','Minimum cargo fill (0–1)',0,1,.1],['maxWaitHours','Maximum waiting time in game hours',0,24,.5]]){
  const label=make(logistics,'label',labelText),input=make(label,'input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=dispatch[key];input.oninput=()=>{dispatch[key]=Math.max(min,Math.min(max,Number(input.value)||0));};
 }
 const send=make(logistics,'button',dispatch.urgent?'Waiting loads marked urgent':'Send waiting loads now');send.onclick=()=>{dispatch.urgent=true;refresh();};
 const orders=make(panel,'fieldset');make(orders,'legend','Town exports');
 make(orders,'p',`Goods leave available stock when queued. Trips combine sale batches within cargo capacity. Transport: ${brl(transportCost({...s,deliveryOnly:false}))} per trip; the driver needs enough energy and the village must afford departure.`);
 for(const o of pendingExports(s)){
 const row=make(orders,'div');make(row,'span',`${quantityText(o.material,o.quantity)} ${materials[o.material].name} · ${brl((o.cents/100))} gross · ${brl(((o.cents/100)-transportCost({...s,deliveryOnly:false})))} after dedicated fuel `);
 const hold=make(row,'button',o.holdForPickup?'Allow dedicated trip':'Hold for a shared pickup');hold.onclick=()=>{o.holdForPickup=!o.holdForPickup;refresh();};
    const cancel=make(row,'button','Cancel sale');cancel.onclick=()=>{cancelExport(s,o.id,foodChange);refresh();};
 }
 if(!pendingExports(s).length)make(orders,'p','No sale batches waiting.');
 root.append(drawer);
}
