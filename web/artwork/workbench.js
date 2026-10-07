import { buildingArt, drawBuildingArt } from '../building-art.js?v=night-1';
import { chickenFrame } from '../chickens.js?v=painted-hens-1';
import { catalog } from './catalog.js?v=night-1';
import { reviewPixels } from './pixel-checks.js';
import { defaultRecipe } from './recipes.js';
import { download } from '../dev/tools.js';
const $ = id => document.getElementById(id);
const storageKey = 'solar-friends-art-recipes-v1';
export function installWorkbench({ getSelected, images, onSelect }) {
  let selected, draft, candidate = null, candidateData = null, report = null, recipes = {}, loadToken = 0;
  const section = document.createElement('section'); section.id = 'art-workbench';
  section.innerHTML = `<div class="workbench-heading"><div><span class="eyebrow">ART DIRECTION / PRACTICAL TOOLS</span><h2 id="workbench-name"></h2></div><label>Working sprite<select id="workbench-sprite"></select></label></div>
    <nav class="workbench-tabs" aria-label="Artwork tools"><button data-art-tab="calibration" aria-pressed="true">Calibrate</button><button data-art-tab="replacement" aria-pressed="false">Review replacement</button><button data-art-tab="recipe" aria-pressed="false">Recipe card</button></nav>
    <section data-art-page="calibration"><div class="workbench-layout"><div><canvas id="calibration-scene" aria-label="Game scale comparison with home and resident"></canvas><p class="hint">At game scale beside a home and Iara. The diamond shows the map’s 2:1 ground axes.</p><div class="controls"><label>Scene zoom<select id="calibration-zoom"><option value="1">Game scale × 1</option><option value="2">Game scale × 2</option></select></label><label>Lighting<input id="calibration-light" type="range" min="0" max="1" step="0.05" value="0"></label></div><canvas id="anchor-canvas" class="checker" aria-label="Drag the red ground marker vertically to calibrate the anchor" tabindex="0"></canvas><p class="hint">Drag the red ground marker up or down. Use the numeric field or arrow keys for precise changes. This view shows the untransformed source cell.</p></div>
    <div><div class="workbench-form"><label>Cell width in game pixels<input id="cal-width" type="number" min="8" max="400" step="0.1"></label><label>Ground anchor (0–1)<input id="cal-anchor" type="number" min="0" max="1" step="0.005"></label><label>Right ground slope<input id="cal-right" type="number" min="0.1" max="2" step="0.01"></label><label>Left ground slope<input id="cal-left" type="number" min="-2" max="-0.1" step="0.01"></label></div><p class="hint">Camera calibration applies to building sprites. Non-building widths and anchors export as a proposal for their renderer.</p><div class="workbench-actions"><button id="cal-reset">Reset calibration</button><button id="cal-export">Export configuration</button><button id="cal-preview">Preview draft in game ↗</button></div><pre id="cal-config"></pre><p>Draft settings never change production artwork. Export them for a reviewed code change.</p></div></div></section>
    <section data-art-page="replacement" hidden><div class="workbench-layout"><div><canvas id="replacement-scene" aria-label="Original and replacement at game scale"></canvas><div class="controls"><label>Scale<select id="replacement-zoom"><option value="1">Game scale × 1</option><option value="2">Game scale × 2</option></select></label><label>Night blend<input id="replacement-light" type="range" min="0" max="1" step="0.05" value="0"></label><label>Comparison<select id="replacement-mode"><option value="side">Side by side</option><option value="overlay">Silhouette overlay</option><option value="difference">Pixel difference</option></select></label><label>Activity<select id="replacement-row"><option value="0">Row 1</option><option value="1">Row 2</option><option value="2">Row 3</option><option value="3">Row 4</option></select></label><label>Frame<input id="replacement-frame" type="range" min="0" max="3" value="0"></label></div><p class="hint">Original on the left; candidate on the right. Overlays share the exact crop and anchor. Use the full source sheet for atlas replacements.</p></div><div><label>Candidate PNG<input id="replacement-file" type="file" accept="image/png"></label><div class="workbench-actions"><button id="replacement-preview">Preview candidate in game ↗</button><button id="replacement-export">Export pixel report</button><button id="replacement-clear">Discard candidate</button></div><pre id="replacement-report">Choose a PNG to check dimensions, silhouette changes, atlas edges, padding and animation baselines.</pre><p>Automated flags locate changes. Check palette, painted style, identity, camera and lighting visually before approving.</p></div></div></section>
    <section data-art-page="recipe" hidden><div class="workbench-layout"><div><p id="recipe-rules"></p><div id="recipe-references"></div><label>Working generation brief<textarea id="recipe-prompt"></textarea></label><p class="hint">Use these reference images with the brief. This tool prepares a recipe; it does not call an image generator.</p><div class="workbench-actions"><button id="recipe-export">Export recipe & brief</button><button id="recipe-reset">Restore suggested brief</button></div></div><div><h3>Revision history</h3><label>What changed?<input id="recipe-note" placeholder="Describe the revision and review outcome"></label><div class="workbench-actions"><button id="recipe-save">Save recipe revision</button></div><ol id="recipe-history"></ol><p class="hint">Recipe revisions stay in this browser. Export to keep them with the source artwork. Image bytes are identified by SHA-256; source versions live in Git.</p><details><summary>Original prompt records</summary><pre id="recipe-original"></pre></details></div></div></section><p id="workbench-status" role="status"></p>`;
  document.querySelector('main').prepend(section);
  try { const stored = JSON.parse(localStorage.getItem(storageKey) || '{}'); if (stored && typeof stored === 'object' && !Array.isArray(stored)) recipes = stored; } catch { $('workbench-status').textContent = 'Saved recipes could not be read.'; }
  for (const s of catalog) $('workbench-sprite').add(new Option(s.name, s.id));
  let originalRecords = {};
  const promptDrafts = new Map();
  fetch('./prompt-records.json').then(r => { if (!r.ok) throw new Error('Prompt records unavailable'); return r.json(); }).then(data => { originalRecords = data; renderRecipe(); }).catch(e => { $('recipe-original').textContent = e.message; });
  function showTab(name) {
    for (const b of section.querySelectorAll('[data-art-tab]')) b.setAttribute('aria-pressed', String(b.dataset.artTab === name));
    for (const page of section.querySelectorAll('[data-art-page]')) page.hidden = page.dataset.artPage !== name;
    redraw();
  }
  for (const b of section.querySelectorAll('[data-art-tab]')) b.onclick = () => showTab(b.dataset.artTab);
  function select(sprite) {
    if (selected) promptDrafts.set(selected.id, $('recipe-prompt').value);
    loadToken++; selected = sprite; draft = structuredClone(sprite); candidate = candidateData = report = null;
    $('workbench-sprite').value = sprite.id; $('workbench-name').textContent = sprite.name;
    $('replacement-file').value = '';
    $('replacement-report').textContent = 'Choose a PNG to check dimensions, silhouette changes, atlas edges, padding and animation baselines.';
    $('cal-preview').disabled = !sprite.building;
    $('cal-right').disabled = $('cal-left').disabled = !sprite.building;
    $('replacement-light').disabled = !sprite.building || sprite.name.includes('night');
    $('replacement-light').value = '0';
    $('replacement-row').disabled = $('replacement-frame').disabled = !(sprite.animation || sprite.chicken);
    controls(); renderRecipe(); redraw(); onSelect?.(sprite);
  }
  function controls() {
    $('cal-width').value = draft.width; $('cal-anchor').value = draft.anchor;
    $('cal-right').value = draft.axes?.[0] ?? .5; $('cal-left').value = draft.axes?.[1] ?? -.5;
    $('cal-config').textContent = JSON.stringify(config(), null, 2);
  }
  function config() { return { asset:selected.id, file:selected.file, width:draft.width, anchor:draft.anchor, cell:draft.cell, ...(draft.axes ? {axes:draft.axes} : {}) }; }
  function setup(canvas) {
    const w = canvas.clientWidth || 600, h = parseInt(getComputedStyle(canvas).height) || 320, ratio = devicePixelRatio || 1;
    canvas.width = w * ratio; canvas.height = h * ratio; const ctx = canvas.getContext('2d'); ctx.scale(ratio,ratio); return {ctx,w,h};
  }
  function paint(ctx, img, sprite, x, y, zoom = 1) {
    if (!img?.naturalWidth) return;
    if (sprite.building) return drawBuildingArt(ctx,img,sprite,x,y,zoom);
    let cell = sprite.cell, anchor = sprite.anchor;
    if (sprite.animation) cell = [Number($('replacement-frame').value)/4,Number($('replacement-row').value)/4,.25,.25];
    if (sprite.chicken) {
      const pose = chickenFrame({variant:sprite.variant,peck:Number($('replacement-row').value) ? 3 : 0});
      cell = [pose.column/3,pose.row*.5,1/3,.5];
      // Preserve a proposed calibration offset while using the game's pose baseline.
      anchor += pose.anchor - chickenFrame({variant:sprite.variant,peck:0}).anchor;
    }
    const [cx,cy,cw,ch] = cell, size = sprite.width*zoom;
    ctx.drawImage(img,cx*img.naturalWidth,cy*img.naturalHeight,cw*img.naturalWidth,ch*img.naturalHeight,x-size/2,y-size*anchor,size,size);
  }
  function scene() {
    const {ctx,w,h} = setup($('calibration-scene')), z = Number($('calibration-zoom').value), y = h*.73;
    const light = Number($('calibration-light').value);
    ctx.fillStyle = `rgba(20,35,60,${light*.7})`; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#f9edca77';
    for (let x=-w;x<w*2;x+=68*z) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+h*2,h);ctx.moveTo(x,h);ctx.lineTo(x+h*2,0);ctx.stroke(); }
    const home = {...buildingArt.home,building:true};
    const homeFile = light > .5 ? home.nightFile : home.file;
    paint(ctx,images.get(`../art/${homeFile}`),home,w*.22,y,z);
    const original = images.get(selected.file);
    const pair = catalog.find(s => s.building && s.name === selected.name.replace(' · night','') + ' · night');
    paint(ctx,original,draft,w*.66,y,z);
    if (pair && !selected.name.includes('night')) { ctx.save();ctx.globalAlpha=light;paint(ctx,images.get(pair.file),draft,w*.66,y,z);ctx.restore(); }
    const iara = catalog.find(s=>s.id==='portrait-0'); paint(ctx,images.get(iara.file),iara,w*.44,y,z);
    ctx.fillStyle = light>.5?'#fff4d7':'#294535';ctx.font='12px Trebuchet MS';ctx.fillText('Home',w*.22-18,h-18);ctx.fillText('Iara',w*.44-12,h-18);ctx.fillText('Calibration draft',w*.66-42,h-18);
  }
  function anchor() {
    const {ctx,w,h} = setup($('anchor-canvas')), img=images.get(selected.file), size=280, x=(w-size)/2, y=20;
    if (img?.naturalWidth) { const [cx,cy,cw,ch]=selected.animation?[0,0,.25,.25]:selected.cell; ctx.drawImage(img,cx*img.naturalWidth,cy*img.naturalHeight,cw*img.naturalWidth,ch*img.naturalHeight,x,y,size,size); }
    const ground=y+size*draft.anchor; ctx.strokeStyle='#b65236';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,ground);ctx.lineTo(x+size,ground);ctx.stroke();ctx.beginPath();ctx.arc(w/2,ground,7,0,Math.PI*2);ctx.fillStyle='#b65236';ctx.fill();
  }
  function replacement() {
    const {ctx,w,h} = setup($('replacement-scene')), original=images.get(selected.file), mode=$('replacement-mode').value, y=h*.76;
    const z=Number($('replacement-zoom').value), light=Number($('replacement-light').value);
    const pair=catalog.find(s=>s.building&&s.name===selected.name+' · night');
    ctx.fillStyle=`rgba(20,35,60,${light*.7})`;ctx.fillRect(0,0,w,h);
    function layer(img,x) { paint(ctx,img,selected,x,y,z);if(pair){ctx.save();ctx.globalAlpha*=light;paint(ctx,images.get(pair.file),selected,x,y,z);ctx.restore();} }
    layer(original,mode==='side'?w*.28:w/2);
    if(candidate) { ctx.save();if(mode==='overlay')ctx.globalAlpha=.5;if(mode==='difference')ctx.globalCompositeOperation='difference';layer(candidate,mode==='side'?w*.72:w/2);ctx.restore(); }
    ctx.fillStyle='#294535';ctx.font='12px Trebuchet MS';ctx.fillText(mode==='side'?'Original':'Original + candidate',w*.2,h-18);if(mode==='side')ctx.fillText(candidate?'Candidate':'Choose a candidate',w*.64,h-18);
  }
  function redraw() { if (!selected) return; scene(); anchor(); replacement(); }
  function currentRecipe() { const stored = recipes[selected.id]; return stored && Array.isArray(stored.revisions) && typeof stored.prompt === 'string' ? stored : defaultRecipe(selected); }
  function renderRecipe() {
    if (!selected) return;
    const recipe=currentRecipe(); $('recipe-rules').textContent=Object.values(defaultRecipe(selected).rules).join(' ');$('recipe-prompt').value=promptDrafts.get(selected.id) ?? recipe.prompt;
    $('recipe-references').replaceChildren();
    for(const file of defaultRecipe(selected).references) { const a=document.createElement('a');a.href=file;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=file;img.alt=file.split('/').at(-1);a.append(img);$('recipe-references').append(a); }
    $('recipe-history').replaceChildren();
    for(const revision of [...recipe.revisions].reverse()) { const li=document.createElement('li');li.textContent=`${revision.at} · ${revision.note} · ${revision.sha256?.slice(0,12)||'no image hash'}`;$('recipe-history').append(li); }
    $('recipe-original').textContent=Object.entries(originalRecords).map(([name,text])=>`${name}\n${text}`).join('\n\n');
  }
  $('workbench-sprite').onchange=()=>select(catalog.find(s=>s.id===$('workbench-sprite').value));
  for(const id of ['cal-width','cal-anchor','cal-right','cal-left']) $(id).oninput=()=>{
    if (!$(id).checkValidity() || $(id).value==='') return;
    draft.width=Number($('cal-width').value);draft.anchor=Number($('cal-anchor').value);
    if(draft.building)draft.axes=[Number($('cal-right').value),Number($('cal-left').value)];
    $('cal-config').textContent=JSON.stringify(config(),null,2);redraw();
  };
  for(const id of ['calibration-zoom','calibration-light','replacement-mode','replacement-light','replacement-zoom','replacement-row','replacement-frame']) $(id).oninput=redraw;
  const anchorCanvas=$('anchor-canvas');
  function moveAnchor(e) { const rect=anchorCanvas.getBoundingClientRect();draft.anchor=Math.round(Math.max(0,Math.min(1,(e.clientY-rect.top-20)/280))*1000)/1000;controls();redraw(); }
  anchorCanvas.onpointerdown=e=>{anchorCanvas.setPointerCapture(e.pointerId);moveAnchor(e);};
  anchorCanvas.onpointermove=e=>{if(anchorCanvas.hasPointerCapture(e.pointerId))moveAnchor(e);};
  anchorCanvas.onpointerup=e=>anchorCanvas.releasePointerCapture(e.pointerId);
  anchorCanvas.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();draft.anchor=Math.max(0,Math.min(1,draft.anchor+(e.key==='ArrowUp'?-.005:.005)));controls();redraw();}};
  $('cal-reset').onclick=()=>{draft=structuredClone(selected);controls();redraw();};
  $('cal-export').onclick=()=>download(config(),`${selected.id}-calibration.json`);
  function preview(withCandidate) {
    try {
      if(withCandidate&&!candidateData)throw new Error('Choose a candidate PNG first.');
      const entry={version:1,asset:selected.id,config:withCandidate?null:config(),candidate:withCandidate?candidateData:null};
      localStorage.setItem('solar-friends-art-draft-v1',JSON.stringify(entry));
      const a=document.createElement('a');a.href=`../?${selected.animation ? 'resident-preview' : selected.name.includes('night') ? 'night-preview' : 'artwork-preview'}&art-draft=${encodeURIComponent(selected.id)}`;a.target='_blank';a.rel='noopener';a.click();
      $('workbench-status').textContent='Draft stored for the isolated preview. Export any configuration you want to keep.';
    } catch(e){$('workbench-status').textContent=`Could not open preview: ${e.message}`;}
  }
  $('cal-preview').onclick=()=>preview(false);$('replacement-preview').onclick=()=>preview(true);
  $('replacement-file').onchange=async e=>{
    const file=e.target.files[0], token=++loadToken;if(!file)return;
    candidate=candidateData=report=null;redraw();
    try {
      if(file.type!=='image/png'||file.size>8_000_000)throw new Error('Choose a PNG smaller than 8 MB.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read PNG'));reader.readAsDataURL(file);});
      const img=new Image();img.src=data;await img.decode();if(token!==loadToken)return;
      if(img.naturalWidth>8192||img.naturalHeight>8192)throw new Error('PNG dimensions must be at most 8192 pixels.');
      const original=images.get(selected.file);await original.decode();if(token!==loadToken)return;
      candidate=img;candidateData=data;report=reviewPixels(original,candidate,selected);
      const overlap=Math.min(...report.frames.map(f=>f.silhouetteOverlap));
      $('replacement-report').textContent=[report.sameDimensions?'✓ Canvas dimensions match':'⚠ Canvas dimensions changed',`Lowest silhouette overlap: ${(overlap*100).toFixed(1)}%`,...report.frames.filter(f=>f.candidate.empty||f.candidate.edgePixels||Math.min(...(f.candidate.padding||[0]))<.03).map(f=>`⚠ Cell ${f.frame+1}: ${f.candidate.empty?'empty':f.candidate.edgePixels?'paint reaches crop edge':'less than 3% gutter'}`),`Baseline spread: ${report.baselineSpread}px / 256px sample`,report.note].join('\n');redraw();
    } catch(error){if(token===loadToken)$('replacement-report').textContent=error.message;}
  };
  $('replacement-clear').onclick=()=>{loadToken++;candidate=candidateData=report=null;$('replacement-file').value='';$('replacement-report').textContent='Candidate discarded.';redraw();};
  $('replacement-export').onclick=()=>{if(report)download(report,`${selected.id}-pixel-review.json`);else $('workbench-status').textContent='Choose a candidate first.';};
  $('recipe-save').onclick=async()=>{
    const sprite=selected, revisionConfig=config(), source=candidateData||selected.file, recipe=structuredClone(currentRecipe()), prompt=$('recipe-prompt').value, note=$('recipe-note').value.trim();
    if(!note){$('workbench-status').textContent='Describe this revision before saving.';return;}
    try {
      const response=await fetch(source);if(!response.ok)throw new Error('Source image unavailable');
      const hash=await crypto.subtle.digest('SHA-256',await response.arrayBuffer());
      recipe.prompt=prompt;recipe.revisions.push({at:new Date().toISOString(),note,sha256:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join(''),prompt,config:revisionConfig});
      promptDrafts.set(sprite.id,prompt);
      const updated={...recipes,[sprite.id]:recipe};localStorage.setItem(storageKey,JSON.stringify(updated));recipes=updated;
      if(selected.id===sprite.id){$('recipe-note').value='';renderRecipe();}$('workbench-status').textContent='Recipe revision saved locally. Export it to keep with the project.';
    }catch(e){$('workbench-status').textContent=`Recipe was not saved: ${e.message}`;}
  };
  $('recipe-export').onclick=()=>download({...currentRecipe(),prompt:$('recipe-prompt').value,calibration:config(),rules:defaultRecipe(selected).rules,originalRecords},`${selected.id}-recipe.json`);
  $('recipe-prompt').oninput=()=>promptDrafts.set(selected.id,$('recipe-prompt').value);
  $('recipe-reset').onclick=()=>{$('recipe-prompt').value=defaultRecipe(selected).prompt;};
  select(getSelected());
  showTab(['replacement','recipe'].includes(new URLSearchParams(location.search).get('tool'))?new URLSearchParams(location.search).get('tool'):'calibration');
  new ResizeObserver(redraw).observe(section);
  for(const image of images.values())image.addEventListener('load',redraw);
  return { select, redraw };
}
