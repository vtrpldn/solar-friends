import { installWorkbench } from './workbench.js';
import { sampleResidentClip, drawResidentAnimation } from '../resident-animation.js?v=2';
import { drawBuildingArt } from '../building-art.js?v=night-1';
import { catalog } from './catalog.js?v=night-1';
import { CHICKEN_WIDTH, drawChicken, loadChickenArt } from '../chickens.js?v=painted-hens-1';
import { drawPreparedFrame, animationFrameOptions } from '../sprite-frames.js';
import { cropFrameOptions } from '../crop-art.js';
const $ = id => document.getElementById(id);
const key = 'solar-friends-artwork-review-v1';
let reviews = {}, selected = catalog[0], pins = [], playing = false, playbackStarted = false, frame = 0;
try { const data = JSON.parse(localStorage.getItem(key) || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) reviews = data; } catch { $('save-state').textContent = 'Saved review could not be read. Export new notes before leaving.'; }
loadChickenArt().then(redraw).catch(() => { $('save-state').textContent = 'Chicken artwork could not load. Reload to retry.'; });
const surfaces = new WeakMap();
let animationSeconds = 0, previousStamp = 0;
const images = new Map();
let workbench;
for (const sprite of catalog) if (sprite.file && !images.has(sprite.file)) {
  const img = new Image(); images.set(sprite.file, img); img.src = sprite.file;
  img.onload = redraw;
  img.onerror = redraw;
}
for (const group of new Set(catalog.map(s => s.group))) $('group').add(new Option(group));
function review(s) { return reviews[s.id] || {status:'Unreviewed',notes:''}; }
function draw(canvas, sprite, bench = false) {
  const width = canvas.clientWidth || 180, height = bench ? 270 : 130;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const mode = bench ? $('scale').value : '0.65';
  let w = mode === 'fit' ? Math.min(width * .86, height * .84) : sprite.width * Number(mode === 'game' ? 1 : mode);
  const h = w * (sprite.aspect || 1), anchor = sprite.anchor ?? .76;
  const y = mode === 'fit' ? (height - h) / 2 + h * anchor : height * .77;
  if (bench && $('guides').checked) {
    ctx.strokeStyle = '#bd7658'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.moveTo(width/2,0);ctx.lineTo(width/2,height);
    ctx.moveTo(width/2-65,y);ctx.lineTo(width/2,y-32.5);ctx.lineTo(width/2+65,y);ctx.lineTo(width/2,y+32.5);ctx.closePath();ctx.stroke();
  }
  ctx.save();ctx.translate(width/2,y);if (bench && $('mirror').checked) ctx.scale(-1,1);
  if (sprite.chicken) drawChicken(ctx,{x:0,y:0},w/CHICKEN_WIDTH,{variant:sprite.variant,facing:1,peck:bench ? frame : 0});
  else if (sprite.building) {
    drawBuildingArt(ctx, images.get(sprite.file), sprite, 0, 0, w / sprite.width);
  } else {
    const img = images.get(sprite.file);
    if (!img?.complete || !img.naturalWidth) { ctx.restore();ctx.fillStyle='#9b4b37';ctx.font='12px sans-serif';ctx.fillText(img?.complete ? 'Artwork unavailable' : 'Loading…',10,25);return; }
    if (sprite.animation && bench && playbackStarted) {
      const mode = (sprite.activityAnimation ? ['cook','water','tend','feed'] : sprite.idleAnimation ? ['look','stretch','wave','relax'] : ['walk','work','breathe','sit'])[Number($('action').value)];
      const layers = sampleResidentClip(mode, animationSeconds % 8);
      let surface = surfaces.get(canvas);
      if (!surface) { surface = document.createElement('canvas'); surface.width = surface.height = 256; surfaces.set(canvas, surface); }
      drawResidentAnimation(ctx, surface, {base:img,idle:img,activities:img}, {layers,facing:1,breath:1}, 0, 0, w);
      ctx.restore(); return;
    }
    if (sprite.portrait) drawPreparedFrame(ctx,img,8,0,0,w,{referenceRow:2});
    else if (sprite.animation) drawPreparedFrame(ctx,img,Number($('action').value)*4+(bench ? frame : 0),0,0,w,animationFrameOptions(sprite));
    else if (sprite.crop) drawPreparedFrame(ctx,img,sprite.frame,0,0,w,cropFrameOptions);
    else { const cell=sprite.cell;ctx.drawImage(img,cell[0]*img.naturalWidth,cell[1]*img.naturalHeight,cell[2]*img.naturalWidth,cell[3]*img.naturalHeight,-w/2,-h*anchor,w,h); }
  }
  ctx.restore();
}
function redraw() { document.querySelectorAll('canvas[data-id]').forEach(c => draw(c,catalog.find(s => s.id === c.dataset.id),c.dataset.bench === 'true')); }
function makeCanvas(sprite, bench = false) { const c = document.createElement('canvas');c.dataset.id=sprite.id;c.dataset.bench=String(bench);c.setAttribute('aria-label',sprite.name);return c; }
function renderLibrary() {
  const query = $('search').value.trim().toLowerCase();
  const visible = catalog.filter(s => `${s.name} ${s.file || ''}`.toLowerCase().includes(query) && ($('group').selectedIndex === 0 || s.group === $('group').value) && ($('usage').selectedIndex === 0 || s.usage === $('usage').value) && ($('review-filter').selectedIndex === 0 || review(s).status === $('review-filter').value));
  $('count').textContent = `${visible.length} / ${catalog.length}`;
  $('cards').replaceChildren();
  for (const s of visible) {
    const card = document.createElement('article');card.className=`card${s.id === selected.id ? ' selected' : ''}`;
    const pick=document.createElement('button');pick.className='pick';pick.setAttribute('aria-pressed',String(s.id===selected.id));pick.append(makeCanvas(s));
    const name=document.createElement('strong');name.textContent=s.name;pick.append(name);
    const meta=document.createElement('small');meta.textContent=`${s.group} · ${s.usage} · ${review(s).status}`;pick.append(meta);
    pick.onclick=()=>{selected=s;workbench?.select(s);playbackStarted=false;renderLibrary();loadReview();renderBench();};
    const pin=document.createElement('button');pin.className='pin';pin.textContent=pins.includes(s.id)?'Unpin':'Pin to compare';pin.setAttribute('aria-pressed',String(pins.includes(s.id)));
    pin.onclick=()=>{if(pins.includes(s.id)) pins=pins.filter(id=>id!==s.id);else if(pins.length<3) pins.push(s.id);else { $('save-state').textContent='Up to three comparison pins. Unpin one to add another.';return;}renderLibrary();renderBench();};
    card.append(pick,pin);$('cards').append(card);
  }
  if (!visible.length) $('cards').textContent='No sprites match these filters.';
  redraw();
}
function renderBench() {
  $('bench').replaceChildren();
  for (const id of new Set([selected.id,...pins])) {
    const s=catalog.find(s=>s.id===id), figure=document.createElement('figure');figure.className=`specimen ${$('surface').value}`;
    const caption=document.createElement('figcaption');caption.textContent=s.name;figure.append(makeCanvas(s,true),caption);$('bench').append(figure);
  }
  redraw();
}
function loadReview() {
  const bank = selected.activityAnimation ? 'activities' : selected.idleAnimation ? 'standing' : 'base';
  if ($('action').dataset.bank !== bank) {
    $('action').dataset.bank = bank;
    const labels = selected.activityAnimation ? ['Cook','Water','Tend / gather','Feed hens'] : selected.idleAnimation ? ['Look around','Stretch','Wave','Hands on hips'] : ['Walk','Build','Idle','Sit / sleep'];
    $('action').replaceChildren(...labels.map((label,i) => new Option(label, String(i))));
    animationSeconds = 0;
  }
  $('selected-name').textContent=selected.name;$('status').value=review(selected).status;$('notes').value=review(selected).notes || '';
  $('source').href=selected.file || '../chickens.js?v=painted-hens-1';
  $('source').textContent=selected.procedural?'Open canvas drawing source ↗':'Open source artwork ↗';
  $('metadata').textContent=selected.procedural?'Procedural canvas sprite · shared with the game renderer':`${selected.file.replace('../','')} · ${selected.chicken?'3 hens × 2 poses':selected.animation?'4 × 4 animation sheet':`cell ${selected.cell.join(', ')}`} · base width ${Math.round(selected.width)} px`;
}
function save() {
  reviews[selected.id]={status:$('status').value,notes:$('notes').value};
  try {localStorage.setItem(key,JSON.stringify(reviews));$('save-state').textContent='Saved in this browser. Export to share.';}catch {$('save-state').textContent='Browser storage unavailable. Export your review before leaving.';}
  renderLibrary();
}
for(const id of ['search','group','usage','review-filter']) $(id).addEventListener('input',renderLibrary);
for(const id of ['surface','scale','guides','action','mirror']) $(id).addEventListener('change',()=>{animationSeconds=0;renderBench();});
$('frame').oninput=()=>{playing=false;playbackStarted=false;$('play').textContent='Play animation';$('play').setAttribute('aria-pressed','false');frame=Number($('frame').value);redraw();};
$('play').onclick=()=>{playing=!playing;if(playing){animationSeconds=0;playbackStarted=true;}$('play').textContent=playing?'Pause animation':'Play animation';$('play').setAttribute('aria-pressed',String(playing));};
function animate(stamp) {
  const delta = previousStamp ? Math.min((stamp - previousStamp) / 1000, .1) : 0;
  previousStamp = stamp;
  if (playing && !document.hidden) { animationSeconds += delta; frame = Math.floor(animationSeconds * 2) % 4; $('frame').value = frame; redraw(); }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
$('clear').onclick=()=>{pins=[];renderLibrary();renderBench();};
$('status').onchange=save;$('notes').oninput=save;
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),sprites:catalog.map(s=>({id:s.id,name:s.name,source:s.file || '../chickens.js?v=painted-hens-1',...review(s)}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='solar-friends-artwork-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
new ResizeObserver(redraw).observe($('bench'));
renderLibrary();loadReview();renderBench();

workbench = installWorkbench({ getSelected: () => selected, images, onSelect: sprite => { selected = sprite; renderLibrary(); loadReview(); renderBench(); } });
