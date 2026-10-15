const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installRestorationUI(api){
  const $=id=>document.getElementById(id),button=$('land-restore'),list=$('land-restoration-jobs'),note=$('land-restoration-note');
  let pinned=null,preview=null,key='',sampled=0;
  const transact=result=>{if(result!=='ok'){api.notify(result);return;}api.changed();key='';update(true);};
  button.onclick=()=>{if(!pinned)return;const result=api.game().restore_plot(pinned.x,pinned.y);if(result==='ok'){pinned=null;preview=null;}transact(result);if(result==='ok'){api.notify('Soil work queued. Neighbours will deliver compost and restore this plot during community hours.');api.render();}};
  $('land-unpin').onclick=()=>{pinned=null;preview=null;update(true);api.render();};
  list.onclick=event=>{const b=event.target.closest('[data-cancel-soil]');if(b)transact(api.game().cancel_restoration(Number(b.dataset.cancelSoil)));};
  function update(force=false){
    const now=performance.now();if(!force&&now-sampled<250)return;sampled=now;
    const s=api.snapshot();preview=pinned?JSON.parse(api.game().restoration_preview(pinned.x,pinned.y)):null;
    button.disabled=!preview?.allowed||(s.environment.economy.materials[19]?.available||0)<2;
    $('land-unpin').hidden=!pinned;
    note.textContent=!pinned?'Click the ground to mark a plot for soil work.':preview.allowed?`Plot ${preview.x}, ${preview.y} · ${preview.size} × ${preview.size} cells. Two compost must arrive before a neighbour spends ${preview.minutes} minutes restoring the soil.`:preview.reason;
    const rows=JSON.parse(api.game().restoration_report()).jobs,visible=[...rows.filter(r=>r.job.finished==null),...rows.filter(r=>r.job.finished!=null).slice(-2)];
    const next=JSON.stringify(visible.map(r=>[r.job.id,r.phase,Math.ceil(r.remaining),r.compost_here]));if(next===key)return;key=next;
    const focused=document.activeElement?.dataset.cancelSoil;
    list.innerHTML=visible.map(r=>`<article class="soil-job"><b>Soil work · ${r.job.x}, ${r.job.y}</b><span>${escape(({awaiting_inputs:'Waiting for compost delivery',ready:'Ready for a neighbour',working:'Soil work started · follows community hours',complete:'Soil restored',cancelled:r.job.work>0?'Cancelled; partial soil work remains':'Cancelled; unused compost stays available'})[r.phase])}</span>${r.job.finished==null?`<progress max="32" value="${r.job.work}" aria-label="Soil work progress"></progress><small>${r.job.spent?'Compost has been mixed in; cancelling keeps the soil work already done. ' : ''}${Math.ceil(r.remaining)} minutes of work left${r.job.spent?'':` · ${r.compost_here} / 2 compost here`}</small><button data-cancel-soil="${r.job.id}">Cancel soil work</button>`:''}</article>`).join('');
    if(focused)list.querySelector(`[data-cancel-soil="${focused}"]`)?.focus({preventScroll:true});
  }
  return {pin(point,tool){if(tool)return false;pinned={...point};update(true);return true;},clear(){pinned=null;preview=null;},update,focus(){return preview?.allowed?{x:preview.x,y:preview.y,size:preview.size}:null;},point:()=>pinned};
}
