import {allBuildingArt,drawBuildingArt,cameraCalibration} from '../building-art.js';
import {buildingProjection} from '../building-projection.js';
import {placementArt,footprintSize,footprint} from '../building-footprints.js';
import {paintTerrain,GROUND_START,GROUND_SIZE} from '../terrain.js';
import {drawPreparedFrame,RESIDENT_WIDTH} from '../sprite-frames.js';
const $=id=>document.getElementById(id),images=new Map(),cards=[];
let focus,proposal,proposals;
const grounds=new Map();
function contextGround(ctx,key,cx,cy,scale,night){
 const n=footprintSize(key);
 if(!grounds.has(n)){
  const f=footprint(key,0,0),roads=Array.from({length:n},(_,i)=>[10+Math.ceil(f.minX)+i,10+f.maxY+.5]);
  grounds.set(n,paintTerrain(images.get('terrain-atlas.png'),roads));
 }
 ctx.save();ctx.transform(34*scale,17*scale,-34*scale,17*scale,cx,cy);
 ctx.drawImage(grounds.get(n),GROUND_START-10,GROUND_START-10,GROUND_SIZE,GROUND_SIZE);ctx.restore();
 if(night){ctx.fillStyle='#11243b88';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);}
}
function contextNeighbors(ctx,cx,cy,scale,night){
 const art=allBuildingArt['home-gable'],registration=placementArt('home-gable',art),x=cx-200*scale;
 drawBuildingArt(ctx,images.get(night?art.nightFile:art.file),art,x+registration.x*scale,cy+registration.y*scale,scale*registration.scale);
 drawPreparedFrame(ctx,images.get('animations/iara.png'),8,x+75*scale,cy+50*scale,RESIDENT_WIDTH*scale,{referenceRow:2},night?'brightness(.6) saturate(.72)':'none');
 ctx.fillStyle=night?'#fff6dc':'#263b31';ctx.font=`${12*scale}px sans-serif`;ctx.fillText('Reference home + Iara',x-60*scale,cy+85*scale);
}
function draw({key,art:originalArt,canvas,caption},large=false){
 const proposed=$('proposal').checked&&key===proposal.key,art=proposed?proposal.art:originalArt;
 const night=$('light').value==='night',corrected=$('camera').value==='corrected',guides=$('guides').checked;
 const config=corrected?art:{...art,axes:undefined},m=proposed?proposal.measurement:buildingProjection[key],ctx=canvas.getContext('2d');
 const context=$('context').checked;
 const scale=context?(large?2.5:1.8):(large?3.9:1.65),width=context?(large?1200:800):(large?1000:400),height=context?(large?850:600):(large?920:430),cx=context?width*.67:width/2,cy=height*(context ? .72 : .76);
 canvas.width=width*2;canvas.height=height*2;ctx.scale(2,2);
 ctx.fillStyle=night?'#233947':'#e3e8d3';ctx.fillRect(0,0,width,height);
 if(context)contextGround(ctx,key,cx,cy,scale,night);
 ctx.strokeStyle=night?'#38505a':'#c4cdb7';ctx.lineWidth=.6;
 if(!context||guides)for(let offset=-width;offset<=width;offset+=34*scale)for(const slope of [-.5,.5]){ctx.beginPath();ctx.moveTo(0,cy+offset-cx*slope);ctx.lineTo(width,cy+offset+cx*slope);ctx.stroke();}
 if(context)contextNeighbors(ctx,cx,cy,scale,night);
 const registration=proposed?proposal.placement:placementArt(key,config),origin=[cx+registration.x*scale,cy+registration.y*scale];
 // Match the game: full painted silhouette fits the same plot boundary.
 ctx.strokeStyle='#af7141';ctx.lineWidth=1.3;const n=footprintSize(key),center=((n-1)/2-Math.floor(n/2))*34*scale;
 ctx.beginPath();[[0,-n*17],[n*34,0],[0,n*17],[-n*34,0]].forEach(([x,y],i)=>i?ctx.lineTo(cx+x*scale,cy+center+y*scale):ctx.moveTo(cx+x*scale,cy+center+y*scale));ctx.closePath();ctx.stroke();
 drawBuildingArt(ctx,images.get(night?art.nightFile:art.file),{...config,renderFilter:night?art.nightTint:undefined},...origin,scale*registration.scale);
 let error=0;
 if(m){
  const {vertical,shear}=cameraCalibration(config),w=art.width*scale*registration.scale;
  const point=p=>{const [u,v]=p;return[origin[0]+(u/m.size-.5)*w,origin[1]+((v/m.size-art.anchor*(art.aspect||1))*vertical+(u/m.size-.5)*shear)*w];};
  for(const [direction,target]of [['right',.5],['left',-.5]])for(const [index,e]of m[direction].entries()){
   const p=point(e.slice(0,2)),q=point(e.slice(2)),ideal=[q[0],p[1]+target*(q[0]-p[0])];
   error=Math.max(error,Math.abs(q[1]-ideal[1])/scale);
   if(guides){ctx.lineWidth=1.6;ctx.strokeStyle='#50e1ce';ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...ideal);ctx.stroke();ctx.lineWidth=1.1;ctx.strokeStyle='#f4a44c';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.setLineDash([]);if(large){ctx.font='11px sans-serif';ctx.fillStyle=night?'#fff6dc':'#263b31';ctx.fillText((m[direction+'Labels']?.[index]||direction+' edge '+(index+1)),p[0]+4,p[1]-5);}}
  }
  if(guides){
   ctx.strokeStyle='#93b5ff';ctx.lineWidth=1.2;
   for(const e of m.uprights||[m.upright]){const p=point(e.slice(0,2)),q=point(e.slice(2));ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();}
   for(const circle of m.circles||[]){
    const points=Array.from({length:8},(_,j)=>point([circle.center[0]+Math.cos(j*Math.PI/4)*circle.radius,circle.center[1]+Math.sin(j*Math.PI/4)*circle.ry]));
    ctx.strokeStyle='#cf9aff';ctx.beginPath();points.forEach((p,j)=>j?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
   }
   for(const [peak,left,right]of m.gables||[]){const p=point(peak),l=point(left),r=point(right),x=(l[0]+r[0])/2;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,p[1]-10);ctx.lineTo(x,(l[1]+r[1])/2);ctx.stroke();ctx.setLineDash([]);}
  }
 }
 caption.replaceChildren(document.createTextNode(art.name+(proposed?' · UNAPPROVED CANDIDATE':'')));const detail=document.createElement('span');
 detail.textContent=proposed?proposal.issue:m?`${m.right.length+m.left.length} traced axes · ${error.toFixed(3)} px drift at game scale`:'Organic planting · no rectangular structure';caption.append(detail);
 return error;
}
function render(){
 proposal=proposals.find(p=>p.id===$('candidate').value);
 $('camera').disabled=$('proposal').checked;
 if($('proposal').checked)$('camera').value='corrected';
 let maximum=0;
 for(const card of cards)maximum=Math.max(maximum,draw(card));
 if(focus)draw({...focus,canvas:$('focus-canvas'),caption:$('focus-caption')},true);
 $('status').textContent=`${cards.length} variants · 25 architectural structures + 2 organic plantings. ${$('camera').value==='corrected'?'Registered game projection':'Uncorrected source'}. Maximum traced-axis drift: ${maximum.toFixed(3)} px. Local texture warps removed. ${$('context').checked?'Reference home, resident and adjoining road use gameplay sizes and placement. ':''}Visual review remains required for every sprite.`;
 if($('proposal').checked)$('status').textContent+=' Candidate comparison only: the game keeps the established source. '+proposal.issue;
 $('status').dataset.drift=String(maximum);
}
for(const [key,art]of Object.entries(allBuildingArt)){
 const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption'),button=document.createElement('button');
 button.type='button';button.className='projection-focus';button.setAttribute('aria-label','Inspect '+art.name);canvas.setAttribute('aria-label',art.name+' projection review');button.append(canvas);figure.append(button,caption);$('buildings').append(figure);
 const card={key,art,canvas,caption};cards.push(card);
 button.onclick=()=>{focus=card;draw({...card,canvas:$('focus-canvas'),caption:$('focus-caption')},true);$('focus').showModal();};
}
$('focus-close').onclick=()=>{$('focus').close();focus=null;};
$('export').onclick=()=>{
 const blob=new Blob([JSON.stringify({lighting:$('light').value,camera:$('camera').value,context:$('context').checked,structures:buildingProjection,variants:Object.keys(allBuildingArt)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='building-geometry-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
try{
 proposals=await fetch('./finishing-candidates.json').then(response=>response.json());
 $('candidate').replaceChildren(...proposals.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.label;return option;}));
 for(const p of proposals){const image=new Image();image.src='../art/'+p.art.file;await image.decode();images.set(p.art.file,image);}
 await Promise.all([...new Set([...Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]),'terrain-atlas.png','animations/iara.png'])].map(async file=>{const image=new Image();image.src='../art/'+file;await image.decode();images.set(file,image);}));
 for(const id of ['light','camera','guides','proposal','context','candidate'])$(id).addEventListener('change',render);render();
}catch(error){$('status').textContent='Projection review failed: '+error.message;console.error(error);}
