import { allBuildingArt, drawBuildingArt, cameraCalibration } from '../building-art.js';
import { buildingProjection } from '../building-projection.js';
import { meshPoint } from '../building-mesh.js';
const $=id=>document.getElementById(id), images=new Map();
const cards=Object.entries(allBuildingArt).map(([key,art])=>{
  const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');
  canvas.width=800;canvas.height=760;
  canvas.setAttribute('aria-label',art.name+' projection review');
  figure.append(canvas,caption);$('buildings').append(figure);
  return {key,art,canvas,caption};
});
function render(){
  const night=$('light').value==='night',corrected=$('camera').value==='corrected',guides=$('guides').checked;
  for(const {key,art,canvas,caption} of cards){
    const ctx=canvas.getContext('2d'),m=buildingProjection[key],config=corrected?art:{...art,axes:undefined,mesh:undefined};
    const {vertical,shear}=cameraCalibration(config),w=art.width*1.85;
    ctx.resetTransform();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.scale(2,2);
    ctx.fillStyle=night?'#233947':'#e3e8d3';ctx.fillRect(0,0,400,380);
    ctx.strokeStyle=night?'#38505a':'#c4cdb7';ctx.lineWidth=.6;
    for(let offset=-360;offset<=360;offset+=36)for(const slope of [-.5,.5]){
      ctx.beginPath();ctx.moveTo(0,260+offset-200*slope);ctx.lineTo(400,260+offset+200*slope);ctx.stroke();
    }
    drawBuildingArt(ctx,images.get(night?art.nightFile:art.file),config,200,260,1.85);
    let error=0;
    if(m){
      const point=(x,y)=>{const [u,v]=meshPoint(config.mesh,[x,y]);return [200+(u/m.size-.5)*w,260+((v/m.size-art.anchor)*vertical+(u/m.size-.5)*shear)*w];};
      for(const [direction,target]of [['right',.5],['left',-.5]])for(const[x,y,X,Y]of m[direction]){
        const p=point(x,y),q=point(X,Y),ideal=[q[0],p[1]+target*(q[0]-p[0])];
        error=Math.max(error,Math.abs(q[1]-ideal[1])/1.85);
        if(guides){
          ctx.lineWidth=1.7;ctx.strokeStyle='#50e1ce';ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...ideal);ctx.stroke();
          ctx.lineWidth=1.2;ctx.strokeStyle='#f4a44c';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();ctx.setLineDash([]);
        }
      }
      if(guides){const[x,y,X,Y]=m.upright,p=point(x,y),q=point(X,Y);ctx.strokeStyle='#50e1ce';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();}
    }
    caption.replaceChildren(document.createTextNode(art.name));const detail=document.createElement('span');
    detail.textContent=m?`${error.toFixed(2)} px maximum traced-edge drift at game scale`:'Organic grove · no rectangular structure to calibrate';caption.append(detail);
  }
  $('status').textContent=`13 variants · 26 day/night views reviewed. ${corrected?'Measured structural directions aligned to the map.':'Original camera angles before correction.'} Drift reports the remaining painted-edge variation, not a pixel-perfect geometry claim.`;
}
try{
  await Promise.all([...new Set(Object.values(allBuildingArt).flatMap(a=>[a.file,a.nightFile]))].map(async file=>{const image=new Image();image.src='../art/'+file;await image.decode();images.set(file,image);}));
  for(const id of ['light','camera','guides'])$(id).addEventListener('change',render);
  render();
}catch(error){$('status').textContent='Projection review failed: '+error.message;console.error(error);}
