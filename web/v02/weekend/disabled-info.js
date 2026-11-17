// Keep explanations focusable: disabled controls themselves cannot receive focus.
export function disabledReason(control, reason) {
  control.dataset.disabledReason = reason || '';
}
export function installDisabledInfo() {
  const styles=document.createElement('link');styles.rel='stylesheet';styles.href=new URL('./disabled-info.css',import.meta.url).href;document.head.append(styles);
  const entries=new Map();
  const tip=document.createElement('div');tip.id='disabled-action-tooltip';tip.role='tooltip';tip.className='disabled-action-tooltip';tip.setAttribute('popover','manual');document.body.append(tip);
  let active=null,scheduled=false,scrolling=false,scrollTimer;
  const hide=()=>{if(tip.matches(':popover-open'))tip.hidePopover();active?.removeAttribute('aria-describedby');active=null;};
  function show(icon,control) {
    if(scrolling)return;
    hide();active=icon;tip.textContent=control.dataset.disabledReason||'This action is not available yet.';
    // Keep the tooltip inside the modal's focus scope while rendering above it.
    (control.closest('dialog[open]')||document.body).append(tip);
    tip.showPopover();icon.setAttribute('aria-describedby',tip.id);
    const r=icon.getBoundingClientRect();
    tip.style.left=`${Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,r.right-tip.offsetWidth))}px`;
    tip.style.top=`${Math.max(8,r.top-tip.offsetHeight-8>=8?r.top-tip.offsetHeight-8:Math.min(innerHeight-tip.offsetHeight-8,r.bottom+8))}px`;
  }
  function update() {
    scheduled=false;
    if(scrolling)return;
    const modal=document.querySelector('dialog[open]');
    for(const [control,icon] of entries)if(!control.isConnected||!control.disabled){if(active===icon)hide();icon.remove();control.classList.remove('has-disabled-info');entries.delete(control);}
    for(const control of document.querySelectorAll('button:disabled,select:disabled,input:disabled')) {
      let icon=entries.get(control);
      if(!icon){
        icon=document.createElement('button');icon.type='button';icon.className='disabled-info';icon.textContent='ⓘ';icon.setAttribute('popover','manual');
        icon.addEventListener('mouseenter',()=>show(icon,control));icon.addEventListener('mouseleave',()=>{if(document.activeElement!==icon)hide();});
        icon.addEventListener('focus',()=>show(icon,control));icon.addEventListener('blur',hide);icon.addEventListener('click',()=>show(icon,control));
        entries.set(control,icon);control.classList.add('has-disabled-info');
      }
      const parent=control.closest('dialog[open]')||document.body;
      if(icon.parentElement!==parent)parent.append(icon);
      icon.setAttribute('aria-label',`Why unavailable: ${control.dataset.disabledReason||'This action is not available yet.'}`);
      const r=control.getBoundingClientRect();
      let visible=!!control.getClientRects().length&&!control.closest('[hidden]')&&(!modal||modal.contains(control))&&r.bottom>0&&r.top<innerHeight;
      for(let p=control.parentElement;p&&p!==document.body&&visible;p=p.parentElement){const style=getComputedStyle(p);if(/auto|scroll|hidden/.test(style.overflowY)){const pr=p.getBoundingClientRect();visible=r.top>=pr.top&&r.top+20<=pr.bottom;}}
      if(!visible){if(icon.matches(':popover-open'))icon.hidePopover();if(active===icon)hide();continue;}
      if(!icon.matches(':popover-open'))icon.showPopover();
      const compact=control.matches('input[type=checkbox],input[type=radio]');
      icon.style.left=`${compact?r.right+4:r.right-(control.tagName==='SELECT'?44:22)}px`;
      icon.style.top=`${r.top+(r.height-18)/2}px`;
      if(active===icon&&tip.textContent!==control.dataset.disabledReason)show(icon,control);
    }
  }
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(update);}};
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','hidden','open','data-disabled-reason']});
  // Top-layer hints do not move with their scroll container. Hide them during
  // scrolling, including momentum scrolling, then measure their targets again.
  document.addEventListener('scroll',()=>{
    scrolling=true;hide();
    for(const icon of entries.values())if(icon.matches(':popover-open'))icon.hidePopover();
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=>{scrolling=false;schedule();},120);
  },true);
  window.addEventListener('resize',()=>{hide();schedule();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});schedule();
}
