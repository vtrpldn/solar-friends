import { drawBuildingArt } from '../building-art.js';
import { catalog } from './catalog.js';
import { drawChicken } from '../chickens.js';
const $ = id => document.getElementById(id);
const key = 'solar-friends-artwork-review-v1';
let reviews = {}, selected = catalog[0], pins = [], playing = false, frame = 0;
try { const data = JSON.parse(localStorage.getItem(key) || '{}'); if (data && typeof data === 'object' && !Array.isArray(data)) reviews = data; } catch { $('save-state').textContent = 'Saved review could not be read. Export new notes before leaving.'; }
const images = new Map();
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
  if (sprite.procedural) drawChicken(ctx,{x:0,y:0},w/26,{color:sprite.color,facing:1,peck:playing ? frame : 0});
  else if (sprite.building) {
    drawBuildingArt(ctx, images.get(sprite.file), sprite, 0, 0, w / sprite.width);
  } else {
    const img = images.get(sprite.file);
    if (!img?.complete || !img.naturalWidth) { ctx.restore();ctx.fillStyle='#9b4b37';ctx.font='12px sans-serif';ctx.fillText(img?.complete ? 'Artwork unavailable' : 'Loading…',10,25);return; }
    const cell = sprite.animation ? [(bench ? frame : 0)/4,Number($('action').value)/4,.25,.25] : sprite.cell;
    ctx.drawImage(img,cell[0]*img.naturalWidth,cell[1]*img.naturalHeight,cell[2]*img.naturalWidth,cell[3]*img.naturalHeight,-w/2,-h*anchor,w,h);
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
    pick.onclick=()=>{selected=s;renderLibrary();renderBench();loadReview();};
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
  $('selected-name').textContent=selected.name;$('status').value=review(selected).status;$('notes').value=review(selected).notes || '';
  $('source').href=selected.file || '../chickens.js';
  $('source').textContent=selected.procedural?'Open canvas drawing source ↗':'Open source artwork ↗';
  $('metadata').textContent=selected.procedural?'Procedural canvas sprite · shared with the game renderer':`${selected.file.replace('../','')} · ${selected.animation?'4 × 4 animation sheet':`cell ${selected.cell.join(', ')}`} · base width ${Math.round(selected.width)} px`;
}
function save() {
  reviews[selected.id]={status:$('status').value,notes:$('notes').value};
  try {localStorage.setItem(key,JSON.stringify(reviews));$('save-state').textContent='Saved in this browser. Export to share.';}catch {$('save-state').textContent='Browser storage unavailable. Export your review before leaving.';}
  renderLibrary();
}
for(const id of ['search','group','usage','review-filter']) $(id).addEventListener('input',renderLibrary);
for(const id of ['surface','scale','guides','action','mirror']) $(id).addEventListener('change',renderBench);
$('frame').oninput=()=>{playing=false;$('play').textContent='Play animation';$('play').setAttribute('aria-pressed','false');frame=Number($('frame').value);redraw();};
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause animation':'Play animation';$('play').setAttribute('aria-pressed',String(playing));};
setInterval(()=>{if(playing&&!document.hidden){frame=(frame+1)%4;$('frame').value=frame;redraw();}},200);
$('clear').onclick=()=>{pins=[];renderLibrary();renderBench();};
$('status').onchange=save;$('notes').oninput=save;
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),sprites:catalog.map(s=>({id:s.id,name:s.name,source:s.file || '../chickens.js',...review(s)}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='solar-friends-artwork-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
new ResizeObserver(redraw).observe($('bench'));
renderLibrary();renderBench();loadReview();
