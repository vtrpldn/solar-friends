// One viewport-clamped tooltip avoids clipping inside the scrolling catalog.
export function materialTooltip(){
 const tip=document.createElement('div');tip.id='missing-materials-tooltip';tip.role='tooltip';tip.hidden=true;document.body.append(tip);
 let active=null;
 const hide=()=>{active?.removeAttribute('aria-describedby');active=null;tip.hidden=true;};
 function show(button){
  const text=button.dataset.missingMaterials;if(!text)return hide();
  active?.removeAttribute('aria-describedby');active=button;tip.textContent=text;tip.hidden=false;button.setAttribute('aria-describedby',tip.id);
  const rect=button.querySelector('.material-warning').getBoundingClientRect();
  tip.style.left=`${Math.max(8,Math.min(innerWidth-tip.offsetWidth-8,rect.right-tip.offsetWidth))}px`;
  tip.style.top=`${Math.max(8,rect.top-tip.offsetHeight-8>=8?rect.top-tip.offsetHeight-8:Math.min(innerHeight-tip.offsetHeight-8,rect.bottom+8))}px`;
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
 return {attach(button){
  const icon=button.querySelector('.material-warning');
  icon.addEventListener('mouseenter',()=>show(button));icon.addEventListener('mouseleave',hide);
  button.addEventListener('focus',()=>show(button));button.addEventListener('blur',hide);button.addEventListener('click',hide);
 },update(button,missing){
  button.dataset.missingMaterials=missing.length?`Missing materials\n${missing.map(m=>`• ${m}`).join('\n')}`:'';
  if(active===button)show(button);
 }};
}
