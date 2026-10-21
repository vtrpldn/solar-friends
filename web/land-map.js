import {landLayers as layers,landTiles} from './land-layers.js';
export {landTiles} from './land-layers.js';
import {installRestorationUI} from './restoration-ui.js';
import {MAP_SIZE,riverBank} from './terrain.js';
const groundCells=Array.from({length:MAP_SIZE*MAP_SIZE},(_,i)=>({x:i%MAP_SIZE,y:Math.floor(i/MAP_SIZE)})).filter(c=>!riverBank(c.x,c.y));
export const sourceLandLayer=tool=>({source_earth:'earth',source_stone:'stone',source_salvage:'salvage'})[tool];
export const landPreviewKind=(layer,tool,marked)=>tool||({earth:'source_earth',stone:'source_stone',salvage:'source_salvage'})[layer]||(marked?(marked.size===3?'source_timber':'garden'):'road');
export function installLandMap(api){
  const $=id=>document.getElementById(id),panel=$('land-map'),toggle=$('land-map-toggle'),select=$('land-layer'),hover=$('land-hover');
  const soil=installRestorationUI(api);
  let report,key='',tiles=[],previewKey='',message='',focus=null,sampledAt=0,sampledMinute=-1,placementKey='',placementTiles=[];
  function rebuild(){key='';previewKey='';$('land-legend').textContent=layers[select.value].legend;}
  function close(){soil.clear();panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();api.render();}
  toggle.onclick=()=>{if(!panel.hidden){close();return;}panel.hidden=false;toggle.setAttribute('aria-expanded','true');rebuild();select.focus();api.render();};
  $('land-map-close').onclick=close;select.onchange=()=>{rebuild();api.render();};
  return {close,pin(point,tool){if(panel.hidden)return false;return soil.pin(point,tool);},isOpen:()=>!panel.hidden,drawFocus(tile){if(panel.hidden)return;for(const j of api.snapshot().village.restoration||[]){if(j.finished!=null)continue;for(let x=j.x-Math.floor(j.size/2);x<j.x-Math.floor(j.size/2)+j.size;x++)for(let y=j.y-Math.floor(j.size/2);y<j.y-Math.floor(j.size/2)+j.size;y++)tile(x,y,'#78a35a22','#8eae6b');}const marked=soil.focus()||focus;if(!marked)return;const n=marked.size;for(let x=marked.x-Math.floor(n/2);x<marked.x-Math.floor(n/2)+n;x++)for(let y=marked.y-Math.floor(n/2);y<marked.y-Math.floor(n/2)+n;y++)tile(x,y,'#fff3b51a','#fff3b5');},draw({tile,pointer,tool}){
    if(panel.hidden){
      const layer=sourceLandLayer(tool);if(!layer)return;
      const land=api.snapshot().village.land,next=JSON.stringify([layer,land.seed,land.deposits.map(d=>d.remaining)]);
      if(next!==placementKey){placementKey=next;placementTiles=landTiles({cells:groundCells,deposits:land.deposits},layer);}
      for(const cell of placementTiles)tile(cell.x,cell.y,cell.fill,'#f7e7ae99');
      return;
    }
    if(tool)soil.clear();soil.update();
    pointer=soil.point()||pointer;
    const v=api.snapshot().village,next=JSON.stringify([v.land.seed,v.land.revision,v.restoration,v.land.soil,v.land.deposits,v.buildings.map(b=>[b.kind,b.x,b.y,b.progress>=100]),v.economy.sources.map(s=>[s.active,s.x,s.y,Math.floor(s.growth*100),s.remaining])]),now=performance.now();
    if(next!==key||v.minutes!==sampledMinute&&now-sampledAt>=250){key=next;sampledMinute=v.minutes;sampledAt=now;report=JSON.parse(api.game().land_report());tiles=landTiles(report,select.value);previewKey='';}
    for(const cell of tiles)tile(cell.x,cell.y,cell.fill,cell.stroke);
    const marked=soil.focus();if(marked)pointer={x:marked.x,y:marked.y};
    const rule=layers[select.value],kind=landPreviewKind(select.value,tool,marked);
    const nextPreview=JSON.stringify([pointer,kind,key]);
    if(nextPreview===previewKey)return;previewKey=nextPreview;
    focus=null;
    if(!pointer)message='Point at a clearing to inspect its ground.';
    else{
      const preview=JSON.parse(api.game().land_preview(kind,pointer.x,pointer.y)),ground=preview.ground;
      if(!ground)message='Choose an inland clearing to inspect its ground.';
      else{
        focus={x:pointer.x,y:pointer.y,size:Math.sqrt(preview.cells)};
        message=`${ground.biome} · ${ground.geology}\nPlot ${pointer.x}, ${pointer.y} · ${preview.cells} ${preview.cells===1?'cell':'cells'}\nFertility ${Math.round(ground.fertility*100)}% · water retention ×${ground.retention.toFixed(2)}\nMoisture ${Math.round(ground.moisture*100)}% · tree shade ${Math.round(ground.shade*100)}%\nCrop growth ×${preview.growth_multiplier.toFixed(2)} · harvest ×${preview.yield_multiplier.toFixed(2)}\nSolar exposure ${Math.round(preview.solar_exposure*100)}% · disturbance ${Math.round(ground.disturbance*100)}%`;
        if(preview.deposit)message+=`\nLocal ${['','','earth','stone','reclaimed material'][preview.deposit.material]} patch · ${preview.deposit.remaining} / ${preview.deposit.maximum} remaining`;
        else if(rule.material!=null&&!tool)message+='\nNo matching local deposit at this plot.';
      }
    }
    if(hover.textContent!==message)hover.textContent=message;
  }};
}
