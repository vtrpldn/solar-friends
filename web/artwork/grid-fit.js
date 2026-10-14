import {allBuildingArt,drawBuildingArt,cameraCalibration} from '../building-art.js';
import {placementArt,footprint,footprintSize} from '../building-footprints.js';
import {buildingSilhouettes} from '../building-silhouettes.js';
import {project} from '../projection.js';
import {drawPreparedFrame,RESIDENT_WIDTH} from '../sprite-frames.js';
const $=id=>document.getElementById(id),images=new Map(),cards=[];
async function load(file){const image=new Image();image.src=file;await image.decode();return image;}
function render(){
  const night=$('lighting').value==='night',guides=$('guides').checked,origin={x:160,y:240};
  for(const {kind,art,canvas,detail} of cards){
    const ctx=canvas.getContext('2d'),n=footprintSize(kind),f=footprint(kind,0,0),p=placementArt(kind,art),{vertical,shear}=cameraCalibration(art);
    ctx.clearRect(0,0,320,300);ctx.save();ctx.filter=night?'brightness(.55) saturate(.85)':'none';
    const terrain=images.get('terrain');ctx.drawImage(terrain,0,0,terrain.naturalWidth/2,terrain.naturalHeight,0,0,320,300);ctx.restore();
    if(guides){
      ctx.strokeStyle=night?'#c1cbac80':'#fffaeab0';ctx.lineWidth=1;
      for(let i=f.minX-1;i<=f.maxX+1;i++)for(const line of [[[i,f.minY-1],[i,f.maxY+1]],[[f.minX-1,i],[f.maxX+1,i]]]){
        const[a,b]=line.map(([x,y])=>project(x,y,origin,1));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
    drawBuildingArt(ctx,images.get(night?art.nightFile:art.file),art,origin.x+p.x,origin.y+p.y,p.scale);
    ctx.save();ctx.filter=night?'brightness(.6)':'none';drawPreparedFrame(ctx,images.get('iara'),8,origin.x-n*34-22,origin.y+16,RESIDENT_WIDTH,{referenceRow:2});ctx.restore();
    if(guides){
      const corners=[[f.minX,f.minY],[f.maxX,f.minY],[f.maxX,f.maxY],[f.minX,f.maxY]].map(([x,y])=>project(x,y,origin,1));
      ctx.strokeStyle='#f9ed99';ctx.lineWidth=1.5;ctx.beginPath();corners.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.stroke();
      ctx.strokeStyle='#4bffff';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();buildingSilhouettes[kind].hull.forEach(([u,v],i)=>{
        const x=(u-.5)*art.width,y=((v-art.anchor*(art.aspect||1))*vertical+(u-.5)*shear)*art.width;
        const X=origin.x+p.x+x*p.scale,Y=origin.y+p.y+y*p.scale;i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);
      });ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    }
    detail.textContent=`${n} × ${n} tiles · full painted outline · shared day/night fit`;
  }
  $('status').textContent=`${cards.length} variants · all 44 day/night sources · source alpha ≥32, matching the artwork studio. Upright parts rise above the ground plot.`;
}
try{
  for(const [kind,art]of Object.entries(allBuildingArt)){
    const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption'),detail=document.createElement('small');canvas.width=320;canvas.height=300;caption.textContent=art.name;caption.append(detail);figure.append(canvas,caption);$('cards').append(figure);cards.push({kind,art,canvas,detail});
  }
  await Promise.all([...new Set(Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]))].map(async file=>images.set(file,await load('../art/'+file))));
  images.set('terrain',await load('../art/terrain-atlas.png'));images.set('iara',await load('../art/animations/iara.png'));
  for(const id of ['lighting','guides'])$(id).onchange=render;render();
}catch(error){$('status').textContent='Grid review failed: '+error.message;console.error(error);}
