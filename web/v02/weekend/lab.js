import {automaticWorkCopy} from './automatic-work-copy.js';
import {PROJECTS,PROCESSES,MATERIALS,footprint,campLocation} from './simulation.js';
import {riverCenter} from './river-layout.js';
import {CULTIVATION_KEYS,CROPS,harvestExpired,harvestYield} from './cultivation.js';
import {animalCareText} from './animal-care.js';
import {outsideWorkText} from './outside-work.js';
import {OPTIONS,DEFAULT_SETTINGS} from './world-settings.js';
import {CELL_MIN,CELL_MAX} from './map-size.js';
const $=id=>document.getElementById(id),worker=new Worker(new URL('./lab-worker.js',import.meta.url),{type:'module'}),KEY='solar-friends-isolated-128x-lab-1';
let s,selected=0,placing=null,rotation=0,center={x:32,z:20},scale=16,pointer=null,drag=null,inspectorKey='',lastSave=0,bed='all',telemetry=[],debugMeta={},replaying=false;
const send=(type,args={})=>{if(type==='run-for')notice('Running requested interval…');if(type==='sell'||type==='buy'){$('sell').disabled=true;$('buy').disabled=true;}worker.postMessage({type,...args});};
const notice=text=>$('notice').textContent=text;
const opts=(element,items)=>{element.replaceChildren(...items.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));};
const buildOptions=()=>{opts($('building'),Object.entries(PROJECTS).filter(([k,d])=>!d.natural&&d.name.toLowerCase().includes($('search').value.toLowerCase())).map(([k,d])=>[k,`${d.name} · ${d.size.join('×')}`]));$('field-size').hidden=$('building').value!=='field';};buildOptions();$('search').oninput=buildOptions;
opts($('material'),Object.entries(MATERIALS).filter(([k,d])=>d.price>0).map(([k,d])=>[k,`${d.name} · ${d.quantity} / R$${d.price}`]));
$('new').onclick=()=>{if(s&&!confirm('Start a new isolated lab run? Export evidence first to keep the current history, or save a checkpoint to keep the village.'))return;selected=0;inspectorKey='';send('new',{seed:Number($('seed').value)>>>0,settings:Object.fromEntries(Object.keys(OPTIONS).map(k=>[k,$('world-'+k).value]))});};
$('load').onclick=()=>{const raw=localStorage.getItem(KEY);if(raw)send('load',{raw});else notice('No lab save yet. Normal-game saves are untouched.');};
$('save').onclick=()=>send('save');$('export').onclick=()=>send('export');$('pause').onclick=()=>send('pause');$('speed').onchange=()=>send('speed',{value:Number($('speed').value)});
$('building').onchange=()=>{$('field-size').hidden=$('building').value!=='field';};
$('place').onclick=()=>{placing=$('building').value;notice(`Click a map cell for ${PROJECTS[placing].name}. R rotates; Escape cancels.`);draw();};
const rotate=()=>{rotation=(rotation+1)%4;$('rotate').textContent=`Rotate · ${rotation*90}°`;draw();};$('rotate').onclick=rotate;
$('camp').onclick=()=>{if(s){center={...s.stock};selected=0;placing=null;inspectorKey='';render();}};
$('sites').onchange=()=>{selected=Number($('sites').value);bed='all';const p=s.projects.find(p=>p.id===selected);if(p)center={x:p.x,z:p.z};inspectorKey='';render();};
$('material').onchange=render;
$('buy').onclick=()=>send('buy',{material:$('material').value});$('sell').onclick=()=>send('sell',{material:$('material').value});
function button(parent,text,type,args={}){const b=document.createElement('button');b.textContent=text;b.disabled=replaying&&type!=='unused';b.onclick=()=>send(type,args);parent.append(b);}
function line(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);}
function render(){if(!s)return;
 const built=new Set(s.projects.filter(p=>!p.natural&&p.work>=PROJECTS[p.key].work).map(p=>p.key));$('catalog-status').textContent=`Built ${built.size}/${Object.values(PROJECTS).filter(d=>!d.natural).length} building types · ${s.projects.filter(p=>!p.natural&&p.work<PROJECTS[p.key].work).length} construction projects`;
 const minutes=540+Math.floor(s.time*.45),nodes=Object.values(s.infrastructure?.nodes||{});
 $('clock').textContent=`Day ${1+Math.floor(minutes/1440)} · ${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
 $('totals').textContent=`R$${s.money.toFixed(2)} · ${s.wood} timber · ${s.materials.meals} meals + ${s.materials.food} ingredients · ${nodes.reduce((n,a)=>n+a.water[0],0).toFixed(0)} clean water · Grid R$${s.infrastructure.grid.spent.toFixed(2)} total`;
 $('trade').textContent=`Available: ${$('material').value==='wood'?s.wood:s.materials[$('material').value]} · ${s.trip?'Town pickup in progress':'Car available'}`;
 const siteList=[['0','Camp stores'],...s.projects.filter(p=>!p.felled).map(p=>[String(p.id),`${PROJECTS[p.key].name} #${p.id} (${p.x}, ${p.z})`])];if($('sites').options.length!==siteList.length){opts($('sites'),siteList);}$('sites').value=selected;
 const p=s.projects.find(p=>p.id===selected),n=s.infrastructure.nodes[selected],ops=s.operations?.filter(o=>o.site===selected&&!o.done)||[];
 const key=JSON.stringify([replaying,selected,p?.work,p?.repeat,p?.readyAt,n?.water.map(v=>Math.floor(v)),n?.maintainFresh,n?.maintainSanitation,ops.map(o=>[o.id,o.status]),Math.floor(s.time/20),s.infrastructure.grid.enabled,s.emergencyFood]);
 if(key!==inspectorKey&&!($('inspect').contains(document.activeElement)&&['SELECT','INPUT'].includes(document.activeElement.tagName))){inspectorKey=key;const panel=$('inspect');panel.replaceChildren();$('selection').textContent=selected===0?'Camp stores':p?`${PROJECTS[p.key].name} #${p.id}`:'Select a building';
 if(p){line(panel,`(${p.x}, ${p.z}) · ${Math.round(Math.hypot(p.x-s.stock.x,p.z-s.stock.z))} cells from stores · ${Math.round(100*p.work/PROJECTS[p.key].work)}% built`);
 if(p.cultivation)renderBeds(panel,p);
 if(p.animalCare)line(panel,animalCareText(p));
 if(!CULTIVATION_KEYS.includes(p.key))for(const [recipe,d]of Object.entries(PROCESSES).filter(([,d])=>d.kind===PROJECTS[p.key].kind)){button(panel,d.name,'produce',{site:p.id,recipe});if(Object.keys(d.output).length){const copy=automaticWorkCopy(p.repeat===recipe?p:{...p,repeat:null},recipe,PROCESSES,MATERIALS);button(panel,`${copy.label} · ${d.name}`,'repeat',{site:p.id,recipe});panel.lastChild.setAttribute('aria-pressed',String(copy.active));line(panel,copy.detail);}}
 if(p.readyAt>s.time)line(panel,`Growing: ${Math.ceil((p.readyAt-s.time)*.45)} game minutes remaining.`);}
 if(n){line(panel,`Water: ${n.water.map(v=>v.toFixed(1)).join(' / ')} (clean / raw / grey / sewage)`);
 if(n.capacity[1])button(panel,'Carry river water','haul',{site:selected});
 if(n.capacity[0]&&n.capacity[1]){button(panel,'Purify by hand','purify',{site:selected});button(panel,`Drinking reserve: ${n.maintainFresh?'on':'off'}`,'maintain',{site:selected,field:'maintainFresh'});}
 if(n.capacity[2]||n.capacity[3]){button(panel,'Service waste','service',{site:selected});button(panel,`Sanitation upkeep: ${n.maintainSanitation?'on':'off'}`,'maintain',{site:selected,field:'maintainSanitation'});}}
 for(const o of ops)line(panel,o.status||'Queued');
 if(selected===0)button(panel,`Emergency food purchases: ${s.emergencyFood===false?'off':'on'}`,'food-policy');
 if(selected===0)button(panel,`Grid: ${s.infrastructure.grid.enabled?'connected':'disconnected'}`,'grid');
 }
 $('residents').replaceChildren();for(const r of s.people){const worst=Object.entries(r.needs).filter(([,v])=>typeof v==='number').sort((a,b)=>a[1]-b[1])[0];const row=document.createElement('div');row.className='resident';$('residents').append(row);line(row,`${r.name} · ${r.action} · energy ${r.energy.toFixed(0)} · hunger ${r.needs.hunger.toFixed(0)} · hydration ${r.needs.hydration.toFixed(0)} · lowest: ${worst?.[0]} ${Number(worst?.[1]).toFixed(0)}`);if(r.needBlocked||r.outsideWorkBlocked)line(row,r.needBlocked||r.outsideWorkBlocked);button(row,r.outsideJobEnabled?'Disable outside job':'Enable outside job','outside',{resident:r.id,enabled:!r.outsideJobEnabled});row.lastChild.title=outsideWorkText(r);}
 $('events').textContent=s.log.slice(0,6).join(' / ');renderDiagnostics();draw();
}
const canvas=$('map'),ctx=canvas.getContext('2d');
const point=(x,z)=>[(x-center.x)*scale+canvas.width/2,(z-center.z)*scale+canvas.height/2];
const cell=e=>{const r=canvas.getBoundingClientRect();return{x:Math.floor((e.clientX-r.left-canvas.width/2)/scale+center.x),z:Math.floor((e.clientY-r.top-canvas.height/2)/scale+center.z)};};
function draw(){if(!s)return;const bounds=canvas.getBoundingClientRect();canvas.width=bounds.width;canvas.height=bounds.height;ctx.fillStyle='#b6bc82';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.fillStyle='#719e99';ctx.beginPath();for(let z=CELL_MIN;z<=CELL_MAX;z++){const a=point(32+riverCenter((z-32)*2,s.landSeed)/2-1.4,z);ctx.lineTo(...a);}for(let z=CELL_MAX;z>=CELL_MIN;z--){const a=point(32+riverCenter((z-32)*2,s.landSeed)/2+1.4,z);ctx.lineTo(...a);}ctx.fill();
 ctx.strokeStyle='#8f986a';ctx.lineWidth=.5;for(let x=Math.max(CELL_MIN,Math.floor(center.x-canvas.width/scale/2));x<Math.min(CELL_MAX,center.x+canvas.width/scale/2);x++){const a=point(x,CELL_MIN),b=point(x,CELL_MAX);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}for(let z=Math.max(CELL_MIN,Math.floor(center.z-canvas.height/scale/2));z<Math.min(CELL_MAX,center.z+canvas.height/scale/2);z++){ctx.beginPath();ctx.moveTo(...point(CELL_MIN,z));ctx.lineTo(...point(CELL_MAX,z));ctx.stroke();}
 for(const p of s.projects){if(p.felled)continue;const [x,y]=point(p.x,p.z),[w,h]=footprint(p);if(x+w*scale<0||y+h*scale<0||x>canvas.width||y>canvas.height)continue;ctx.fillStyle=p.natural?(p.key.startsWith('wild-')?'#52734d':'#a68c62'):p.work<PROJECTS[p.key].work?'#e8d8aa':'#bf7957';ctx.fillRect(x+1,y+1,w*scale-2,h*scale-2);ctx.strokeStyle=p.id===selected?'#fff5cb':'#635c44';ctx.lineWidth=p.id===selected?3:1;ctx.strokeRect(x+1,y+1,w*scale-2,h*scale-2);if(!p.natural&&scale>10){ctx.fillStyle='#23362c';ctx.font='10px system-ui';ctx.fillText(PROJECTS[p.key].name.slice(0,11),x+2,y+12);}}
 const camp=campLocation(s);ctx.fillStyle='#e6d3a0';for(const dx of [-1,1]){const [x,y]=point(camp.x+dx,camp.z-1);ctx.beginPath();ctx.moveTo(x,y-scale);ctx.lineTo(x-scale/2,y);ctx.lineTo(x+scale/2,y);ctx.closePath();ctx.fill();}ctx.fillStyle='#304638';ctx.fillText('TENTS',...point(camp.x-1,camp.z+1));
 const stock=point(s.stock.x,s.stock.z);ctx.fillStyle='#fff5cb';ctx.fillRect(stock[0]-5,stock[1]-5,10,10);ctx.fillStyle='#23362c';ctx.fillText('STORES',stock[0]+8,stock[1]);
 for(const r of s.people){const [x,y]=point(r.x,r.z);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle=r.action==='rest'?'#e2d5ac':'#31495a';ctx.fill();if(scale>12)ctx.fillText(r.name,x+5,y);}
 if(placing&&pointer){const [w,h]=footprint({key:placing,rotation,fieldSize:[Number($('field-width').value),Number($('field-length').value)]});ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.strokeRect(...point(pointer.x,pointer.z),w*scale,h*scale);}
}
canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,c:{...center},moved:false};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{pointer=cell(e);if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved)center={x:drag.c.x-dx/scale,z:drag.c.z-dy/scale};}draw();};
canvas.onpointerup=e=>{if(!drag?.moved&&s){const p=cell(e);if(placing)send('build',{key:placing,...p,rotation,size:[Number($('field-width').value),Number($('field-length').value)]});else {selected=s.projects.filter(a=>!a.felled&&p.x>=a.x&&p.z>=a.z&&p.x<a.x+footprint(a)[0]&&p.z<a.z+footprint(a)[1]).at(-1)?.id||0;inspectorKey='';render();}}drag=null;};
canvas.onwheel=e=>{e.preventDefault();scale=Math.min(45,Math.max(4,scale*(e.deltaY>0?.9:1.1)));draw();};
document.onkeydown=e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();send('pause');}if(e.key.toLowerCase()==='r')rotate();if(e.key==='Escape'){placing=null;notice('Placement cancelled.');draw();}};
worker.onerror=e=>notice('Simulation worker failed: '+e.message);
worker.onmessage=({data:m})=>{if(m.type==='notice'){notice(m.text);if(m.action==='sell'||m.action==='buy'){if(m.state){s=m.state;render();}$('sell').disabled=false;$('buy').disabled=false;}}if(m.type==='save'){localStorage.setItem(KEY,m.raw);if(!m.silent)notice('Lab saved. Normal-game saves untouched.');}if(m.type==='export'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(m.report,null,2)],{type:'application/json'}));a.href=url;a.download='solar-friends-balance-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(m.type==='state'){const first=!s;s=m.state;telemetry=m.telemetry||[];debugMeta=m;replaying=m.replaying;$('stop-condition').value=m.condition;for(const id of ['run-for','step','place','buy','sell'])$(id).disabled=replaying;if(first)center={...s.stock};$('pause').textContent=m.paused?'Resume':'Pause';$('speed').value=m.speed;$('performance').textContent=`Actual ${m.actual.toFixed(1)}× / target ${m.speed}×${m.backlog>1?' · CPU limited':''}`;render();if(Date.now()-lastSave>10000){send('save',{silent:true});lastSave=Date.now();}}};
window.onresize=draw;

for(const [key,values]of Object.entries(OPTIONS)){
 const label=document.createElement('label');label.textContent=key;const select=document.createElement('select');select.id='world-'+key;opts(select,values.map(v=>[v,v]));select.value=DEFAULT_SETTINGS[key];label.append(select);$('world-settings').append(label);
}
$('step').onclick=()=>send('run-for',{days:1/24});
$('run-for').onclick=()=>send('run-for',{days:Number($('run-days').value)});
$('stop-condition').onchange=()=>send('stop-condition',{value:$('stop-condition').value});
for(const id of ['import','replay'])$(id).onchange=async()=>{
 try{const file=$(id).files[0];if(!file)return;if(file.size>50_000_000)throw Error('Choose a JSON file smaller than 50 MB.');const raw=await file.text(),value=JSON.parse(raw);
 if(s&&!confirm('Replace the current lab run? Export it first if you need its history.'))return;
 selected=0;inspectorKey='';if(id==='replay')send('replay',{report:value});else send('load',{raw:value.state?JSON.stringify(value.state):raw});
 }catch(e){notice(e.message);}finally{$(id).value='';}
};
$('diagnostics').ontoggle=()=>{renderDiagnostics();requestAnimationFrame(draw);};$('inventory-filter').onchange=renderDiagnostics;$('job-filter').onchange=renderDiagnostics;
function selectControl(parent,labelText,items,value,change){const label=document.createElement('label');label.textContent=labelText;const select=document.createElement('select');select.setAttribute('aria-label',labelText);opts(select,items);select.value=value;select.disabled=replaying&&labelText!=='Cultivation bed';select.onchange=()=>{change(select.value);select.blur();inspectorKey='';};label.append(select);parent.append(label);return select;}
function renderBeds(panel,p){
 const beds=p.cultivation.beds;if(bed!=='all'&&!beds.some(b=>String(b.id)===bed))bed='all';
 selectControl(panel,'Cultivation bed',[['all','All beds'],...beds.map(b=>[String(b.id),`Bed ${b.id+1} · ${b.crop} · ${harvestExpired(b,s.time)?'expired':b.stage}`])],bed,v=>{bed=v;render();});
 const chosen=bed==='all'?beds:beds.filter(b=>String(b.id)===bed),target=bed==='all'?'all':Number(bed);
 for(const b of chosen)line(panel,`Bed ${b.id+1}: ${harvestExpired(b,s.time)?'expired':b.stage} · growth ${(b.growth*100).toFixed(0)}% · moisture ${(b.moisture*100).toFixed(0)}% · drought loss ${((b.droughtDamage||0)*100).toFixed(0)}% · ${b.stage==='harvestable'?'recoverable':'potential'} ${harvestYield(b,s.time)} kg · irrigated ${b.irrigated.toFixed(0)} L`);
 for(const [key,label,items]of [['crop','Crop',Object.entries(CROPS).map(([k,d])=>[k,d.name])],['density','Planting density',[['0.5','Wide'],['1','Standard'],['1.5','Dense']]],['irrigation','Irrigation',[['true','Automatic'],['false','Rainfed']]],['residues','Residues',[['leave','Leave as cover'],['collect','Collect for compost']]]]){
 const values=new Set(chosen.map(b=>String(b[key])));selectControl(panel,label,[['','Choose / mixed'],...items],values.size===1?[...values][0]:'',v=>{if(v)send('bed-config',{site:p.id,bed:target,settings:{[key]:key==='density'?Number(v):key==='irrigation'?v==='true':v}});});
 }
 for(const action of ['prepare','plant','harvest','clear','amend','collect']){
 const b=document.createElement('button');b.textContent=`${action[0].toUpperCase()+action.slice(1)} ${bed==='all'?'all beds':'bed'}`;b.dataset.bedAction=action;b.disabled=replaying;b.onclick=()=>{if(action==='clear'&&!confirm('Clear the selected crops? Only residues remain.'))return;send('bed',{site:p.id,bed:target,action});};panel.append(b);
 }
 line(panel,'Orders use normal seeds, compost and resident labor. Bulk orders report each bed separately; some may be rejected.');
}
function renderDiagnostics(){
 if(!s||!$('diagnostics').open)return;
 const orders=$('orders');orders.replaceChildren();for(const c of (debugMeta.recentOrders||[]).slice().reverse())line(orders,`Tick ${c.tick} · ${c.action.type}: ${c.result}`);
 const first=telemetry[0],last=telemetry.at(-1);$('history-range').textContent=`${debugMeta.sampleCount||0} hourly samples retained (maximum 2,160 / 90 days); ${debugMeta.droppedSamples||0} older samples omitted. Charts: latest ${telemetry.length} hours. ${debugMeta.commandCount||0} recorded orders.${replaying?' REPLAY IN PROGRESS.':''}`;
 const trends=$('trends');trends.replaceChildren();
 for(const [label,get,unit]of [['Savings',a=>a.money,'R$'],['Clean water',a=>a.water,'L'],['Lowest hydration',a=>a.needs.hydration,'%'],['Food ingredients',a=>a.food,'kg']]){
 const values=telemetry.map(get).filter(Number.isFinite);if(!values.length)continue;const min=Math.min(...values),max=Math.max(...values),span=max-min||1;
 const figure=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=`${label}: ${values.at(-1).toFixed(1)} ${unit} · range ${min.toFixed(1)}–${max.toFixed(1)}`;figure.append(caption);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 240 50');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${label}, day ${first.day} to ${last.day}`);const path=document.createElementNS(svg.namespaceURI,'polyline');path.setAttribute('points',values.map((v,i)=>`${i*240/Math.max(1,values.length-1)},${48-(v-min)/span*45}`).join(' '));svg.append(path);figure.append(svg);trends.append(figure);
 }
 const env=$('environment');env.replaceChildren();if(s.weather)line(env,`Weather: ${s.weather.temperatureC.toFixed(1)} °C · rain ${s.weather.rainMmPerHour.toFixed(2)} mm/h · cloud ${(s.weather.cloudCover*100).toFixed(0)}%`);
 if(s.hydrology){const h=s.hydrology;line(env,`Groundwater ${h.groundwater.toFixed(0)} / ${h.capacity.toFixed(0)} L · river ${h.river.toFixed(0)} L · flow ${h.flowLitersPerDay.toFixed(0)} L/day`);}
 line(env,`Income R$${(s.finances?.income||0).toFixed(2)} · expenses R$${(s.finances?.expenses||0).toFixed(2)} · spoiled ${JSON.stringify(s.foodStorage?.spoiled||{})}`);
 const inventory=$('inventory');inventory.replaceChildren();for(const [id,n]of Object.entries({wood:s.wood,...s.materials}).filter(([,n])=>$('inventory-filter').value==='all'||n>0)) {const span=document.createElement('span');span.textContent=`${MATERIALS[id]?.name||id}: ${Number(n).toFixed(1)}`;inventory.append(span);}
 const jobs=$('jobs');jobs.replaceChildren();const list=(s.operations||[]).filter(o=>!o.done&&($('job-filter').value!=='selected'||o.site===selected)&&($('job-filter').value!=='waiting'||/waiting|blocked|needs/i.test(o.status||'')));
 for(const o of list){const row=document.createElement('div');row.className='job';line(row,`#${o.id} · site ${o.site} · ${o.recipe||'water service'} · ${o.status||o.phase} · work ${o.work.toFixed(1)} · worker ${s.people.filter(r=>r.operation===o.id).map(r=>r.name).join(', ')||'unassigned'}`);button(row,'Inspect site','unused');row.lastChild.onclick=()=>{selected=o.site;bed='all';inspectorKey='';render();};jobs.append(row);}if(!list.length)line(jobs,'No matching active jobs.');
}
