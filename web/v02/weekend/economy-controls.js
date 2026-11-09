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
 const p=policies.sales[selected]??={enabled:false,keep:['food','meals'].includes(selected)?s.people.length*4:12,above:['food','meals'].includes(selected)?s.people.length*4:12,daily:0};
 for(const [key,name]of [['keep','Keep at least'],['above','Sell when above'],['daily','Maximum units per day (0 = unlimited)']]){
   const label=make(trade,'label',name),input=make(label,'input');input.type='number';input.min=0;input.max=100000;input.step=1;input.value=p[key];
   input.oninput=()=>{p[key]=Math.max(0,Math.min(100000,Math.floor(Number(input.value)||0)));p.above=Math.max(p.above,p.keep);};input.onchange=()=>refresh();
 }
 const offer=salePreview(s,selected,materials,recipes,count);
 make(trade,'p',s.mode==='sandbox'?'Automatic sales are disabled in sandbox. These settings apply to normal villages.':`${offer.quantity} units would sell for R$${offer.revenue.toFixed(2)} now. Protected reserve: ${offer.reserve}. ${offer.quantity?'':offer.reason+'.'} Sales use whole trade batches. Set production targets at least one trade batch above the protected reserve.`);
 make(trade,'p','Already committed materials cannot be sold. Food and the next two batches at repeating sites stay protected. Automatic sales use the same prices as manual sales and appear in Finances.');
 const toggle=make(trade,'button',p.enabled?'Automatic sales: on':'Enable automatic sales');toggle.setAttribute('aria-pressed',String(p.enabled));toggle.onclick=()=>{p.enabled=!p.enabled;refresh();};
 root.append(drawer);
}
