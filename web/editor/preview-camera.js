// Comparison cameras are local view state, never authored map edits.
export function bindPreviewCamera({preview,controls,camp}){
 const available=()=>!!preview.document&&!preview.canvas.hidden;
 const home=()=>{if(available()){const point=camp();if(point)preview.centerAt(...point);}};
 for(const button of controls.querySelectorAll('[data-preview-zoom]'))button.onclick=()=>{if(available())preview.setZoom(preview.view.zoom+Number(button.dataset.previewZoom)*.15);};
 controls.querySelector('[data-preview-camp]').onclick=home;
 preview.canvas.addEventListener('keydown',event=>{
  if(!available()||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.key==='Escape'){
   if(preview.cancelGesture()){event.preventDefault();event.stopPropagation();}
   return;
  }
  const directions={ArrowUp:[-1,-1],ArrowDown:[1,1],ArrowLeft:[-1,1],ArrowRight:[1,-1]},d=directions[event.key];
  if(d){event.preventDefault();preview.centerAt(preview.view.center[0]+d[0]*2,preview.view.center[1]+d[1]*2);}
  else if(['+','=','-','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')home();else preview.setZoom(preview.view.zoom+(event.key==='-'?-.15:.15));}
 });
}
