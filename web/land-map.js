const layers={
  fertility:{legend:'Brown → green · lower to higher fertility. Building work leaves a lasting disturbance.',color:g=>`hsla(${30+g.fertility*80},45%,42%,.42)`},
  retention:{legend:'Pale → deep blue · how slowly this ground dries. This view shows retention, not stored water.',color:g=>`rgba(45,108,156,${.12+(g.retention-.65)/.7*.45})`},
  disturbance:{legend:'Orange · disturbed ground. A darker plot has seen more foundation work.',color:g=>`rgba(173,88,40,${g.disturbance*.6})`},
  earth:{material:2,name:'earth',legend:'Ochre · local earth patches. Faded patches are exhausted.',color:'#bb8c45'},
  stone:{material:3,name:'stone',legend:'Blue-grey · local stone patches. Faded patches are exhausted.',color:'#677e9a'},
  salvage:{material:4,name:'reclaimed material',legend:'Rust · local reclaimed patches. Faded patches are exhausted.',color:'#a06141'},
};
export function landTiles(report,layer){
  const rule=layers[layer];if(!rule)return [];
  return report.cells.flatMap(cell=>{
    if(rule.material==null)return [{x:cell.x,y:cell.y,fill:rule.color(cell.ground),stroke:layer==='disturbance'&&cell.ground.disturbance>0?'rgba(147,74,28,.75)':undefined}];
    const patch=report.deposits.find(d=>d.material===rule.material&&cell.x>=d.x&&cell.x<d.x+d.width&&cell.y>=d.y&&cell.y<d.y+d.height);
    return patch?[{x:cell.x,y:cell.y,fill:rule.color+(patch.remaining?'88':'28'),stroke:rule.color+'66'}]:[];
  });
}
export function installLandMap(api){
  const $=id=>document.getElementById(id),panel=$('land-map'),toggle=$('land-map-toggle'),select=$('land-layer'),hover=$('land-hover');
  let report,key='',tiles=[],previewKey='',message='';
  function rebuild(){key='';previewKey='';$('land-legend').textContent=layers[select.value].legend;}
  function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();api.render();}
  toggle.onclick=()=>{if(!panel.hidden){close();return;}panel.hidden=false;toggle.setAttribute('aria-expanded','true');rebuild();select.focus();api.render();};
  $('land-map-close').onclick=close;select.onchange=()=>{rebuild();api.render();};
  return {close,isOpen:()=>!panel.hidden,draw({tile,pointer,tool}){
    if(panel.hidden)return;
    const v=api.snapshot().village,next=JSON.stringify(v.land);
    if(next!==key){key=next;report=JSON.parse(api.game().land_report());tiles=landTiles(report,select.value);previewKey='';}
    for(const cell of tiles)tile(cell.x,cell.y,cell.fill,cell.stroke);
    const rule=layers[select.value],kind=tool||({2:'source_earth',3:'source_stone',4:'source_salvage'}[rule.material]||'road');
    const nextPreview=JSON.stringify([pointer,kind,key]);
    if(nextPreview===previewKey)return;previewKey=nextPreview;
    if(!pointer)message='Point at a clearing to inspect its ground.';
    else{
      const preview=JSON.parse(api.game().land_preview(kind,pointer.x,pointer.y)),ground=preview.ground;
      if(!ground)message='Choose an inland clearing to inspect its ground.';
      else{
        message=`Plot ${pointer.x}, ${pointer.y} · ${preview.cells} ${preview.cells===1?'cell':'cells'}\nFertility ${Math.round(ground.fertility*100)}% · water retention ×${ground.retention.toFixed(2)}\nDisturbance ${Math.round(ground.disturbance*100)}% · ground cover ${Math.round(ground.cover*100)}%`;
        if(preview.deposit)message+=`\nLocal ${['','','earth','stone','reclaimed material'][preview.deposit.material]} patch · ${preview.deposit.remaining} / ${preview.deposit.maximum} remaining`;
        else if(rule.material!=null&&!tool)message+='\nNo matching local deposit at this plot.';
      }
    }
    if(hover.textContent!==message)hover.textContent=message;
  }};
}
