export const MIN_EDITOR_ZOOM=.18;
import {newStartingBuilding} from './objects.js';
import {GroupPreview} from './group-preview.js';
import {resolvedNature,natureAt} from './nature.js';
import {utilityLines,goalRegions,sceneRouteAt,routeVisible} from './scene-layers.js';
import {corridorCells} from './routes.js';
import {paintUtilityRoute} from '../utility-lines-art.js';
import {hitStartingBank,newStartingBank} from './batteries.js';
import {batteryImage,drawBattery} from '../battery-art.js';
import {loadChickenArt,flock,drawChicken} from '../chickens.js';
import {paintResourceSite} from '../resource-site-art.js';
import {economyImage} from '../economy-art.js';
import {hitStartingSite,sourceKinds,sitePreview,newStartingSite} from './sites.js';
import {loadCropArt} from '../crop-art.js';
import {residentLookKeys} from '../resident-look.js';
import {createResidentAppearanceLibrary} from '../resident-appearance-library.js';
import {loadRegionalArt} from '../regional-art.js';
import {prepareTerrain} from './prepare-terrain.js';
import {terrainInputs,completedTerrain,rememberTerrain} from './terrain-cache.js';
import {strokeCells} from './brush.js';
import {project,unproject,TILE_HALF_WIDTH,TILE_HALF_HEIGHT} from '../projection.js';
import {paintTerrain,MAP_SIZE} from '../terrain.js';
import {allBuildingArt} from '../building-art.js?v=night-1';
import {footprintCorners,occupies} from '../building-footprints.js';
import {paintWorldGround,paintWorldTree,worldTreeBounds,paintWorldBuilding,paintWorldCrops,paintContactShadow} from '../world-renderer.js';
import {drawBuildingState} from '../building-state-art.js';
import {FRAME_ANCHOR,RESIDENT_WIDTH} from '../sprite-frames.js';

const image=file=>{const value=new Image();value.src=new URL('../art/'+file,import.meta.url);return value;};
export async function loadEditorArt(){
  const images=Object.fromEntries(Object.entries(allBuildingArt).map(([key,art])=>[key,image(art.file)]));
  for(const [kind,art]of Object.entries(allBuildingArt))if(art.emptyFile)images[kind+':empty']=image(art.emptyFile);
  const terrain=image('terrain-atlas.png'),forest=image('mata-atlantica-atlas.png'),details=image('landscape-details.png');
  const residents=residentLookKeys.map(name=>image(`animations/${name}.png`));
  await Promise.all([loadRegionalArt(),loadCropArt(),loadChickenArt()]);
  await Promise.all([...Object.values(images),terrain,forest,details,...residents,economyImage,batteryImage].map(i=>i.decode()));
  const appearances=createResidentAppearanceLibrary({base:residents});
  return {images,terrain,forest,details,residents,appearances};
}
const catalogMaterial=material=>['timber','bamboo','earth','stone','salvage'].indexOf(material);
const keyFor=b=>b.kind!=='home'?b.kind:b.recipe==='local'?'home-veranda':b.appearance||(b.recipe==='adobe'?'adobe-gable':'home');

export class EditorMap {
  constructor(canvas,art,{action,viewChanged,hover,preview=false,onArtworkReady=()=>{},onTerrainReady=()=>{},retryButton=null}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.art=art;
    this.action=action;this.viewChanged=viewChanged;this.hover=hover;this.onArtworkReady=onArtworkReady;
    this.onTerrainReady=onTerrainReady;this.retryButton=retryButton;if(retryButton)retryButton.onclick=()=>{if(this.document&&this.snapshot)this.set(this.document,this.snapshot,null);};
    this.brushSize=3;this.natureDensity=1;
    this.view={center:[32,32],zoom:1.3,selected:null,selectedResident:null,selectedRoute:null,selectedBank:null,selectedSite:null,selectedNature:null,selection:[],tool:'select',grid:true};
    this.preview=preview;
    if(preview)return;
    this.placementNotice=document.createElement('p');this.placementNotice.className='creator-placement-status';this.placementNotice.setAttribute('role','status');this.placementNotice.hidden=true;canvas.after(this.placementNotice);
    canvas.dataset.placementState='none';canvas.dataset.placementRoutes='0';
    this.groupPreview=new GroupPreview(result=>{if(!result&&!this.groupPlacement)return;this.groupPlacement=result;this.placementNotice.hidden=!result;this.placementNotice.textContent=result?(result.pending?'Checking this site…':result.message):'';canvas.dataset.placementState=!result?'none':result.pending?'checking':result.unavailable?'unavailable':result.allowed?'allowed':'blocked';canvas.dataset.placementRoutes=String(result?.routes?.length??0);if(this.document&&result&&!result.pending)this.render();});
    this.observer=new ResizeObserver(()=>this.render());this.observer.observe(canvas);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('pointerdown',e=>this.down(e));
    canvas.addEventListener('pointermove',e=>this.motion(e));
    canvas.addEventListener('pointerup',e=>this.up(e));
    canvas.addEventListener('pointercancel',()=>this.cancelGesture());
    canvas.addEventListener('lostpointercapture',()=>{if(this.drag)this.cancelGesture();});
    canvas.addEventListener('pointerleave',()=>{if(!this.drag){this.pointer=null;this.groupPreview.clear();this.render();}});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.setZoom(this.view.zoom-e.deltaY*.001);},{passive:false});
  }
  set(document,snapshot,view,{paint=true}={}){
    this.groupPreview?.clear();this.document=document;this.snapshot=snapshot;
    this.naturalObjects=this.natureCatalog?resolvedNature(document,snapshot,this.natureCatalog):[];
    this.landPaint=terrainInputs(document,snapshot);
    if(this.terrainTask&&this.terrainTask.key!==this.landPaint.key){this.terrainTask.controller.abort();this.terrainTask=null;this.terrainLoading=false;this.terrainError=null;}
    const appearances=snapshot.residents.map(p=>p.appearance);if(!this.preview)this.art.appearances.setActive(appearances);
    const revision=this.artRevision=(this.artRevision??0)+1;this.artLoading=appearances.some(a=>!this.art.appearances.isReady(a));this.artError=null;
    const pending=appearances.filter(a=>!this.art.appearances.isReady(a));this.artProgress={completed:appearances.length-pending.length,total:appearances.length};
    this.updateBusy();
    if(this.artLoading)Promise.all(pending.map(async a=>{await this.art.appearances.prepare(a);if(revision===this.artRevision&&!this.artError){this.artProgress.completed++;this.updateBusy();this.render();}})).then(()=>{if(revision===this.artRevision){this.artLoading=false;this.updateBusy();this.render();this.onArtworkReady();}},error=>{if(revision===this.artRevision){this.artError=error.message;this.updateBusy();this.render();}});
    if(view)this.view={...this.view,...view,center:[...view.center]};
    if(this.view.selectedNature&&!this.naturalObjects.some(p=>p.id===this.view.selectedNature))this.view.selectedNature=null;
    if(paint||view||this.artLoading)this.render();
  }
  artworkStatus(){return `Preparing friends · ${this.artProgress?.completed??0} of ${this.artProgress?.total??0} ready`; }
  updateBusy(){this.canvas.setAttribute('aria-busy',String(!!(this.artLoading&&!this.artError||this.terrainLoading)));this.canvas.setAttribute('aria-description',this.artError??(this.artLoading?this.artworkStatus():null)??this.terrainError??(this.terrainLoading?'Updating landscape. You can keep editing.':''));this.canvas.style.pointerEvents=this.artLoading?'none':'';if(this.retryButton){this.retryButton.hidden=!this.artError;this.retryButton.disabled=!!(this.artLoading&&!this.artError);}}
  groundFor(key,request){
    if(this.groundKey===key){
      // Undo may return to the displayed land while a newer paint is pending.
      if(this.terrainTask){this.terrainTask.controller.abort();this.terrainTask=null;this.terrainLoading=false;this.terrainError=null;this.updateBusy();}
      return this.ground;
    }
    const cached=completedTerrain(this.art,key);
    if(cached){this.terrainTask?.controller.abort();this.terrainTask=null;this.terrainLoading=false;this.terrainError=null;this.ground=cached;this.groundKey=key;this.updateBusy();return cached;}
    if(this.preview||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'){
      this.ground=paintTerrain(this.art.terrain,request.roads,[],request.soil,request.seed,request.map);this.groundKey=key;return this.ground;
    }
    if(this.terrainTask?.key===key||this.terrainFailedKey===key)return this.ground;
    this.terrainTask?.controller.abort();
    const task={key,controller:new AbortController()};this.terrainTask=task;this.terrainLoading=true;this.terrainError=null;this.terrainFailedKey=null;this.updateBusy();
    prepareTerrain(request,{signal:task.controller.signal}).then(bitmap=>{
      try{
        if(this.terrainTask!==task)return;
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);
        this.ground=canvas;this.groundKey=key;rememberTerrain(this.art,key,canvas);
        this.terrainTask=null;this.terrainLoading=false;this.updateBusy();this.render();this.onTerrainReady();
      }finally{bitmap.close();}
    }).catch(error=>{
      if(this.terrainTask!==task)return;
      this.terrainTask=null;this.terrainLoading=false;this.terrainFailedKey=key;this.terrainError=error.message;this.updateBusy();this.render();
    });
    return this.ground;
  }
  // Close a temporary comparison without leaving its paint worker or late
  // artwork callback attached to a discarded proposal. The shared art is borrowed.
  clearPreview(){
    this.document=null;this.snapshot=null;this.landPaint=null;this.artRevision=(this.artRevision??0)+1;
    this.terrainTask?.controller.abort();this.terrainTask=null;this.terrainLoading=false;this.artLoading=false;this.ground=null;this.groundKey=null;this.terrainFailedKey=null;this.artError=null;this.terrainError=null;this.cancelGesture({paint:false});this.updateBusy();this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
  }
  // A pan is a preview until pointerup; autosaves keep its starting camera.
  get state(){return structuredClone({...this.view,center:this.drag?.pan?this.drag.center:this.view.center,brushSize:this.brushSize,natureDensity:this.natureDensity,natureSpeciesKey:this.natureSpecies?.key,natureSize:this.natureSize||1});}
  cancelGesture({paint=true}={}){
    const active=!!(this.drag||this.stroke||this.routeStroke),hadPreview=!!this.groupPlacement;this.groupPreview?.clear();
    if(this.drag?.pan)this.view.center=[...this.drag.center];
    this.drag=null;this.stroke=null;this.routeStroke=null;this.strokeLast=null;
    if((active||hadPreview)&&paint)this.render();
    return active;
  }
  setTool(tool){this.cancelGesture({paint:false});this.view.tool=tool;this.assetPreviewContext=null;this.placementAsset=tool==='battery-bank'?{collection:'batteries',asset:newStartingBank(0,0)}:sourceKinds.includes(tool)?{collection:'resource_sites',asset:newStartingSite(tool.slice(7),0,0)}:null;this.placementBuilding=allBuildingArt[tool]?newStartingBuilding(tool,0,0):null;this.updateGroupPreview();this.render();this.viewChanged(this.state);}
  updateGroupPreview(){
    if(!this.groupPreview||!this.pointer||!this.document)return;
    if(this.view.tool==='road'){this.groupPreview.observe(this.document,'road',null,[],this.pointer.x,this.pointer.y,this.stroke?[...this.stroke.values()]:[[this.pointer.x,this.pointer.y]]);return;}
    if(this.placementBuilding?.kind===this.view.tool){this.groupPreview.observe(this.document,'place',this.placementBuilding,[],this.pointer.x,this.pointer.y);return;}
    if(this.placementAsset){this.groupPreview.observe(this.document,'asset',this.placementAsset,[],this.pointer.x,this.pointer.y);return;}
    const tool=this.view.tool,bank=this.drag?.bank??(tool==='copy-bank'?this.bankCopy:tool==='move-bank'?this.document.start.batteries?.find(b=>b.id===this.view.selectedBank):null),site=this.drag?.site??(tool==='copy-site'?this.siteCopy:tool==='move-site'?this.document.start.resource_sites?.find(s=>s.id===this.view.selectedSite):null),source=bank??site;
    if(source){
      if(this.assetPreviewContext?.source!==source||this.assetPreviewContext.tool!==tool){const copying=tool.startsWith('copy-'),asset=structuredClone(source);if(copying)asset.id=crypto.randomUUID();this.assetPreviewContext={source,tool,proposal:{collection:bank?'batteries':'resource_sites',asset,replace:!copying,copyFrom:copying&&bank?source.id:null}};}
      this.groupPreview.observe(this.document,'asset',this.assetPreviewContext.proposal,[],this.pointer.x,this.pointer.y);return;
    }
    const natural=this.drag?.nature??(tool==='copy-nature'?this.natureCopy:tool==='move-nature'?this.naturalObjects?.find(p=>p.id===this.view.selectedNature):null);
    if(natural){
      if(this.naturePreviewContext?.source!==natural||this.naturePreviewContext.tool!==tool||this.naturePreviewContext.objects!==this.naturalObjects)this.naturePreviewContext={source:natural,tool,objects:this.naturalObjects,proposal:{source:natural,objects:this.naturalObjects,catalog:this.natureCatalog,copy:tool==='copy-nature'}};
      this.groupPreview.observe(this.document,'nature',this.naturePreviewContext.proposal,[],this.pointer.x,this.pointer.y);return;
    }
    const copy=this.view.tool==='duplicate'?this.copy:null,anchor=copy?.buildings[0]??this.drag?.building;
    if(!anchor){if(this.groupPlacement)this.groupPreview.clear();return;}
    this.groupPreview.observe(this.document,copy?'copy':'move',copy,copy?[]:this.selection(),this.pointer.x-anchor.x,this.pointer.y-anchor.y);
  }
  selection(){const existing=new Set((this.document?.start.buildings??[]).map(b=>b.id));return (this.view.selection?.length?this.view.selection:[this.view.selected]).filter(id=>existing.has(id));}
  selectResident(id){this.select(null);this.view.selectedResident=id;this.render();this.viewChanged(this.state);}
  residentAt(cell){const bindings=this.snapshot?.scenario_ref?.residents??{};const person=this.snapshot?.residents.find(p=>Math.hypot(p.x-cell.x,p.y-cell.y)<.8);return person?Object.keys(bindings).find(id=>bindings[id]===person.id):null;}
  selectRoute(id){this.view.selectedNature=null;this.view.selectedResident=null;this.view.selectedRoute=id;this.view.selectedBank=null;this.view.selectedSite=null;this.view.selected=null;this.view.selection=[];this.render();this.viewChanged(this.state);}
  selectBank(id){this.view.selectedNature=null;this.view.selectedResident=null;this.view.selectedRoute=null;this.view.selectedBank=id;this.view.selectedSite=null;this.view.selected=null;this.view.selection=[];this.render();this.viewChanged(this.state);}
  selectSite(id){this.view.selectedNature=null;this.view.selectedResident=null;this.view.selectedRoute=null;this.view.selectedBank=null;this.view.selectedSite=id;this.view.selected=null;this.view.selection=[];this.render();this.viewChanged(this.state);}
  select(id,toggle=false){
    this.view.selectedNature=null;this.view.selectedResident=null;
    this.view.selectedRoute=null;this.view.selectedBank=null;this.view.selectedSite=null;
    const ids=toggle?new Set(this.selection()):new Set();
    if(id){if(toggle&&ids.has(id))ids.delete(id);else ids.add(id);}
    this.view.selection=[...ids];this.view.selected=this.view.selection.at(-1)||null;this.render();this.viewChanged(this.state);
  }
  selectNature(id){this.select(null);this.view.selectedNature=id;this.render();this.viewChanged(this.state);}
  natureAt(cell){return natureAt(this.naturalObjects??[],cell.x,cell.y);}
  centerAt(x,y){this.view.center=[Math.max(0,Math.min(63,x)),Math.max(0,Math.min(63,y))];this.render();this.viewChanged(this.state);}
  setZoom(zoom){this.view.zoom=Math.max(MIN_EDITOR_ZOOM,Math.min(2.7,zoom));this.render();this.viewChanged(this.state);}
  point(event){const r=this.canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  cell(point){return unproject(point.x,point.y,this.origin,this.scale);}
  hit(cell){return [...(this.document?.start.buildings||[])].reverse().find(b=>occupies(b,cell.x,cell.y));}
  down(e){
    if(!this.document||!this.origin)return;
    this.canvas.focus();this.canvas.setPointerCapture(e.pointerId);
    const p=this.point(e),cell=this.cell(p),pan=e.button===1||e.button===2||this.view.tool==='pan';
    this.drag={cell,point:p,center:[...this.view.center],moved:false,pan,toggle:e.shiftKey};
    if(!pan&&this.view.tool==='route-path')this.routeStroke=[[cell.x,cell.y]];
    if(!pan&&['road','meadow','river','nature','thin-nature','habitat'].includes(this.view.tool)){this.stroke=new Map();this.strokeLast=[cell.x,cell.y];for(const p of strokeCells(this.strokeLast,this.strokeLast))this.stroke.set(p.join(','),p);}
    if(!pan&&this.view.tool==='move'){const resident=this.residentAt(cell);if(resident){this.drag.resident=resident;this.selectResident(resident);return;}const bank=hitStartingBank(this.document,cell.x,cell.y);if(bank){this.drag.bank=bank;this.selectBank(bank.id);return;}const b=this.hit(cell);if(b){this.drag.building=b;if(!this.selection().includes(b.id))this.select(b.id);}else{const site=hitStartingSite(this.document,cell.x,cell.y);if(site){this.drag.site=site;this.selectSite(site.id);}else{const nature=this.natureAt(cell);if(nature){this.drag.nature=nature;this.selectNature(nature.id);}}}}
  }
  motion(e){
    if(!this.origin)return;
    const p=this.point(e);this.pointer=this.cell(p);this.hover?.(this.pointer);
    if(this.drag){
      const dx=p.x-this.drag.point.x,dy=p.y-this.drag.point.y;
      if(Math.hypot(dx,dy)>5)this.drag.moved=true;
      if(this.drag.pan||(this.view.tool==='select'&&this.drag.moved&&!this.drag.toggle)){
        this.drag.pan=true;
        this.view.center=[this.drag.center[0]-(dx/(TILE_HALF_WIDTH*this.scale)+dy/(TILE_HALF_HEIGHT*this.scale))/2,this.drag.center[1]-(dy/(TILE_HALF_HEIGHT*this.scale)-dx/(TILE_HALF_WIDTH*this.scale))/2];
      }else this.extendStroke(this.pointer);
    }
    this.updateGroupPreview();this.render();
  }
  extendStroke(cell){
    if(this.routeStroke){const cells=corridorCells(this.routeStroke.at(-1),[cell.x,cell.y]);for(const next of cells.slice(1)){const back=this.routeStroke.findIndex(p=>p[0]===next[0]&&p[1]===next[1]);if(back>=0)this.routeStroke.length=back+1;else this.routeStroke.push(next);}}
    else if(this.stroke){const next=[cell.x,cell.y];for(const p of strokeCells(this.strokeLast,next))this.stroke.set(p.join(','),p);this.strokeLast=next;}
  }
  up(e){
    if(!this.drag)return;
    const drag=this.drag,cell=this.cell(this.point(e));this.drag=null;if(this.view.tool!=='duplicate'&&!allBuildingArt[this.view.tool]&&!this.placementAsset&&!['move-bank','copy-bank','move-site','copy-site','move-nature','copy-nature'].includes(this.view.tool))this.groupPreview?.clear();
    if(this.view.tool==='region'&&!drag.pan){const x=Math.max(0,Math.min(63,Math.min(drag.cell.x,cell.x))),y=Math.max(0,Math.min(63,Math.min(drag.cell.y,cell.y))),right=Math.max(0,Math.min(63,Math.max(drag.cell.x,cell.x))),bottom=Math.max(0,Math.min(63,Math.max(drag.cell.y,cell.y)));this.action({type:'region',rectangle:{x,y,width:right-x+1,height:bottom-y+1}});return;}
    if(drag.pan){this.centerAt(...this.view.center);return;}
    // Release can carry a newer position than the last delivered move event.
    // Use the same interpolation/backtracking rules before the atomic commit.
    this.extendStroke(cell);
    if(this.routeStroke){const cells=this.routeStroke;this.routeStroke=null;this.action({type:'route-path',cells});return;}
    if(this.stroke){const cells=[...this.stroke.values()];this.stroke=null;this.strokeLast=null;this.action({type:this.view.tool,cells,size:this.brushSize});return;}
    if(drag.resident){this.action({type:'resident-start',resident:drag.resident,x:cell.x,y:cell.y});return;}
    if(drag.bank){this.action({type:'move-bank',x:cell.x,y:cell.y});return;}
    if(drag.nature){this.action({type:'move-nature',x:cell.x,y:cell.y});return;}
    if(drag.site){this.action({type:'move-site',x:cell.x,y:cell.y});return;}
    if(drag.building){this.action({type:'move',id:drag.building.id,ids:this.selection(),dx:cell.x-drag.building.x,dy:cell.y-drag.building.y,x:cell.x,y:cell.y});return;}
    if(drag.moved){
      if(drag.toggle&&this.view.tool==='select'){
        const end=this.point(e),left=Math.min(drag.point.x,end.x),right=Math.max(drag.point.x,end.x),top=Math.min(drag.point.y,end.y),bottom=Math.max(drag.point.y,end.y);
        const ids=new Set(this.selection());
        for(const b of this.document.start.buildings){const p=this.project(b.x,b.y);if(p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom)ids.add(b.id);}
        this.view.selectedNature=null;this.view.selectedResident=null;this.view.selectedRoute=null;this.view.selectedBank=null;this.view.selectedSite=null;this.view.selection=[...ids];this.view.selected=this.view.selection.at(-1)||null;this.render();this.viewChanged(this.state);
      }
      return;
    }
    if(this.view.tool==='select'||this.view.tool==='move'){const resident=this.residentAt(cell);if(resident){this.selectResident(resident);return;}const bank=hitStartingBank(this.document,cell.x,cell.y);if(bank){this.selectBank(bank.id);return;}const site=hitStartingSite(this.document,cell.x,cell.y),route=sceneRouteAt(this.document,this.view,cell.x,cell.y);if(site&&!this.hit(cell))this.selectSite(site.id);else if(route&&!this.hit(cell))this.selectRoute(route.id);else if(!this.hit(cell)&&this.natureAt(cell))this.selectNature(this.natureAt(cell).id);else this.select(this.hit(cell)?.id||null,drag.toggle);}
    else this.action({type:this.view.tool,x:cell.x,y:cell.y,id:this.hit(cell)?.id,natureId:this.natureAt(cell)?.id});
  }
  polygon(points,fill,stroke){
    const c=this.ctx;c.beginPath();points.forEach(([x,y],i)=>{const p=this.project(x,y);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.closePath();
    c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.4;c.stroke();}
  }
  render(){
    if(!this.document||!this.snapshot)return;
    const {canvas,ctx:c,view,art}=this,r=this.preview?{width:480,height:300}:canvas.getBoundingClientRect(),width=r.width,height=r.height;
    if(!width||!height)return;
    const dpr=this.preview?1:Math.min(devicePixelRatio,2),w=Math.round(width*dpr),h=Math.round(height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    c.setTransform(dpr,0,0,dpr,0,0);
    if(this.artLoading){
      c.fillStyle='#efe3bc';c.fillRect(0,0,width,height);c.fillStyle='#483a27';c.font='bold 20px Georgia';c.textAlign='center';
      c.fillText(this.artError?'Your friends could not be prepared':this.artworkStatus(),width/2,height/2-24);
      c.font='14px sans-serif';c.fillText(this.artError?'Choose Retry resident artwork to try again.':'Preparing their appearances for this village.',width/2,height/2+4);
      if(!this.artError){const barWidth=Math.min(280,width-40),fraction=this.artProgress.total?this.artProgress.completed/this.artProgress.total:0;c.fillStyle='#b7a77a';c.fillRect((width-barWidth)/2,height/2+24,barWidth,8);c.fillStyle='#708445';c.fillRect((width-barWidth)/2,height/2+24,barWidth*fraction,8);}
      c.textAlign='start';return;
    }
    this.scale=Math.max(.18,Math.min(width/1000,height/800)*view.zoom);
    const anchor=project(...view.center,{x:0,y:0},this.scale);
    this.origin={x:width/2-anchor.x,y:height/2-anchor.y};
    this.project=(x,y)=>project(x,y,this.origin,this.scale);
    canvas.dataset.origin=JSON.stringify(this.origin);canvas.dataset.scale=this.scale;
    canvas.dataset.center=JSON.stringify(view.center);canvas.dataset.overlayCells=String(this.landOverlay?.length||0);
    c.fillStyle='#dfe6c9';c.fillRect(0,0,width,height);
    const land=this.snapshot.village.land;
    const {key,request}=this.landPaint,ground=this.groundFor(key,request);
    if(ground)paintWorldGround(c,ground,this.origin,this.scale);
    for(const tile of this.landOverlay||[])this.polygon(footprintCorners('road',tile.x,tile.y),tile.fill,tile.stroke);
    if(view.grid){
      c.strokeStyle='#fff9d34d';c.lineWidth=.7;c.beginPath();
      for(let n=-.5;n<MAP_SIZE;n++)for(const points of [[[n,-.5],[n,MAP_SIZE-.5]],[[-.5,n],[MAP_SIZE-.5,n]]]){const a=this.project(...points[0]),b=this.project(...points[1]);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);}
      c.stroke();
    }
    const lines=view.layer==='regions'?[]:utilityLines(this.snapshot,view.layer==='utilities'?view.utilityKind:'all');
    c.save();c.lineJoin='round';c.lineCap='round';
    for(const p of lines)paintUtilityRoute(c,this.project,this.scale,p.plan,({fresh:'#7bb8c8',irrigation:'#9dbb68',greywater:'#b99dbb',sewage:'#c6a06a',electricity:'#e0c46b'})[p.plan.kind],p.phase!=='active',{pump:p.plan.kind!=='electricity'});
    c.restore();canvas.dataset.utilityCount=String(lines.length);
    const regions=this.preview||view.layer==='utilities'?[]:[...(view.layer==='regions'?goalRegions(this.document,view.regionId):this.document.map.regions??[])];
    if(view.tool==='region'&&this.drag&&!this.drag.pan&&this.pointer){const a=this.drag.cell,b=this.pointer;regions.push({title:'New region',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x)+1,height:Math.abs(a.y-b.y)+1});}
    for(const region of regions){const {x,y,width:w,height:h}=region;this.polygon([[x-.5,y-.5],[x+w-.5,y-.5],[x+w-.5,y+h-.5],[x-.5,y+h-.5]],'#d9af4822','#e8c05a');const p=this.project(x+(w-1)/2,y-.5);c.font='bold 12px sans-serif';c.textAlign='center';c.fillStyle='#4f3920';c.fillText(region.title,p.x,p.y-8);}
    canvas.dataset.regionCount=String(this.document.map.regions?.length??0);canvas.dataset.visibleRegions=String(regions.length);
    if(this.pointer&&view.tool==='road'&&!this.stroke)this.polygon(footprintCorners('road',this.pointer.x,this.pointer.y),this.groupPlacement?.allowed===false?'#b94f4f66':'#f1c96766',this.groupPlacement?.allowed===false?'#ffb3a3':'#fff0b4');
    if(this.stroke)for(const [x,y]of this.stroke.values()){const size=['meadow','nature','thin-nature','habitat'].includes(view.tool)?this.brushSize:1,left=x-Math.floor(size/2)-.5,top=y-Math.floor(size/2)-.5;this.polygon([[left,top],[left+size,top],[left+size,top+size],[left,top+size]],view.tool==='road'&&this.groupPlacement?.allowed===false?'#b94f4f66':'#f1c96766',view.tool==='road'&&this.groupPlacement?.allowed===false?'#ffb3a3':'#fff0b4');}
    const groupBlocked=this.groupPlacement?.allowed===false,groupFill=groupBlocked?'#c65e4266':'#f4df9a66',groupStroke=groupBlocked?'#f39b80':'#fff3c4';
    const selectedBuildings=new Set(this.selection());
    const structures=this.document.start.buildings.slice(0,256).filter(b=>Number.isFinite(b.x)&&Number.isFinite(b.y)&&allBuildingArt[b.kind]);
    const objects=land.vegetation.filter(t=>!t.cleared).map(t=>({depth:t.x+t.y,draw:()=>paintWorldTree(c,t,{project:this.project,scale:this.scale,width,height,forest:art.forest,details:art.details})}));
    for(const b of structures)objects.push({depth:b.x+b.y,draw:()=>{
      if(selectedBuildings.has(b.id))this.polygon(footprintCorners(b.kind,b.x,b.y),'#efc86d55','#ffe39a');
      paintWorldBuilding(c,{key:keyFor(b),x:b.x,y:b.y,alpha:b.state==='completed'?1:.2,emptyAnimals:b.state!=='completed'||b.animals?.stocked===false},{project:this.project,scale:this.scale,images:art.images});
      if(b.state==='completed'){
        const resolved=this.snapshot.village.buildings.find(p=>p.kind===b.kind&&p.x===b.x&&p.y===b.y);
        if(resolved)paintWorldCrops(c,resolved,{project:this.project,scale:this.scale,health:this.snapshot.environment.economy.processes?.growing?.find(p=>p.building===resolved.id)?.health??1});
      }
      if(b.state!=='completed')drawBuildingState(c,{complete:false,progress:0,point:this.project(b.x,b.y),corners:footprintCorners(b.kind,b.x,b.y).map(([x,y])=>this.project(x,y)),scale:this.scale,kind:b.kind});
    }});
    for(const [i,site]of (this.document.start.resource_sites??[]).entries()){
      const native=this.snapshot.village.economy.sources[i];
      if(!native||native.x!==site.x||native.y!==site.y||catalogMaterial(site.material)!==native.material)continue;
      objects.push({depth:site.x+site.y,draw:()=>{if(view.selectedSite===site.id)this.polygon(footprintCorners(sourceKinds[native.material],site.x,site.y),'#efc86d55','#ffe39a');paintResourceSite(c,native,{project:this.project,scale:this.scale,width,height,forest:art.forest,details:art.details});}});
    }
    if(this.pointer&&(sourceKinds.includes(view.tool)||['move-site','copy-site'].includes(view.tool))){const source=this.siteCopy||this.document.start.resource_sites?.find(s=>s.id===view.selectedSite),kind=sourceKinds.includes(view.tool)?view.tool:sourceKinds[catalogMaterial(source?.material)];if(kind){this.polygon(footprintCorners(kind,this.pointer.x,this.pointer.y),groupFill,groupStroke);const preview=sitePreview(sourceKinds.includes(view.tool)?newStartingSite(kind.slice(7),this.pointer.x,this.pointer.y,'preview'):{...source,x:this.pointer.x,y:this.pointer.y});paintResourceSite(c,preview,{project:this.project,scale:this.scale,width,height,forest:art.forest,details:art.details,alpha:.45});}}
    for(const bank of this.snapshot.village.power.network.nodes.filter(n=>n.owner.kind==='ground'&&n.kind==='battery'))objects.push({depth:bank.x+bank.y+.1,draw:()=>{if(hitStartingBank(this.document,bank.x,bank.y)?.id===view.selectedBank)this.polygon(footprintCorners('battery',bank.x,bank.y),'#efc86d55','#ffe39a');drawBattery(c,this.project(bank.x,bank.y),this.scale);}});
    for(const hen of flock(this.snapshot.village))objects.push({depth:hen.x+hen.y+.2,draw:()=>drawChicken(c,this.project(hen.x,hen.y),this.scale,hen)});
    for(const resident of this.snapshot.residents)objects.push({depth:resident.x+resident.y+.6,draw:()=>{
      const p=this.project(resident.x,resident.y),frame=art.appearances.portraitFrame(resident.appearance),size=RESIDENT_WIDTH*this.scale;
      if(this.snapshot.scenario_ref?.residents?.[view.selectedResident]===resident.id){c.beginPath();c.ellipse(p.x,p.y,14*this.scale,7*this.scale,0,0,Math.PI*2);c.strokeStyle='#ffe39a';c.lineWidth=2;c.stroke();}
      paintContactShadow(c,p.x,p.y+2*this.scale,10*this.scale,4*this.scale,.25);
      if(frame)c.drawImage(frame,p.x-size/2,p.y-size*FRAME_ANCHOR,size,size);
    }});
    if(this.pointer&&(view.tool==='resident-start'||this.drag?.resident)){const id=this.drag?.resident??this.placingResident,person=this.snapshot.residents.find(p=>p.id===this.snapshot.scenario_ref?.residents?.[id]);if(person){const p=this.project(this.pointer.x,this.pointer.y),size=RESIDENT_WIDTH*this.scale,frame=art.appearances.portraitFrame(person.appearance);objects.push({depth:this.pointer.x+this.pointer.y+.6,draw:()=>{c.save();c.globalAlpha=.5;c.drawImage(frame,p.x-size/2,p.y-size*FRAME_ANCHOR,size,size);c.restore();}});}}
    objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());
    if(view.layer==='utilities'){
      c.save();c.lineJoin='round';c.lineCap='round';for(const p of lines)paintUtilityRoute(c,this.project,this.scale,p.plan,({fresh:'#7bb8c8',irrigation:'#9dbb68',greywater:'#b99dbb',sewage:'#c6a06a',electricity:'#e0c46b'})[p.plan.kind],p.phase!=='active',{pump:p.plan.kind!=='electricity'});c.restore();
    }
    if(view.layer==='regions')for(const region of regions){const {x,y,width:w,height:h}=region;this.polygon([[x-.5,y-.5],[x+w-.5,y-.5],[x+w-.5,y+h-.5],[x-.5,y+h-.5]],'#d9af4811','#ffe39a');const p=this.project(x+(w-1)/2,y-.5);c.save();c.font='bold 12px sans-serif';c.textAlign='center';c.fillStyle='#fff5dd';const width=c.measureText(region.title).width+12;c.fillRect(p.x-width/2,p.y-25,width,20);c.fillStyle='#4f3920';c.fillText(region.title,p.x,p.y-11);c.restore();}
    // Water-access labels sit above sprites so a full tank is not hidden by a roof.
    for(const source of this.waterAccess?.sources??[]){
      const p=this.project(source.x,source.y),usable=source.open&&source.available>0&&source.reachable_by.length;
      const label=`${source.available.toFixed(1)} fresh · ${source.reachable_by.length}/${this.waterAccess.participants.length} · ${!source.open?'closed':!source.reachable_by.length?'no route':source.available>0?'ready':'empty'}`;
      c.save();c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='middle';const w=c.measureText(label).width+14;
      c.fillStyle='#fff5ddee';c.strokeStyle=usable?'#476c44':'#9c6941';c.lineWidth=2;c.beginPath();c.moveTo(p.x,p.y-9);c.lineTo(p.x,p.y-30);c.stroke();c.fillRect(p.x-w/2,p.y-52,w,22);c.strokeRect(p.x-w/2,p.y-52,w,22);c.fillStyle='#3e472d';c.fillText(label,p.x,p.y-41);c.restore();
    }
    canvas.dataset.waterSources=String(this.waterAccess?.sources.length??0);
    const selectedRoute=this.document.start.routes?.find(r=>r.id===view.selectedRoute);
    if(selectedRoute&&routeVisible(selectedRoute,view))for(const [x,y]of selectedRoute.cells)this.polygon(footprintCorners('road',x,y),'#efc86d55','#ffe39a');
    if(this.utilityPreview){c.save();c.lineJoin='round';c.lineCap='round';paintUtilityRoute(c,this.project,this.scale,this.utilityPreview,this.utilityPreview.allowed===false?'#c65e42':'#fff3a4',true,{pump:this.utilityPreview.kind!=='electricity'});c.restore();}
    for(const port of this.utilityPreview?.ports??[]){const p=this.project(...port.cell);c.beginPath();c.arc(p.x,p.y,5*this.scale,0,Math.PI*2);c.fillStyle=port.supply?'#f3ca70':'#8bd1e4';c.fill();c.strokeStyle='#3a4b38';c.lineWidth=1;c.stroke();}
    if(this.routeStroke)for(const [x,y]of this.routeStroke)this.polygon(footprintCorners('road',x,y),'#f4df9a66','#fff3c4');
    for(const [label,point,colour]of (this.preview?[]:[['Camp',this.document.map.camp,'#476c44'],['Start view',this.document.map.camera,'#8f603c']])){
      const p=this.project(...point),same=this.document.map.camp.every((n,i)=>n===this.document.map.camera[i]);c.strokeStyle=colour;c.fillStyle='#f5e5ba';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,7,0,Math.PI*2);c.fill();c.stroke();c.font='bold 11px Trebuchet MS';c.textAlign='center';c.fillStyle=colour;c.fillText(label,p.x,p.y+(same&&label==='Camp'?-15:22));
    }
    if(this.pointer&&allBuildingArt[view.tool]){
      this.polygon(footprintCorners(view.tool,this.pointer.x,this.pointer.y),this.groupPlacement?.allowed===false?'#c65e4266':'#f4df9a66',this.groupPlacement?.allowed===false?'#f39b80':'#fff3c4');
      paintWorldBuilding(c,{key:view.tool,x:this.pointer.x,y:this.pointer.y,alpha:.45},{project:this.project,scale:this.scale,images:art.images});
    }
    if(this.pointer&&(this.drag?.bank||['battery-bank','move-bank','copy-bank'].includes(view.tool))){this.polygon(footprintCorners('battery',this.pointer.x,this.pointer.y),groupFill,groupStroke);drawBattery(c,this.project(this.pointer.x,this.pointer.y),this.scale,0,.45);}
    if(this.drag?.site&&this.pointer)this.polygon(footprintCorners(sourceKinds[catalogMaterial(this.drag.site.material)],this.pointer.x,this.pointer.y),groupFill,groupStroke);
    if(this.drag?.building&&this.pointer){const anchor=this.drag.building;for(const b of structures.filter(b=>selectedBuildings.has(b.id)))this.polygon(footprintCorners(b.kind,b.x+this.pointer.x-anchor.x,b.y+this.pointer.y-anchor.y),groupFill,groupStroke);}
    if(view.tool==='duplicate'&&this.copy&&this.pointer){const anchor=this.copy.buildings[0];for(const b of this.copy.buildings){const x=b.x+this.pointer.x-anchor.x,y=b.y+this.pointer.y-anchor.y;this.polygon(footprintCorners(b.kind,x,y),groupFill,groupStroke);paintWorldBuilding(c,{key:keyFor(b),x,y,alpha:.45,emptyAnimals:b.state!=='completed'||b.animals?.stocked===false},{project:this.project,scale:this.scale,images:art.images});const crop=this.copy.cropViews?.[b.id];if(b.state==='completed'&&crop)paintWorldCrops(c,{kind:b.kind,x,y,crop},{project:this.project,scale:this.scale,alpha:.45});}}
    if(this.pointer&&this.groupPlacement?.allowed){c.save();c.lineJoin='round';c.lineCap='round';for(const plan of this.groupPlacement.routes??[])paintUtilityRoute(c,this.project,this.scale,plan,'#fff3a4',true,{pump:plan.kind!=='electricity'});c.restore();}
    if(this.drag?.toggle&&this.drag.moved&&view.tool==='select'&&this.pointer){
      const end=this.project(this.pointer.x,this.pointer.y),start=this.drag.point;c.fillStyle='#f4df9a33';c.strokeStyle='#fff3c4';c.lineWidth=2;c.fillRect(start.x,start.y,end.x-start.x,end.y-start.y);c.strokeRect(start.x,start.y,end.x-start.x,end.y-start.y);
    }
    const chosenNature=this.naturalObjects?.find(p=>p.id===view.selectedNature);
    if(chosenNature&&!this.preview){
      const p=this.project(chosenNature.x,chosenNature.y),name=this.natureCatalog.find(s=>s.key===chosenNature.species)?.name??'Natural object';
      c.save();c.lineWidth=4;c.strokeStyle='#344b35';c.beginPath();c.ellipse(p.x,p.y,13,7,0,0,Math.PI*2);c.stroke();c.lineWidth=2;c.strokeStyle='#fff3c4';c.stroke();
      const entry=this.natureCatalog.find(s=>s.key===chosenNature.species),bounds=entry?worldTreeBounds({...chosenNature,species:entry.art_index},{project:this.project,scale:this.scale}):null,top=Math.max(4,(bounds?.top??p.y)-30);
      c.font='bold 12px Trebuchet MS';c.textAlign='center';const label=name+' · '+Number(chosenNature.x.toFixed(1))+', '+Number(chosenNature.y.toFixed(1)),w=c.measureText(label).width+14,x=Math.max(w/2+4,Math.min(width-w/2-4,p.x));
      c.fillStyle='#f5e5ba';c.fillRect(x-w/2,top,w,23);c.strokeStyle='#665134';c.lineWidth=1;c.strokeRect(x-w/2,top,w,23);c.fillStyle='#344b35';c.fillText(label,x,top+16);c.restore();
    }
    if(this.pointer&&(this.drag?.nature||['move-nature','copy-nature'].includes(view.tool))){const source=view.tool==='copy-nature'?this.natureCopy:(this.drag?.nature??chosenNature),entry=this.natureCatalog?.find(s=>s.key===source?.species);if(entry){this.polygon(footprintCorners('road',this.pointer.x,this.pointer.y),this.groupPlacement?.allowed===false?'#b94f4f66':'#f4df9a66',this.groupPlacement?.allowed===false?'#ffb3a3':'#fff3c4');c.save();c.globalAlpha=.5;paintWorldTree(c,{x:this.pointer.x,y:this.pointer.y,size:source.size,species:entry.art_index},{project:this.project,scale:this.scale,width,height,forest:art.forest,details:art.details});c.restore();}}
    if(this.pointer&&view.tool==='nature'&&this.natureSpecies){c.save();c.globalAlpha=.5;paintWorldTree(c,{x:this.pointer.x,y:this.pointer.y,size:this.natureSize||1,species:this.natureSpecies.art_index},{project:this.project,scale:this.scale,width,height,forest:art.forest,details:art.details});c.restore();}
    if(this.terrainLoading||this.terrainError){c.save();c.font='bold 13px Trebuchet MS';c.textAlign='left';const message=this.terrainError??'Updating landscape… You can keep editing.',noticeWidth=Math.min(width-24,c.measureText(message).width+20);c.fillStyle='#f5e5ba';c.fillRect(12,52,noticeWidth,32);c.fillStyle='#4f3920';c.fillText(message,22,73,noticeWidth-20);c.restore();}
    this.onRender?.();
    canvas.style.cursor=view.tool==='select'?'grab':view.tool==='pan'?'grab':'crosshair';
  }
}
