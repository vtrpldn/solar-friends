import { catalog } from './catalog.js?v=night-1';
import { reviewPixels } from './pixel-checks.js';
import { preparedFrames, animationFrameOptions, FRAME_ANCHOR } from '../sprite-frames.js';
import { buildingArt, allBuildingArt, drawBuildingArt } from '../building-art.js?v=night-1';
import { drawCrops, loadCropArt, cropTypes } from '../crop-art.js';
import {paintWorldBuilding} from '../world-renderer.js';
import {footprintCorners} from '../building-footprints.js';
import {project} from '../projection.js';
import {unlitFilter} from '../power.js';
import { download } from '../dev/tools.js';
const $=id=>document.getElementById(id),images=new Map(),results=[],buildingViews=[];
try {
  await Promise.all([...new Set(catalog.map(s=>s.file))].map(async file=>{const img=new Image();img.src=file;await img.decode();images.set(file,img);}));
  await loadCropArt();
  const dayImages=Object.fromEntries(Object.entries(allBuildingArt).map(([key,art])=>[key,images.get(`../art/${art.file}`)]));
  const nightImages=Object.fromEntries(Object.entries(allBuildingArt).map(([key,art])=>[key,images.get(`../art/${art.nightFile}`)]));
  for(const [state,night,light]of [['day',0,1],['powered-night',1,1],['unpowered-night',1,0]])for(const [key,art]of Object.entries(allBuildingArt)){
    const figure=document.createElement('figure'),canvas=document.createElement('canvas');
    figure.dataset.building=key;figure.dataset.lighting=state;
    canvas.width=640;canvas.height=480;canvas.setAttribute('aria-label',`${art.name} · ${state} · shared placement at scale 1`);
    const ctx=canvas.getContext('2d');ctx.scale(2,2);
    ctx.fillStyle=night?'#263c4b':'#dde5ca';ctx.fillRect(0,0,320,240);
    const position=(x,y)=>project(x,y,{x:150,y:164},1);
    ctx.strokeStyle=night?'#c8d5b9':'#61734e';ctx.setLineDash([3,3]);ctx.beginPath();
    footprintCorners(key,0,0).forEach(([x,y],i)=>{const p=position(x,y);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    paintWorldBuilding(ctx,{key,x:0,y:0},{project:position,scale:1,images:dayImages,nightImages,night,light});
    const resident=catalog.find(s=>s.id==='portrait-0');ctx.save();ctx.filter=unlitFilter(night);
    ctx.drawImage(preparedFrames(images.get(resident.file),{referenceRow:2})[8],254,208-48*FRAME_ANCHOR,48,48);ctx.restore();
    figure.append(canvas);const caption=document.createElement('figcaption');caption.textContent=`${art.name} · ${state.replaceAll('-',' ')} · footprint guide`;
    figure.append(caption);$('houses').append(figure);buildingViews.push({key,state,scale:1,renderer:'paintWorldBuilding'});
  }
  for(const sprite of catalog){
    const report=reviewPixels(images.get(sprite.file),images.get(sprite.file),sprite);
    const bad=report.frames.filter(f=>f.original.empty || (sprite.group!=='Terrain' && sprite.usage!=='Reference' && f.original.edgePixels>0) || ((sprite.animation||sprite.crop)&&Math.min(...f.original.padding)<.03));
    const passed=!bad.length && (!(sprite.animation||sprite.crop)||report.baselineSpread<=2);
    results.push({id:sprite.id,name:sprite.name,frames:report.frames.length,passed,edgeOrGutterFailures:bad.map(f=>f.frame),baselineSpread:report.baselineSpread});
    const result=document.createElement('div');result.className='result';result.textContent=`${passed?'✓':'⚠'} ${sprite.name} · ${report.frames.length} cells${passed?'':` · check ${bad.map(f=>f.frame+1).join(', ')}`}`;$('results').append(result);
    if(!sprite.animation)continue;
    const section=document.createElement('section');section.className='sheet';
    const title=document.createElement('h3');title.textContent=`${sprite.name} / ${sprite.activityAnimation?'daily work':sprite.idleAnimation?'standing idles':'base poses'}`;section.append(title);
    const grid=document.createElement('div');grid.className='poses';section.append(grid);
    const frames=preparedFrames(images.get(sprite.file),animationFrameOptions(sprite));
    const labels=sprite.activityAnimation?['Cook','Water','Tend','Feed']:sprite.idleAnimation?['Look','Stretch','Wave','Relax']:['Walk','Build','Breathe','Sit / sleep'];
    frames.forEach((frame,i)=>{
      if(i%4===0){const label=document.createElement('div');label.className='row-label';label.textContent=labels[i/4];grid.append(label);}
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.setAttribute('aria-label',`${sprite.id} frame ${i+1}`);
      const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.strokeStyle='#ba684b';ctx.beginPath();ctx.moveTo(0,118);ctx.lineTo(128,118);ctx.stroke();
      const width=sprite.width*2;ctx.drawImage(frame,64-width/2,118-width*FRAME_ANCHOR,width,width);grid.append(canvas);
    });$('sheets').append(section);
  }
  for(const night of [false,true])for(const kind of ['garden','greenhouse'])for(const crop of Object.keys(cropTypes))for(const phase of ['Empty','Young','Growing','Mature','Dry']){
    const figure=document.createElement('figure'),canvas=document.createElement('canvas');canvas.width=480;canvas.height=500;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);
    const c={kind:crop,growth:cropTypes[crop].minutes*(phase==='Young'?.15:phase==='Growing'?.6:1),moisture:phase==='Dry'?0:100,planted:phase!=='Empty',harvests:0};
    if(night){ctx.fillStyle='#263c4b';ctx.fillRect(0,0,240,250);}
    const file=buildingArt[kind].file.replace('.png',night?'-night.png':'.png');
    drawBuildingArt(ctx,images.get(`../art/${file}`),buildingArt[kind],120,180,1.5);
    drawCrops(ctx,{kind,crop:c},120,180,1.5,Number(night));figure.append(canvas);
    const caption=document.createElement('figcaption');caption.textContent=`${kind} · ${crop} · ${phase} · ${night?'night':'day'}`;figure.append(caption);$('crops').append(figure);
  }
  const failures=results.filter(r=>!r.passed);$('status').textContent=`${buildingViews.length} building/state previews · ${results.length} entries · ${results.reduce((n,r)=>n+r.frames,0)} cells · ${failures.length} failures. Pixel checks verify separation, gutters and ground registration; inspect style and motion visually.`;
  $('export').disabled=false;$('export').onclick=()=>download({capturedAt:new Date().toISOString(),results,buildingViews},'solar-friends-current-art-checks.json');
}catch(error){$('status').textContent=`Artwork check failed: ${error.message}`;console.error(error);}
