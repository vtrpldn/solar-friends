import {paintIcon} from './build-menu.js';
import {allBuildingArt,buildingArtKey} from './building-art.js';
import {riverBank,MAP_SIZE} from './terrain.js';

const sheet=new URL('./ui/items.svg',import.meta.url).href;
export const materialIcons=['timber','bamboo','earth','stone','salvage','frames','walls','tiles','fittings','plumbing','electrical','covering','panels','batteries','pumps','tools','food','meals','eggs'];
export const itemIcon=key=>`<svg class="item-icon" aria-hidden="true" viewBox="0 0 48 48"><use href="${sheet}#${key}"/></svg>`;
const buildingNames={hydro:'River generator',eco_toilet:'Ecological toilet',banana_treatment:'Banana treatment bed',wetland:'Reed bed',biodigester:'Biodigester',warehouse:'Storage house',home:'Home',garden:'Garden',greenhouse:'Greenhouse',kitchen:'Kitchen',well:'Cistern',grove:'Food forest',compost:'Compost station',square:'Village square',coop:'Chicken coop',workshop:'Workshop',solar_farm:'Solar farm',streetlight:'Street light'};

export function installGameUI({images,avatar,paintPortraits,selectPerson,showPanel,openDev,focusAt,worldView}) {
  const $=s=>document.querySelector(s);
  for(const el of document.querySelectorAll('[data-item-icon]'))el.innerHTML=itemIcon(el.dataset.itemIcon);
  $('#help-open-dev').onclick=openDev;
  $('#plan-first-building').onclick=()=>showPanel('build-panel');
  const dockIcons=[['[data-panel="build-panel"]','home','Build','B'],['#open-village','square','Village','V'],['[data-panel="goals-panel"]','journal','Journal','J'],['[data-panel="community-panel"]','people','People','P']];
  for(const [selector,kind,label,key] of dockIcons){
    const button=$(selector);
    if(kind==='journal')button.innerHTML=itemIcon('journal');
    else if(kind==='people')button.innerHTML=`<span class="people-emblem" aria-hidden="true">${avatar(0)}${avatar(1)}</span>`;
    else{const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');button.replaceChildren(canvas);paintIcon(canvas,kind,images[kind]);}
    const caption=document.createElement('span');caption.className='dock-label';caption.textContent=label;
    const shortcut=document.createElement('kbd');shortcut.textContent=key;shortcut.setAttribute('aria-hidden','true');caption.append(shortcut);button.append(caption);
    button.title=`${label} · ${key}`;
  }
  for(const button of document.querySelectorAll('.book-tabs button')){
    const label=button.textContent.trim(),icon={Buildings:'home',Supplies:'food',Projects:'frames',Town:'coins',Power:'panels'}[label];
    button.innerHTML=(icon==='home'?'<span class="book-house" aria-hidden="true">⌂</span>':itemIcon(icon))+`<span>${label==='Projects'?'Construction':label==='Town'?'Trade':label}</span>`;
  }
  for(const button of document.querySelectorAll('[data-hud-resource]'))button.onclick=()=>{
    const resource=button.dataset.hudResource;
    if(resource==='happiness')showPanel('community-panel');
    else if(resource==='fund'&&!$('#village-book [data-panel="town-panel"]').hidden)showPanel('town-panel');
    else{showPanel('supplies-panel');if(resource==='materials'){$('#materials-stores').open=true;$('#materials-stores').scrollIntoView({block:'nearest'});}}
  };
  const map=$('#village-map'),ctx=map.getContext('2d');
  let mapCentre={x:14,y:14},buildingKey='';
  map.onclick=event=>{const rect=map.getBoundingClientRect();mapCentre={x:(event.clientX-rect.left)/rect.width*MAP_SIZE,y:(event.clientY-rect.top)/rect.height*MAP_SIZE};focusAt(mapCentre.x,mapCentre.y);};
  map.onkeydown=event=>{const delta={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();mapCentre={x:Math.max(0,Math.min(MAP_SIZE,mapCentre.x+delta[0])),y:Math.max(0,Math.min(MAP_SIZE,mapCentre.y+delta[1]))};focusAt(mapCentre.x,mapCentre.y);};
  const portraits=new Map();
  function update(state,developer,selected){
    document.body.classList.toggle('developer-session',developer);
    document.body.classList.toggle('sandbox-mode',state.village.mode==='sandbox');
    $('#material-total').textContent=state.village.mode==='sandbox'?'∞':state.environment.economy.materials.reduce((sum,m)=>sum+m.stored,0);
    for(const r of state.residents){
      let button=portraits.get(r.id);
      if(!button){button=document.createElement('button');button.dataset.citizen=r.id;button.innerHTML=`${avatar(r.id)}<span class="citizen-status" aria-hidden="true"></span>`;button.onclick=()=>selectPerson(r.id);$('#resident-strip').append(button);portraits.set(r.id,button);paintPortraits();}
      const away=r.trip?.phase==='away',asleep=r.task==='sleep'&&(away||Math.hypot(r.x-r.target_x,r.y-r.target_y)<=.08)&&r.sleep?.started_at!=null;
      const condition=away&&r.trip.purpose==='pickup'?'Collecting supplies':away&&r.trip.purpose==='work'?'At work':asleep?'Asleep':r.trip?'Travelling':r.hunger>75?'Hungry':r.energy<25?'Tired':'In the village';
      button.title=`${r.name} · ${condition} · Energy ${Math.round(r.energy)}`;
      button.setAttribute('aria-label',`Select ${r.name}. ${condition}. Energy ${Math.round(r.energy)}`);
      button.classList.toggle('active',r.id===selected);
      button.style.setProperty('--energy',`${r.energy}%`);
      button.dataset.condition=condition;
      button.querySelector('.citizen-status').textContent=away&&r.trip.purpose==='pickup'?'⇄':away&&r.trip.purpose==='work'?'↗':asleep?'z':r.trip?'↔':r.hunger>75||r.energy<25?'!':'';
    }
    const b=state.village.buildings.find(b=>b.id===Number($('#building-choice').value));
    const key=b?buildingArtKey(b,state.village.buildings,state.village.economy.projects):'';
    $('#building-name').textContent=b?`${buildingNames[b.kind]} ${b.id+1}`:'Buildings';
    $('#building-portrait').hidden=!b;
    $('#building-visits').hidden=!b||['solar_farm','streetlight','hydro','banana_treatment','wetland','biodigester','warehouse'].includes(b.kind);
    $('#plan-first-building').hidden=!!b;
    if(key&&key!==buildingKey){paintIcon($('#building-portrait'),b.kind,images[key],allBuildingArt[key]);buildingKey=key;}
    ctx.clearRect(0,0,map.width,map.height);ctx.save();ctx.scale(map.width/MAP_SIZE,map.height/MAP_SIZE);
    ctx.fillStyle='#87965b';ctx.fillRect(0,0,MAP_SIZE,MAP_SIZE);
    for(let x=0;x<MAP_SIZE;x++)for(let y=0;y<MAP_SIZE;y++){ctx.fillStyle=riverBank(x,y)?'#74a7a0':(x+y)%7===0?'#a9aa6c':'#87965b';ctx.fillRect(x,y,1,1);}
    ctx.fillStyle='#d3b181';for(const [x,y] of state.village.roads)ctx.fillRect(x-.45,y-.45,.9,.9);
    for(const b of state.village.buildings){ctx.fillStyle=b.progress>=100?'#ece0a8':'#ac7851';ctx.fillRect(b.x-.7,b.y-.7,1.4,1.4);}
    for(const r of state.residents){if(r.trip?.phase==='away')continue;ctx.fillStyle=r.id===selected?'#ffe296':'#435d36';ctx.beginPath();ctx.arc(r.x,r.y,.45,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#fff5cd';ctx.lineWidth=.3;ctx.beginPath();worldView().forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();ctx.restore();
  }
  paintPortraits();
  return {update};
}
