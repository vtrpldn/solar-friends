import {installAttachmentEditor} from './character-attachment-editor.js';
import {installSingleHairReview} from './character-single-hair.js';
import {installBreatheHairReview} from './character-breathe-hair.js';
import {installHairClipReview} from './character-hair-clip.js';
import {createBodyMaterialModel,bodyMaterialPalettes,defaultBodyMaterials} from '../character-materials.js';
import init,{Game} from '../pkg/solar_friends.js';
import {loadEditorArt} from '../editor/map-view.js';
import {locateSpriteFrames,preparedFrames,FRAME_ANCHOR,RESIDENT_WIDTH} from '../sprite-frames.js';
import {residentClips,sampleResidentClip,drawResidentAnimation} from '../resident-animation.js';
import {project} from '../projection.js';
import {paintTerrain,soilAppearance} from '../terrain.js';
import {paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow} from '../world-renderer.js';
import {unlitFilter} from '../power.js';
const $=id=>document.getElementById(id),files={base:'body-neutral-base.png',idle:'body-neutral-idle-candidate-v2.png',activities:'body-neutral-activities-candidate-v1.png'};
const load=async src=>{const image=new Image();image.src=src;await image.decode();return image;};
const pixels=image=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height);};
function bounds(frame){const p=pixels(frame);let left=p.width,top=p.height,right=0,bottom=0;for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++)if(p.data[(y*p.width+x)*4+3]>=32){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}return {left,top,right,bottom,height:bottom-top};}
try{
 await init();const art=await loadEditorArt(),body={},reference={},frameBank={},report={schema:1,status:'prototype-only; no gameplay integration',sheets:{}};
 for(const [sheet,file]of Object.entries(files)){
  body[sheet]=await load('../art/characters/prototype-v1/'+file);reference[sheet]=sheet==='base'?art.residents[1]:await load('../art/animations/bento-'+sheet+'.png');
  const data=pixels(body[sheet]),referenceRow=sheet==='base'?2:0,layout=locateSpriteFrames(data.data,data.width,data.height,4,4,referenceRow),frames=preparedFrames(body[sheet],{referenceRow});
  frameBank[sheet]=frames;
  const normalized=frames.map(bounds),standing=normalized.slice(referenceRow*4,referenceRow*4+4).map(b=>b.height).sort((a,b)=>a-b);
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await (await fetch(body[sheet].src)).arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const referenceSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await (await fetch(reference[sheet].src)).arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
  report.sheets[sheet]={file,sha256,referenceFile:'web/art/animations/bento'+(sheet==='base'?'':'-'+sheet)+'.png',referenceSha256,width:data.width,height:data.height,frames:layout.frames.length,uniformScale:layout.scale,standingHeight:standing[2],normalized,sourceBounds:layout.frames.map(({left,top,right,bottom,pivot})=>({left,top,right,bottom,pivot})),sourceClipped:layout.frames.some(f=>f.left<2||f.top<2||f.right>data.width-2||f.bottom>data.height-2)};
 }
 const registration=await (await fetch('../art/characters/prototype-v1/body-materials-v1.json')).json(),sourceHashes=Object.fromEntries(Object.entries(report.sheets).map(([key,s])=>[key,s.sha256])),materialModel=createBodyMaterialModel(frameBank,registration,{sourceHashes});
 for(const [name,palettes]of Object.entries(bodyMaterialPalettes)){$('body-material-'+name).replaceChildren(...Object.keys(palettes).filter(key=>key!=='reference').map(key=>new Option(key,key)));$('body-material-'+name).value=defaultBodyMaterials[name];}
 const materialRecipe=()=>Object.fromEntries(Object.keys(defaultBodyMaterials).map(key=>[key,$('body-material-'+key).value]));
 const materialProvider=()=>materialModel.provider($('body-material-mode').value==='palette'?materialRecipe():defaultBodyMaterials,{diagnostic:$('body-material-mode').value==='regions'});
 const materialReport={schema:1,status:'prototype-only; semantic masks and colour variants require visual review',sheets:Object.fromEntries(Object.keys(frameBank).map(sheet=>[sheet,Array.from({length:16},(_,index)=>({index,counts:materialModel.mask(sheet,index).counts}))]))};
 $('body-material-report').textContent=JSON.stringify(materialReport,null,2);window.bodyMaterialsReview={model:materialModel,frames:frameBank,images:body,registration,sourceHashes};
 await installAttachmentEditor({frames:frameBank,sourceHashes,button:$('body-attachment-open')});
 const heights=Object.values(report.sheets).map(s=>s.standingHeight);report.crossSheetStatureRatio=Math.max(...heights)/Math.min(...heights);
 const game=new Game();let d,snapshot;
 try{d=JSON.parse(game.scenario_template('sandbox'));d.start.buildings.push({id:'body-review-home',kind:'home',x:28,y:34,state:'completed',recipe:'standard',appearance:null});d.start.roads.push([30,34],[31,34],[32,34]);const checked=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!checked.ok)throw Error(checked.issues.find(i=>i.severity==='error')?.message);snapshot=JSON.parse(game.report_state());}finally{game.free();}
 const land=snapshot.village.land,ground=paintTerrain(art.terrain,d.start.roads,[],soilAppearance(land.soil),land.seed,d.map),surface=document.createElement('canvas');surface.width=surface.height=256;
 function scene(canvas,night,{hairFrame=null,hairProvider=null,hairMode='breathe',hairSeconds=null,facingOverride=null}={}){
  const ctx=canvas.getContext('2d'),scale=1.3,anchor=project(30,33,{x:0,y:0},scale),origin={x:440-anchor.x,y:315-anchor.y},position=(x,y)=>project(x,y,origin,scale),mode=hairFrame?'single-hair-static':hairProvider?hairMode:$('body-review-clip').value,seconds=hairSeconds??Number($('body-review-time').value),facing=facingOverride??Number($('body-review-facing').value);
  ctx.clearRect(0,0,900,420);ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(0,0,900,420);ctx.save();ctx.filter=unlitFilter(night);paintWorldGround(ctx,ground,origin,scale);ctx.restore();
  const objects=land.vegetation.filter(t=>!t.cleared).map(tree=>({depth:tree.x+tree.y,draw:()=>paintWorldTree(ctx,tree,{project:position,scale,width:900,height:420,forest:art.forest,details:art.details,night})}));
  for(const b of d.start.buildings)objects.push({depth:b.x+b.y,draw:()=>paintWorldBuilding(ctx,{key:b.kind,x:b.x,y:b.y},{project:position,scale,images:art.images,night,light:0})});
  const candidate=hairProvider??(hairFrame?{frameForPose:(sheet,index)=>{if(sheet!=='base'||index!==8)throw Error('Only base pose 8 has hair artwork.');return hairFrame;}}:materialProvider());
  for(const [sheets,x]of [[reference,30.5],[candidate,32]])objects.push({depth:x+33+.6,draw:()=>{const p=position(x,33);paintContactShadow(ctx,p.x,p.y,10*scale,4*scale,.22);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,surface,sheets,{layers:hairFrame?[{sheet:'base',row:2,frame:0,weight:1}]:sampleResidentClip(mode,seconds),facing,breath:1},p.x,p.y,RESIDENT_WIDTH*scale);ctx.restore();}});
  objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());canvas.dataset.mode=mode;canvas.dataset.facing=String(facing);canvas.dataset.night=String(night);canvas.dataset.seconds=String(seconds);
 }
 function draw(){
  for(const key of Object.keys(defaultBodyMaterials))$('body-material-'+key).disabled=$('body-material-mode').value!=='palette';
  const sheet=$('body-review-sheet').value,referenceRow=sheet==='base'?2:0,host=document.querySelector('.body-review-poses');host.replaceChildren();
  for(let i=0;i<16;i++){const article=document.createElement('article'),label=document.createElement('b');label.textContent=`Row ${Math.floor(i/4)+1} · pose ${i%4+1}`;article.append(label,document.createElement('br'));for(const [sourceIndex,source]of [reference[sheet],body[sheet]].entries()){const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.getContext('2d').drawImage(sourceIndex?materialProvider().frameForPose(sheet,i):preparedFrames(source,{referenceRow})[i],0,0);article.append(canvas);}host.append(article);}
  scene($('body-review-day'),0);scene($('body-review-night'),1);
 }
 function choose(){const sheet=$('body-review-sheet').value,select=$('body-review-clip');select.replaceChildren(...Object.entries(residentClips).filter(([,clip])=>clip.sheet===sheet).map(([name])=>new Option(name,name)));draw();}
 $('body-review-sheet').onchange=choose;for(const id of ['mode','skin','shirt','shorts','shoes'])$('body-material-'+id).oninput=draw;for(const id of ['body-review-clip','body-review-time','body-review-facing'])$(id).oninput=draw;
 $('body-review-report').textContent=JSON.stringify(report,null,2);$('body-review-status').textContent=`48 extracted poses · cross-sheet stature ratio ${report.crossSheetStatureRatio.toFixed(3)}. Body-only production review; compatible parts and equipment remain unfinished.`;choose();
 window.singleHairReview=await installSingleHairReview({body:frameBank.base[8],binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.breatheHairReview=await installBreatheHairReview({frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.walkHairReview=await installHairClipReview({clip:'walk',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.workHairReview=await installHairClipReview({clip:'work',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.sitHairReview=await installHairClipReview({clip:'sit',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.lookHairReview=await installHairClipReview({clip:'look',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.stretchHairReview=await installHairClipReview({clip:'stretch',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.waveHairReview=await installHairClipReview({clip:'wave',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 window.relaxHairReview=await installHairClipReview({clip:'relax',frames:frameBank,binding:window.bodyAttachmentReview.binding,scene,before:$('body-attachment-open')});
 document.body.dataset.bodyReviewReady='true';
}catch(error){$('body-review-status').textContent=error.message;throw error;}
