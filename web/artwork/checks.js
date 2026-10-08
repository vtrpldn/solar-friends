import { catalog } from './catalog.js?v=night-1';
import { reviewPixels } from './pixel-checks.js';
import { preparedFrames, animationFrameOptions, FRAME_ANCHOR } from '../sprite-frames.js';
import { buildingArt, allBuildingArt, homeArtKeys, drawBuildingArt } from '../building-art.js?v=night-1';
import { drawCrops, loadCropArt, cropTypes } from '../crop-art.js';
import { download } from '../dev/tools.js';
const $=id=>document.getElementById(id),images=new Map(),results=[];
try {
  await Promise.all([...new Set(catalog.map(s=>s.file))].map(async file=>{const img=new Image();img.src=file;await img.decode();images.set(file,img);}));
  await loadCropArt();
  for(const night of [false,true])for(const key of homeArtKeys){
    const art=allBuildingArt[key],figure=document.createElement('figure'),canvas=document.createElement('canvas');
    canvas.width=440;canvas.height=340;canvas.setAttribute('aria-label',`${art.name} · ${night?'night':'day'} at shared game scale`);
    const ctx=canvas.getContext('2d');ctx.scale(2,2);
    ctx.fillStyle=night?'#263c4b':'#dde5ca';ctx.fillRect(0,0,220,170);
    drawBuildingArt(ctx,images.get(`../art/${night?art.nightFile:art.file}`),art,110,125,1);
    const resident=catalog.find(s=>s.id==='portrait-0');
    ctx.drawImage(preparedFrames(images.get(resident.file),{referenceRow:2})[8],176,125-48*FRAME_ANCHOR,48,48);
    figure.append(canvas);const caption=document.createElement('figcaption');caption.textContent=`${art.name} · ${night?'night':'day'}`;figure.append(caption);$('houses').append(figure);
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
  for(const night of [false,true])for(const kind of ['garden','greenhouse'])for(const crop of ['lettuce','beans','tomatoes'])for(const phase of ['Empty','Young','Growing','Mature','Dry']){
    const figure=document.createElement('figure'),canvas=document.createElement('canvas');canvas.width=440;canvas.height=300;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);
    const c={kind:crop,growth:cropTypes[crop].minutes*(phase==='Young'?.15:phase==='Growing'?.6:1),moisture:phase==='Dry'?0:100,planted:phase!=='Empty',harvests:0};
    if(night){ctx.fillStyle='#263c4b';ctx.fillRect(0,0,220,150);}
    const file=buildingArt[kind].file.replace('.png',night?'-night.png':'.png');
    drawBuildingArt(ctx,images.get(`../art/${file}`),buildingArt[kind],110,95,1.5);
    drawCrops(ctx,{kind,crop:c},110,95,1.5,Number(night));figure.append(canvas);
    const caption=document.createElement('figcaption');caption.textContent=`${kind} · ${crop} · ${phase} · ${night?'night':'day'}`;figure.append(caption);$('crops').append(figure);
  }
  const failures=results.filter(r=>!r.passed);$('status').textContent=`${results.length} entries · ${results.reduce((n,r)=>n+r.frames,0)} cells · ${failures.length} failures. Pixel checks verify separation, gutters and ground registration; inspect style and motion visually.`;
  $('export').disabled=false;$('export').onclick=()=>download({capturedAt:new Date().toISOString(),results},'solar-friends-current-art-checks.json');
}catch(error){$('status').textContent=`Artwork check failed: ${error.message}`;console.error(error);}
