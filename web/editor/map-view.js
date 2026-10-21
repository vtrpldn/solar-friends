import {project,unproject,TILE_HALF_WIDTH,TILE_HALF_HEIGHT} from '../projection.js';
import {paintTerrain,soilAppearance,MAP_SIZE} from '../terrain.js';
import {allBuildingArt} from '../building-art.js?v=night-1';
import {footprintCorners,occupies} from '../building-footprints.js';
import {paintWorldGround,paintWorldTree,paintWorldBuilding,paintContactShadow} from '../world-renderer.js';
import {drawBuildingState} from '../building-state-art.js';
import {preparedFrames,FRAME_ANCHOR,RESIDENT_WIDTH} from '../sprite-frames.js';

const image=file=>{const value=new Image();value.src=new URL('../art/'+file,import.meta.url);return value;};
export async function loadEditorArt(){
  const images=Object.fromEntries(Object.entries(allBuildingArt).map(([key,art])=>[key,image(art.file)]));
  const terrain=image('terrain-atlas.png'),forest=image('mata-atlantica-atlas.png'),details=image('landscape-details.png');
  const residents=['iara','bento','luz','caua','nina'].map(name=>image(`animations/${name}.png`));
  await Promise.all([...Object.values(images),terrain,forest,details,...residents].map(i=>i.decode()));
  return {images,terrain,forest,details,residents};
}
const keyFor=b=>b.kind!=='home'?b.kind:b.recipe==='local'?'home-veranda':b.appearance||(b.recipe==='adobe'?'adobe-gable':'home');

export class EditorMap {
  constructor(canvas,art,{action,viewChanged,hover}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.art=art;
    this.action=action;this.viewChanged=viewChanged;this.hover=hover;
    this.view={center:[32,32],zoom:1.3,selected:null,tool:'select',grid:true};
    this.observer=new ResizeObserver(()=>this.render());this.observer.observe(canvas);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.motion(e));
    canvas.addEventListener('pointerup',e=>this.up(e));
    canvas.addEventListener('pointercancel',()=>{this.drag=null;this.stroke=null;this.render();});
    canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.pointer=null;this.render();}});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.view.zoom-e.deltaY*.001);},{passive:false});
  }
  set(document,snapshot,view){
    this.document=document;this.snapshot=snapshot;
    if(view)this.view={...this.view,...view,center:[...view.center]};
    this.render();
  }
  get state(){return structuredClone(this.view);}
  setTool(tool){this.view.tool=tool;this.stroke=null;this.drag=null;this.render();this.viewChanged(this.state);}
  select(id){this.view.selected=id;this.render();this.viewChanged(this.state);}
  centerAt(x,y){this.view.center=[Math.max(0,Math.min(63,x)),Math.max(0,Math.min(63,y))];this.render();this.viewChanged(this.state);}
  setZoom(zoom){this.view.zoom=Math.max(.32,Math.min(2.7,zoom));this.render();this.viewChanged(this.state);}
  point(event){const r=this.canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  cell(point){return unproject(point.x,point.y,this.origin,this.scale);}
  hit(cell){return [...(this.document?.start.buildings||[])].reverse().find(b=>occupies(b,cell.x,cell.y));}
  down(e){
    if(!this.document||!this.origin)return;
    this.canvas.focus();this.canvas.setPointerCapture(e.pointerId);
    const p=this.point(e),cell=this.cell(p),pan=e.button===1||e.button===2||this.view.tool==='pan';
    this.drag={point:p,center:[...this.view.center],moved:false,pan};
    if(!pan&&this.view.tool==='road'){this.stroke=new Map();this.stroke.set(`${cell.x},${cell.y}`,[cell.x,cell.y]);}
    if(!pan&&this.view.tool==='move'){const b=this.hit(cell);if(b){this.drag.building=b;this.select(b.id);}}
  }
  motion(e){
    if(!this.origin)return;
    const p=this.point(e);this.pointer=this.cell(p);this.hover?.(this.pointer);
    if(this.drag){
      const dx=p.x-this.drag.point.x,dy=p.y-this.drag.point.y;
      if(Math.hypot(dx,dy)>5)this.drag.moved=true;
      if(this.drag.pan||(this.view.tool==='select'&&this.drag.moved)){
        this.drag.pan=true;
        this.view.center=[this.drag.center[0]-(dx/(TILE_HALF_WIDTH*this.scale)+dy/(TILE_HALF_HEIGHT*this.scale))/2,this.drag.center[1]-(dy/(TILE_HALF_HEIGHT*this.scale)-dx/(TILE_HALF_WIDTH*this.scale))/2];
      }else if(this.stroke&&this.pointer.x>=1&&this.pointer.y>=1&&this.pointer.x<63&&this.pointer.y<63){this.stroke.set(`${this.pointer.x},${this.pointer.y}`,[this.pointer.x,this.pointer.y]);}
    }
    this.render();
  }
  up(e){
    if(!this.drag)return;
    const drag=this.drag,cell=this.cell(this.point(e));this.drag=null;
    if(drag.pan){this.centerAt(...this.view.center);return;}
    if(this.stroke){const cells=[...this.stroke.values()];this.stroke=null;this.action({type:'road',cells});return;}
    if(drag.building){this.action({type:'move',id:drag.building.id,x:cell.x,y:cell.y});return;}
    if(drag.moved)return;
    if(this.view.tool==='select'||this.view.tool==='move')this.select(this.hit(cell)?.id||null);
    else this.action({type:this.view.tool,x:cell.x,y:cell.y,id:this.hit(cell)?.id});
  }
  polygon(points,fill,stroke){
    const c=this.ctx;c.beginPath();points.forEach(([x,y],i)=>{const p=this.project(x,y);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.closePath();
    c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.4;c.stroke();}
  }
  render(){
    if(!this.document||!this.snapshot)return;
    const {canvas,ctx:c,view,art}=this,r=canvas.getBoundingClientRect(),width=r.width,height=r.height;
    if(!width||!height)return;
    const dpr=Math.min(devicePixelRatio,2),w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    c.setTransform(dpr,0,0,dpr,0,0);
    this.scale=Math.max(.18,Math.min(width/1000,height/800)*view.zoom);
    const anchor=project(...view.center,{x:0,y:0},this.scale);
    this.origin={x:width/2-anchor.x,y:height/2-anchor.y};
    this.project=(x,y)=>project(x,y,this.origin,this.scale);
    canvas.dataset.origin=JSON.stringify(this.origin);canvas.dataset.scale=this.scale;
    canvas.dataset.center=JSON.stringify(view.center);
    c.fillStyle='#dfe6c9';c.fillRect(0,0,width,height);
    const land=this.snapshot.village.land,roads=this.document.start.roads;
    const soil=soilAppearance(land.soil),key=JSON.stringify([land.seed,roads,soil]);
    if(this.groundKey!==key){this.ground=paintTerrain(art.terrain,roads,[],soil,land.seed);this.groundKey=key;}
    paintWorldGround(c,this.ground,this.origin,this.scale);
    if(view.grid){
      c.strokeStyle='#fff9d34d';c.lineWidth=.7;c.beginPath();
      for(let n=-.5;n<MAP_SIZE;n++)for(const points of [[[n,-.5],[n,MAP_SIZE-.5]],[[-.5,n],[MAP_SIZE-.5,n]]]){const a=this.project(...points[0]),b=this.project(...points[1]);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);}
      c.stroke();
    }
    if(this.stroke)for(const [x,y]of this.stroke.values())this.polygon(footprintCorners('road',x,y),'#f1c96766','#fff0b4');
    const structures=this.document.start.buildings.slice(0,256).filter(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)&&allBuildingArt[b.kind]);
    const objects=land.vegetation.filter(t=>!t.cleared).map(t=>({depth:t.x+t.y,draw:()=>paintWorldTree(c,t,{project:this.project,scale:this.scale,width,height,forest:art.forest,details:art.details})}));
    for(const b of structures)objects.push({depth:b.x+b.y,draw:()=>{
      if(view.selected===b.id)this.polygon(footprintCorners(b.kind,b.x,b.y),'#efc86d55','#ffe39a');
      paintWorldBuilding(c,{key:keyFor(b),x:b.x,y:b.y,alpha:b.state==='completed'?1:.2},{project:this.project,scale:this.scale,images:art.images});
      if(b.state!=='completed')drawBuildingState(c,{complete:false,progress:0,point:this.project(b.x,b.y),corners:footprintCorners(b.kind,b.x,b.y).map(([x,y])=>this.project(x,y)),scale:this.scale,kind:b.kind});
    }});
    for(const resident of this.snapshot.residents)objects.push({depth:resident.x+resident.y+.6,draw:()=>{
      const p=this.project(resident.x,resident.y),frame=preparedFrames(art.residents[resident.id],{referenceRow:2})?.[8],size=RESIDENT_WIDTH*this.scale;
      paintContactShadow(c,p.x,p.y+2*this.scale,10*this.scale,4*this.scale,.25);
      if(frame)c.drawImage(frame,p.x-size/2,p.y-size*FRAME_ANCHOR,size,size);
    }});
    objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
    for(const [label,point,colour]of [['Camp',this.document.map.camp,'#476c44'],['Start view',this.document.map.camera,'#8f603c']]){
      const p=this.project(...point),same=this.document.map.camp.every((n,i)=>n===this.document.map.camera[i]);c.strokeStyle=colour;c.fillStyle='#f5e5ba';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,7,0,Math.PI*2);c.fill();c.stroke();c.font='bold 11px Trebuchet MS';c.textAlign='center';c.fillStyle=colour;c.fillText(label,p.x,p.y+(same&&label==='Camp'?-15:22));
    }
    if(this.pointer&&allBuildingArt[view.tool]){
      this.polygon(footprintCorners(view.tool,this.pointer.x,this.pointer.y),'#f4df9a66','#fff3c4');
      paintWorldBuilding(c,{key:view.tool,x:this.pointer.x,y:this.pointer.y,alpha:.45},{project:this.project,scale:this.scale,images:art.images});
    }
    if(this.drag?.building&&this.pointer)this.polygon(footprintCorners(this.drag.building.kind,this.pointer.x,this.pointer.y),'#f4df9a66','#fff3c4');
    canvas.style.cursor=view.tool==='select'?'grab':view.tool==='pan'?'grab':'crosshair';
  }
}
