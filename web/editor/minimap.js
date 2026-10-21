import {habitatColors} from '../habitats.js';
import {unproject} from '../projection.js';

export class EditorMinimap {
  constructor(canvas,map){
    this.canvas=canvas;this.map=map;this.dragging=false;
    const move=e=>{const r=canvas.getBoundingClientRect();map.centerAt((e.clientX-r.left)/r.width*64,(e.clientY-r.top)/r.height*64);};
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;canvas.focus();canvas.setPointerCapture(e.pointerId);this.dragging=true;move(e);});
    canvas.addEventListener('pointermove',e=>{if(this.dragging)move(e);});
    for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{this.dragging=false;});
    canvas.addEventListener('keydown',e=>{
      const delta={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]}[e.key];
      if(delta){e.preventDefault();map.centerAt(map.view.center[0]+delta[0],map.view.center[1]+delta[1]);}
      else if(e.key==='Home'){e.preventDefault();map.centerAt(...map.document.map.camp);}
    });
  }
  set(report,geometry){
    this.ground=document.createElement('canvas');this.ground.width=this.ground.height=256;
    const c=this.ground.getContext('2d');c.scale(4,4);c.fillStyle='#74a7a0';c.fillRect(0,0,64,64);
    for(const {x,y,ground}of report.cells){c.fillStyle=habitatColors[ground.biome]||'#87965b';c.fillRect(x,y,1,1);}
    this.canvas.dataset.bankCells=String(geometry.banks.length);this.draw();
  }
  draw(){
    const {map,canvas}=this;if(!this.ground||!map.document||!map.origin)return;
    const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(this.ground,0,0,canvas.width,canvas.height);
    c.save();c.scale(canvas.width/64,canvas.height/64);
    c.fillStyle='#d6b176';for(const [x,y]of map.document.start.roads)c.fillRect(x-.4,y-.4,.8,.8);
    for(const b of map.document.start.buildings){c.fillStyle=map.selection().includes(b.id)?'#ffe28b':'#efe1ad';c.fillRect(b.x-.8,b.y-.8,1.6,1.6);}
    const [x,y]=map.document.map.camp;c.fillStyle='#fbefc6';c.beginPath();c.arc(x,y,.8,0,Math.PI*2);c.fill();
    const rect=map.canvas.getBoundingClientRect();c.strokeStyle='#fff4c7';c.lineWidth=.45;c.beginPath();
    for(const [i,p]of [[0,0],[rect.width,0],[rect.width,rect.height],[0,rect.height]].entries()){
      const point=unproject(p[0],p[1],map.origin,map.scale);i?c.lineTo(point.x,point.y):c.moveTo(point.x,point.y);
    }
    c.closePath();c.stroke();c.restore();
    canvas.dataset.center=JSON.stringify(map.view.center);
  }
}
