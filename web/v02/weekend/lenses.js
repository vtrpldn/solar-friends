import {LENSES, COLORS, lensData} from './lens-data.js';
import {MATERIALS} from './simulation.js';
import {CELL_MIN,CELL_MAX} from './map-size.js';

// Read-only presentation. No lens preferences or derived data enter the save.
export function installLenses({state,camera,world,focus,inspect}) {
  const root=document.createElement('section');root.id='map-lenses';root.setAttribute('aria-label','Map lenses');
  root.innerHTML=`<button id="lens-toggle" aria-expanded="false" aria-controls="lens-panel"><span id="lens-toggle-label">◉ Lenses</span></button>
    <div id="lens-panel" hidden><div class="lens-heading"><div><small>READ THE LAND</small><h2>Map lenses</h2></div><button id="lens-close" aria-label="Close lens menu">×</button></div>
    <div class="lens-choices" role="group" aria-label="Choose a map lens"></div></div>
    <section id="lens-legend" hidden aria-label="Active lens"><div class="lens-heading"><strong id="lens-title"></strong><button id="lens-off" aria-label="Return to normal view">×</button></div><p id="lens-description"></p>
    <label id="lens-filter-label" hidden>Show <select id="lens-filter"></select></label>
    <div id="lens-key"></div><p id="lens-count" role="status"></p><details id="lens-results"><summary>Find on map</summary><div id="lens-list"></div></details></section>`;
  document.body.append(root);
  const canvas=document.createElement('canvas');canvas.id='lens-overlay';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);
  const tooltip=document.createElement('div');tooltip.id='lens-tooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip');document.body.append(tooltip);
  const $=id=>root.querySelector('#'+id),ctx=canvas.getContext('2d');
  let active='',last=-Infinity,data={marks:[],lines:[]},terrain=[],pointer=null,projected=[],liquid='fresh',material='wood';
  const glyph={good:'●',warn:'▲',bad:'!',info:'◆',muted:'−'};
  const choices=root.querySelector('.lens-choices');
  for(const lens of LENSES){const b=document.createElement('button');b.textContent=lens.name;b.dataset.lens=lens.id;b.setAttribute('aria-pressed','false');b.onclick=()=>choose(active===lens.id?'':lens.id);choices.append(b);}
  // Opening moves focus to the current choice; closing hands it back to the toggle.
  function menu(open){
    const inside=$('lens-panel').contains(document.activeElement);
    $('lens-panel').hidden=!open;$('lens-toggle').setAttribute('aria-expanded',String(open));
    if(open)(choices.querySelector('[aria-pressed="true"]')||choices.firstElementChild).focus({preventScroll:true});
    else if(inside)$('lens-toggle').focus({preventScroll:true});
  }
  // Turning the lens off hides its legend; keep focus if it was in there.
  function clear(){const inside=$('lens-legend').contains(document.activeElement);choose('');if(inside)$('lens-toggle').focus({preventScroll:true});}
  function choose(id){
    active=id;last=-Infinity;terrain=[];tooltip.hidden=true;$('lens-list').replaceChildren();$('lens-results').open=false;$('lens-results').hidden=id==='land';
    document.body.dataset.lens=id;canvas.hidden=!id;$('lens-legend').hidden=!id;
    for(const b of choices.children)b.setAttribute('aria-pressed',String(b.dataset.lens===id));
    const lens=LENSES.find(l=>l.id===id);$('lens-title').textContent=lens?.name||'';$('lens-description').textContent=lens?.description||'';
    $('lens-toggle-label').textContent=id?`◉ ${lens.name}`:'◉ Lenses';
    $('lens-filter-label').hidden=!['water','chains'].includes(id);
    const filter=$('lens-filter');filter.replaceChildren();
    const options=id==='water'?[['fresh','Drinking water'],['greywater','Greywater'],['sewage','Sewage']]:Object.entries(MATERIALS).map(([k,v])=>[k,v.name]);
    for(const [value,name] of options){const o=document.createElement('option');o.value=value;o.textContent=name;filter.append(o);}filter.value=id==='water'?liquid:material;
    $('lens-key').replaceChildren();
    const key=id==='water'?(['greywater','sewage'].includes(liquid)?[['good','Space available'],['bad','Full'],['warn','Pipe under construction'],['muted','Off']]:[['good','Water stored'],['warn','Empty / pipe unfinished'],['muted','Off']]):id==='land'?[['good','Gentle < 10°'],['warn','Slope 10–25°'],['bad','Steep > 25°']]:id==='chains'?[['good','Producer'],['warn','Consumer'],['info','Inputs / shared stock']]:id==='ecology'?[['good','Standing / cultivated'],['warn','Felling queued'],['muted','Cleared']]:id==='power'?[['good','Available / no demand'],['bad','Unmet demand'],['warn','Line under construction'],['muted','Off']]:id==='sanitation'?[['good','Space available'],['bad','Full'],['warn','Pipe under construction'],['muted','Off']]:[['good','Ready / active'],['warn','Waiting / limited'],['bad','Needs attention'],['info','Location'],['muted','Inactive']];
    for(const [tone,name] of key){const item=document.createElement('span');item.style.setProperty('--lens-color',COLORS[tone]);item.textContent=`${glyph[tone]} ${name}`;$('lens-key').append(item);}
    menu(false);
  }
  $('lens-filter').onchange=e=>{if(active==='water'){liquid=e.target.value;const expanded=$('lens-results').open;choose(active);$('lens-results').open=expanded;}else material=e.target.value;last=-Infinity;};
  $('lens-toggle').onclick=()=>menu($('lens-panel').hidden);$('lens-close').onclick=()=>menu(false);$('lens-off').onclick=clear;
  document.getElementById('world').addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};});
  document.getElementById('world').addEventListener('pointerleave',()=>{pointer=null;tooltip.hidden=true;});
  function project(p,offset=.3){const v=p.position?.clone()||world(p.x,p.z);v.y+=offset;v.project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2,visible:v.z>=-1&&v.z<=1};}
  function insideTile(points,p){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  function refresh(now){
    last=now;data=lensData(state(),active,{liquid,material});
    if(active==='land'){
      terrain=[];
      for(let x=CELL_MIN;x<CELL_MAX;x+=4)for(let z=CELL_MIN;z<CELL_MAX;z+=4){
        const corners=[{x,z},{x:x+4,z},{x:x+4,z:z+4},{x,z:z+4}],heights=corners.map(p=>{p.position=world(p.x,p.z);return p.position.y;}),height=heights.reduce((a,b)=>a+b,0)/4;
        const slope=Math.atan((Math.max(...heights)-Math.min(...heights))/8)*180/Math.PI;
        const tone=slope>25?'bad':slope>10?'warn':'good';
        const mark={x:x+2,z:z+2,label:'Land & slope',detail:`Elevation ${height.toFixed(1)} world units · sampled slope ${slope.toFixed(1)}°`,tone,terrain:true};
        terrain.push({corners,tone,mark});data.marks.push(mark);
      }
    }
    $('lens-count').textContent=active==='land'?'4-cell terrain samples':`${data.marks.length} locations · ${data.lines.length} connections / paths`;
    if(!data.marks.length)$('lens-count').textContent='Nothing to show yet. This lens updates as your village grows.';
    // Update existing buttons so live data never interrupts clicks or keyboard focus.
    renderList();
  }
  function renderList(){
    const list=$('lens-list');
    if(active==='land')return;
    for(const [i,m] of data.marks.entries()){
      let b=list.children[i];
      if(!b){b=document.createElement('button');b.onclick=()=>{const mark=b.lensMark;focus(mark);if(mark.projectId!=null)inspect(mark.projectId);};list.append(b);}
      b.lensMark=m;const text=`${glyph[m.tone]} ${m.label} — ${m.detail}`;if(b.textContent!==text)b.textContent=text;
    }
    while(list.children.length>data.marks.length)list.lastChild.remove();
  }
  $('lens-results').ontoggle=()=>{if($('lens-results').open)renderList();};
  choose('');
  return {update(now){
    if(!active)return;
    if(now-last>750)refresh(now);
    const ratio=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;
    if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
    let terrainHit=null;
    for(const cell of terrain){const points=cell.corners.map(p=>project(p));if(points.some(p=>!p.visible))continue;if(pointer&&insideTile(points,pointer))terrainHit={mark:cell.mark};ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.globalAlpha=.27;ctx.fillStyle=COLORS[cell.tone];ctx.fill();ctx.globalAlpha=1;}
    for(const line of data.lines){ctx.beginPath();let started=false;for(const point of line.points){const p=project(point);if(!p.visible){started=false;continue;}if(started)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);started=true;}ctx.strokeStyle=COLORS[line.tone];ctx.lineWidth=2;ctx.setLineDash(active==='chains'||line.tone==='warn'?[5,5]:[]);ctx.stroke();}ctx.setLineDash([]);
    projected=[];
    for(const m of data.marks){if(m.terrain)continue;const p=project(m,2.5);if(!p.visible||p.x<-30||p.x>w+30||p.y<-30||p.y>h+30)continue;projected.push({...p,mark:m});
      ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fillStyle='#23372ee8';ctx.fill();ctx.strokeStyle=COLORS[m.tone];ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=COLORS[m.tone];ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 12px Outfit, sans-serif';ctx.fillText(glyph[m.tone],p.x,p.y);
    }
    const hit=active==='land'?terrainHit:pointer?projected.reduce((best,p)=>{const d=Math.hypot(pointer.x-p.x,pointer.y-p.y);return d<(best?.d??18)?{...p,d}:best;},null):null;
    tooltip.hidden=!hit;
    if(hit){tooltip.textContent=`${hit.mark.label} · ${hit.mark.detail}`;tooltip.style.left=`${Math.max(8,Math.min(w-340,pointer.x+16))}px`;tooltip.style.top=`${Math.max(8,Math.min(h-tooltip.offsetHeight-8,pointer.y+18))}px`;}
  },get active(){return active;},get menuOpen(){return !$('lens-panel').hidden;},toggleMenu(){menu($('lens-panel').hidden);},closeMenu(){menu(false);},clear};
}
