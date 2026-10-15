import {installRestorationUI} from './restoration-ui.js';
const layers={
  moisture:{legend:'Pale → deep blue · actual saved root-zone wetness. Rain and watering remain in the ground after harvest or demolition.',color:g=>`rgba(30,104,170,${.08+g.moisture*.55})`},
  shade:{legend:'Purple · shade from visible perimeter trees, food forests, timber, bamboo and banana beds. Shade slows drying; heavy shade reduces crop growth and solar output.',color:g=>`rgba(72,51,108,${g.shade*.65})`},
  fertility:{legend:'Brown → green · lower to higher fertility. Building work, roads and extraction leave lasting disturbance.',color:g=>`hsla(${30+g.fertility*80},45%,42%,.42)`},
  retention:{legend:'Pale → deep blue · how slowly this ground dries. This view shows retention, not stored water.',color:g=>`rgba(45,108,156,${.12+(g.retention-.65)/.7*.45})`},
  disturbance:{legend:'Orange · disturbed ground. Darker plots record foundation work, road building or extraction.',color:g=>`rgba(173,88,40,${g.disturbance*.6})`},
  earth:{material:2,name:'earth',legend:'Ochre · local earth patches. Faded patches are exhausted.',color:'#bb8c45'},
  stone:{material:3,name:'stone',legend:'Blue-grey · local stone patches. Faded patches are exhausted.',color:'#677e9a'},
  salvage:{material:4,name:'reclaimed material',legend:'Rust · local reclaimed patches. Faded patches are exhausted.',color:'#a06141'},
};
export function landTiles(report,layer){
  const rule=layers[layer];if(!rule)return [];
  return report.cells.flatMap(cell=>{
    if(rule.material==null){const amount=({disturbance:cell.ground.disturbance,moisture:cell.ground.moisture,shade:cell.ground.shade})[layer]||0,stroke=({disturbance:'rgba(147,74,28,.75)',moisture:'rgba(40,100,160,.6)',shade:'rgba(81,57,113,.55)'})[layer];return [{x:cell.x,y:cell.y,fill:rule.color(cell.ground),stroke:amount>.01?stroke:undefined}];}
    const patch=report.deposits.find(d=>d.material===rule.material&&cell.x>=d.x&&cell.x<d.x+d.width&&cell.y>=d.y&&cell.y<d.y+d.height);
    return patch?[{x:cell.x,y:cell.y,fill:rule.color+(patch.remaining?'88':'28'),stroke:rule.color+'66'}]:[];
  });
}
export function installLandMap(api){
  const $=id=>document.getElementById(id),panel=$('land-map'),toggle=$('land-map-toggle'),select=$('land-layer'),hover=$('land-hover');
  const soil=installRestorationUI(api);
  let report,key='',tiles=[],previewKey='',message='',focus=null,sampledAt=0,sampledMinute=-1;
  function rebuild(){key='';previewKey='';$('land-legend').textContent=layers[select.value].legend;}
  function close(){soil.clear();panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();api.render();}
  toggle.onclick=()=>{if(!panel.hidden){close();return;}panel.hidden=false;toggle.setAttribute('aria-expanded','true');rebuild();select.focus();api.render();};
  $('land-map-close').onclick=close;select.onchange=()=>{rebuild();api.render();};
  return {close,pin(point,tool){if(panel.hidden)return false;return soil.pin(point,tool);},isOpen:()=>!panel.hidden,drawFocus(tile){if(panel.hidden)return;for(const j of api.snapshot().village.restoration||[]){if(j.finished!=null)continue;for(let x=j.x-Math.floor(j.size/2);x<j.x-Math.floor(j.size/2)+j.size;x++)for(let y=j.y-Math.floor(j.size/2);y<j.y-Math.floor(j.size/2)+j.size;y++)tile(x,y,'#78a35a22','#8eae6b');}const marked=soil.focus()||focus;if(!marked)return;const n=marked.size;for(let x=marked.x-Math.floor(n/2);x<marked.x-Math.floor(n/2)+n;x++)for(let y=marked.y-Math.floor(n/2);y<marked.y-Math.floor(n/2)+n;y++)tile(x,y,'#fff3b51a','#fff3b5');},draw({tile,pointer,tool}){
    if(panel.hidden)return;if(tool)soil.clear();soil.update();
    pointer=soil.point()||pointer;
    const v=api.snapshot().village,next=JSON.stringify([v.land.seed,v.land.revision,v.restoration,v.land.soil,v.land.deposits,v.buildings.map(b=>[b.kind,b.x,b.y,b.progress>=100]),v.economy.sources.map(s=>[s.active,s.x,s.y,Math.floor(s.growth*100),s.remaining])]),now=performance.now();
    if(next!==key||v.minutes!==sampledMinute&&now-sampledAt>=250){key=next;sampledMinute=v.minutes;sampledAt=now;report=JSON.parse(api.game().land_report());tiles=landTiles(report,select.value);previewKey='';}
    for(const cell of tiles)tile(cell.x,cell.y,cell.fill,cell.stroke);
    const marked=soil.focus();if(marked)pointer={x:marked.x,y:marked.y};
    const rule=layers[select.value],kind=tool||(marked?(marked.size===3?'source_timber':'garden'):({2:'source_earth',3:'source_stone',4:'source_salvage'}[rule.material]||'road'));
    const nextPreview=JSON.stringify([pointer,kind,key]);
    if(nextPreview===previewKey)return;previewKey=nextPreview;
    focus=null;
    if(!pointer)message='Point at a clearing to inspect its ground.';
    else{
      const preview=JSON.parse(api.game().land_preview(kind,pointer.x,pointer.y)),ground=preview.ground;
      if(!ground)message='Choose an inland clearing to inspect its ground.';
      else{
        focus={x:pointer.x,y:pointer.y,size:Math.sqrt(preview.cells)};
        message=`Plot ${pointer.x}, ${pointer.y} · ${preview.cells} ${preview.cells===1?'cell':'cells'}\nFertility ${Math.round(ground.fertility*100)}% · water retention ×${ground.retention.toFixed(2)}\nMoisture ${Math.round(ground.moisture*100)}% · tree shade ${Math.round(ground.shade*100)}%\nCrop growth ×${preview.growth_multiplier.toFixed(2)} · harvest ×${preview.yield_multiplier.toFixed(2)}\nSolar exposure ${Math.round(preview.solar_exposure*100)}% · disturbance ${Math.round(ground.disturbance*100)}%`;
        if(preview.deposit)message+=`\nLocal ${['','','earth','stone','reclaimed material'][preview.deposit.material]} patch · ${preview.deposit.remaining} / ${preview.deposit.maximum} remaining`;
        else if(rule.material!=null&&!tool)message+='\nNo matching local deposit at this plot.';
      }
    }
    if(hover.textContent!==message)hover.textContent=message;
  }};
}
