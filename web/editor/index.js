import {sceneLayers,sceneFilter,sceneSummary,sceneRouteAt} from './scene-layers.js';
import {Workspaces,workspaceNames,revealWorkspaceSection} from './workspaces.js';
import {validatePublication} from './validate-publication.js';
import {prepareRelease} from './prepare-release.js';
import {prepareCreationExport} from './prepare-export.js';
import {prepareScenario} from './prepare-scenario.js';
import {landPreviewKey} from './land-preview-key.js';
import {projectPlaces} from './outlook-projects.js';
import {ScenarioOutlook} from './outlook.js';
import {MAX_RECOVERY_FILE_BYTES} from '../recovery-limits.js';
import {recoveredPackage} from './package-recovery.js';
import {downloadStoredPackage} from './stored-package-export.js';
import {missingLibraryEntry,downloadMissingEntryDetails} from './missing-library-entry.js';
import {exampleScenarios,loadExampleScenario} from './example-scenarios.js';
import {hydrateLibraryPreviews} from './library-previews.js';
import {chooseRecoveryCheckpoint} from './recovery-dialog.js';
import {draftImportIssue} from './draft-import.js';
import {downloadRecoveryRecord} from './record-recovery.js';
import {MAP_FORMAT,validateMapPackage} from '../map-package.js';
import {MapSharingControls} from './map-sharing-controls.js';
import {creationThumbnail} from './thumbnail.js';
import {installLibraryDiscovery} from './library-discovery.js';
import {RELEASE_FORMAT} from '../release-package.js';
import {canonical} from './journal.js';
import {ensureStart} from './arrival.js';
import {startingRecoveryFields} from './recovery.js';
import {renderOpeningSetup} from './setup.js';
import {EquipmentEditor} from './equipment.js';
import {RoutesEditor,routeNames,dependentRoutes} from './routes.js';
import {hitStartingBank,newStartingBank,bankFields,buildingBatteryFields} from './batteries.js';
import {startingAnimalFields,setStartingAnimalField} from './animals.js';
import {sourceKinds,siteNames,newStartingSite,siteFields,setSiteField,hitStartingSite} from './sites.js';
import {startingOrchardFields,setStartingOrchardField} from './orchards.js';
import {startingCropFields,setStartingCropField} from './farming.js';
import {LiquidsEditor} from './liquids.js';
import {SuppliesEditor} from './supplies.js';
import {RegionsEditor} from './regions.js';
import {JournalEditor} from './scenario-journal.js';
import {ResidentPresetLibrary} from './resident-presets.js';
import {RelationshipsEditor} from './relationships.js';
import {ResidentsEditor} from './residents.js';
import {BiomeEditor} from './biome-editor.js';
import {WeatherEditor} from './weather.js';
import {freezeCreation,MAX_CREATION_BYTES} from './files.js';
import {resolvedNature,plantStroke,thinStroke} from './nature.js';
import {riverBank} from '../terrain.js';
import {GeologyEditor} from './geology.js';
import {EditorMinimap} from './minimap.js';
import {landLayers,landTiles} from '../land-layers.js';
import {planBuildingCopy,moveBuildings,placeBuildingCopy} from './objects.js';
import {clearingStroke,riverStroke} from './brush.js';
import init,{Game} from '../pkg/solar_friends.js';
import {ContentLibrary,LibraryConflict} from '../content-library.js';
import {EditorDocument} from './document.js';
import {EditorMap,loadEditorArt} from './map-view.js';
import {allBuildingArt} from '../building-art.js?v=night-1';
import {paintIcon} from '../build-menu.js';

const $=id=>document.getElementById(id),library=new ContentLibrary();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value),title=kind=>allBuildingArt[kind]?.name||kind;
const ruleNames={logistics:'Materials, hauling and resident work',land:'Living soil and finite land resources',utilities:'Connected local water and power',climate:'Seasonal weather',maintenance:'Equipment condition and repairs',learning:'Learning through useful work',market:'Changing town prices and offers'};
let newBiome="mata-atlantica";
let libraryDiscovery,mapSharing,workspaces;
let current,map,engine,catalog,art,saveTimer,toastTimer,pendingDelete,busy=false;
const waterLayers={water:{legend:'Owned fresh water · green: open, stocked and reachable; gold: empty; red: closed or unreachable. Labels show unclaimed units and friends with a route. Neighbour service and future deliveries are excluded.'},walkability:{legend:"Green · connected to camp. Gold · clear but disconnected. Red · blocked cell centre. Footprints and riverbanks use native walking rules; this does not reserve space from other residents."},banks:{legend:"Blue · native protected banks. Keep ordinary buildings and paths inland."},hydro:{legend:"Gold · native river segments aligned with the generator artwork. Buildings, worker access and free space are checked when placing."}};
let minimap,equipmentEditor,routesEditor,liquidsEditor,suppliesEditor,regionsEditor,journalEditor,relationshipsEditor,residentsEditor,biomeEditor,weatherEditor,geologyEditor,geometry=null,terrainBase=null,inspectorSelection='';
let expandedReview=false,outlook;
let landReport=null,landReportKey=null,mapPreviewKey=null,landSampleKey='',hoverCell=null;
let accessReport=null,accessReportKey=null,waterAccessReport=null,waterAccessKey=null;
let releasePublication=null,preparedEdit=null,engineDefinition=null;
let saving=Promise.resolve(),report={ok:false,issues:[]};
const recoveryKey=id=>`solar-friends-project-recovery:${id}`;
function toast(text){$('creator-toast').textContent=text;$('creator-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('creator-toast').hidden=true,6000);}
function status(text){$('creator-save-status').textContent=text;}
function stepHistory(redo=false){if(!current)return false;if(map?.cancelGesture())return true;return redo?current.doc.redo():current.doc.undo();}
async function download(definition){
  const file=await prepareCreationExport(definition,report.ok?{terrain:terrainBase,snapshot:map.snapshot,catalog}:null);
  const url=URL.createObjectURL(new Blob([file],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=(definition.title||'our-village').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.solar-scenario';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cacheRecovery(ctx,checkpoint,view){try{const raw=JSON.stringify({storageRevision:ctx.storageRevision,checkpoint,view});sessionStorage.setItem(recoveryKey(ctx.id),raw);return raw;}catch{/* The durable library remains the primary save. */return null;}}
function scheduleSave(){clearTimeout(saveTimer);if(!current?.conflicted)saveTimer=setTimeout(()=>{save().catch(()=>{});},450);}
function previewOf(definition,snapshot){try{return creationThumbnail(definition,snapshot,art);}catch{return null;}}
function previewMarkup(kind,id){return `<span class="creator-preview" data-preview-kind="${kind}" data-preview-id="${escape(id)}"><span>No preview yet</span></span>`;}
function save(){
  clearTimeout(saveTimer);
  if(!current)return Promise.resolve();
  const ctx=current,view=map.state,snapshot=map.snapshot,terrainLoading=map.terrainLoading,valid=report.ok;
  const requestKey=JSON.stringify([ctx.doc.revision,view,ctx.artRevision??0,terrainLoading]);
  const pending=ctx.pendingSaves??=new Map();
  if(pending.has(requestKey))return pending.get(requestKey);
  const preparation=ctx.doc.checkpointAsync();
  // Observe preparation failures even while an earlier durable save is queued.
  preparation.catch(()=>{});
  if(current===ctx)status('Saving…');
  const operation=saving.catch(()=>{}).then(async()=>{
    const checkpoint=await preparation;
    if(ctx.thumbnailRevision!==checkpoint.revision){
      // Snapshot and terrain readiness belong to the captured revision. Edits
      // made while preparation yields must not paint a newer world into it.
      if(terrainLoading){ctx.thumbnail=undefined;ctx.thumbnailRevision=null;}
      else{ctx.thumbnail=valid?previewOf(checkpoint.definition,snapshot):null;ctx.thumbnailRevision=checkpoint.revision;}
    }
    const thumbnail=ctx.thumbnail,recoveryBytes=cacheRecovery(ctx,checkpoint,view);
    if(ctx.conflicted)throw new LibraryConflict();
    const record=await library.savePreparedProject({id:ctx.id,checkpoint,view,attribution:ctx.record?.attribution,thumbnail},ctx.storageRevision);
    ctx.storageRevision=record.revision;ctx.record=record;ctx.doc.markSaved(checkpoint);
    try{
      const key=recoveryKey(ctx.id),raw=sessionStorage.getItem(key);
      // The common case is the exact recovery copy written by this save.
      // Comparing bytes avoids parsing a multi-megabyte history a second time.
      if(recoveryBytes!==null&&raw===recoveryBytes)sessionStorage.removeItem(key);
      else{
        const cached=JSON.parse(raw||'null');
        if(cached?.checkpoint.revision===checkpoint.revision&&JSON.stringify(cached.view)===JSON.stringify(view))sessionStorage.removeItem(key);
        else if(cached)sessionStorage.setItem(key,JSON.stringify({...cached,storageRevision:record.revision}));
      }
    }catch{/* The completed IndexedDB transaction owns the saved record. */}
    if(current===ctx){ctx.viewDirty=JSON.stringify(map.state)!==JSON.stringify(view);status(ctx.doc.dirty||ctx.viewDirty?'New changes to save':'Saved on this device');}
    return record;
  });
  saving=operation;
  const handled=operation.catch(error=>{
    if(error instanceof LibraryConflict)ctx.conflicted=true;
    if(current===ctx){status(ctx.conflicted?'Changed in another tab · save a copy':'Could not save · export a copy');toast(error.message);}
    throw error;
  }).finally(()=>{if(pending.get(requestKey)===handled)pending.delete(requestKey);});
  pending.set(requestKey,handled);return handled;
}
function change(label,edit,{valid=false}={}){
  if(!current||busy)return false;
  let previous,compiled=false,committed=false;
  try{
    if(valid){
      const draft=current.doc.value;previous=engineDefinition;edit(draft);
      const result=JSON.parse(engine.load_scenario(JSON.stringify(draft)));
      if(!result.ok){toast(result.issues.find(i=>i.severity==='error')?.message||'Choose a clear plot.');return false;}
      compiled=true;
      // Document notifications are synchronous. Refresh consumes this candidate
      // only when the committed definition exactly matches the validated edit.
      preparedEdit={key:canonical(draft),report:result};
    }
    committed=current.doc.transact(label,edit);return committed;
  }catch(error){toast(error.message);return false;}
  finally{preparedEdit=null;if(compiled&&!committed&&previous)engine.load_scenario(previous);}
}
function field(id,value){if(document.activeElement!==$(id))$(id).value=value;}
function refresh(){
  if(!current)return;
  const d=current.doc.value;
  if(preparedEdit&&preparedEdit.key===canonical(d)){
    report=preparedEdit.report;preparedEdit=null;
  }else report=JSON.parse(engine.load_scenario(JSON.stringify(d)));
  if(report.ok){engineDefinition=JSON.stringify(d);report.roles=JSON.parse(engine.scenario_journal())?.roles??[];}
  const snapshot=JSON.parse(engine.report_state());
  const nextMapKey=landPreviewKey(d),nextLandKey=report.ok?nextMapKey:null;
  const landChanged=!landReport||(report.ok&&nextLandKey!==landReportKey);
  if(landChanged){
    terrainBase=JSON.parse(engine.terrain_template());
    landReport=JSON.parse(engine.land_report());geometry=JSON.parse(engine.world_geometry());
    landReportKey=nextLandKey;
  }
  landSampleKey='';
  map.landOverlay=overlayTiles();
  map.set(d,snapshot,undefined,{paint:!report.ok||nextMapKey!==mapPreviewKey});mapPreviewKey=nextMapKey;
  minimap.set(landReport,geometry);
  geologyEditor.render(d,landReport);
  weatherEditor.render(d);
  liquidsEditor.render(d,report);
  routesEditor.render(d,report);
  equipmentEditor.render(d);
  regionsEditor.render(d);
  journalEditor.render(d,report);
  residentsEditor.render(d,report);
  relationshipsEditor.render(d);
  biomeEditor.render(d);
  minimap.canvas.title=report.ok?'Native land overview':'Last valid land preview · resolve draft issues before testing';
  renderSceneFilter();$('creator-land-legend').textContent=overlayLegend();
  inspectGround(hoverCell);
  $('creator-biome-name').textContent='64 × 64 cells · '+(catalog.biomes.find(b=>b.id===d.map.biome?.id)?.name||'Mata Atlântica');
  $('creator-river-enabled').checked=d.map.river!==null;
  $('creator-water').readOnly=Array.isArray(d.start.liquids);$('creator-water').title=d.start.liquids?'Edit the fresh-water allocations in Starting liquids.':'';
  field('creator-title',d.title);field('creator-description',d.description);field('creator-seed',d.map.seed);field('creator-funds',d.start.funds/100);field('creator-water',d.start.fresh_water);
  $('creator-undo').disabled=!current.doc.canUndo;$('creator-redo').disabled=!current.doc.canRedo;$('creator-test').disabled=!report.ok||busy;$('creator-release').disabled=!report.ok||busy;$('creator-save-map').disabled=busy;
  $('creator-undo').title=current.doc.undoLabel;$('creator-redo').title=current.doc.redoLabel;
  for(const [key,label]of Object.entries(ruleNames)){$('creator-rule-'+key).checked=d.rules[key];$('creator-rule-'+key).setAttribute('aria-label',label);}
  renderSelection();renderSupplies();renderReview();outlook?.observe();
  if(current.doc.dirty)status('Changes to save');
}
function overlayTiles(){
  if(!geometry)return [];
  const layer=map.view.layer;
  map.waterAccess=null;
  if(layer==='water'){
    if(!waterAccessReport||waterAccessKey!==engineDefinition){waterAccessReport=JSON.parse(engine.fresh_water_overlay());waterAccessKey=engineDefinition;}
    map.waterAccess=waterAccessReport;
    return waterAccessReport.sources.map(p=>({x:p.x,y:p.y,fill:!p.open||!p.reachable_by.length?'#b7564a88':p.available>0?'#528a5d88':'#d4a54888',stroke:'#fff0ad'}));
  }
  if(layer==='walkability'){
    if(!accessReport||accessReportKey!==landReportKey){accessReport=JSON.parse(engine.navigation_overlay());accessReportKey=landReportKey;}
    return accessReport.cells.map(p=>({x:p.x,y:p.y,fill:!p.walkable?'#b7564a66':p.reachable?'#528a5d66':'#d4a54888',stroke:null}));
  }
  if(layer==='banks'||layer==='hydro')return (layer==='banks'?geometry.banks:geometry.hydro_sites).map(([x,y])=>({x,y,fill:layer==='banks'?'#497fbd88':'#e8ba55bb',stroke:layer==='banks'?'#aecfe0':'#fff0ad'}));
  if(Object.hasOwn(sceneLayers,layer))return [];
  return landTiles(landReport,layer);
}
function overlayLegend(){const message=(sceneLayers[map.view.layer]||waterLayers[map.view.layer]||landLayers[map.view.layer])?.legend||'Point at a cell to inspect the land.';const water=map.view.layer==='water'&&waterAccessReport?` ${waterAccessReport.available.toFixed(1)} reachable fresh-water units · ${waterAccessReport.accessible?'everyone checked has access':'some friends lack usable water'}.${waterAccessReport.enabled?'':' Connected local water rules are disabled.'}${waterAccessReport.camp_fallback?' Everyone is away; checking from camp.':''}`:'';return (report.ok?'':'Draft incomplete · last valid land preview. ')+message+water+(Object.hasOwn(sceneLayers,map.view.layer)?' '+sceneSummary(current.doc.value,map.snapshot,map.view):'');}
function renderSceneFilter(){
 const filter=sceneFilter(current.doc.value,map.view),host=$('creator-overlay-filter-field');host.hidden=!filter;if(!filter)return;
 $('creator-overlay-filter-label').textContent=filter.label;const select=$('creator-overlay-filter');select.innerHTML=filter.options.map(([key,label])=>`<option value="${escape(key)}">${escape(label)}</option>`).join('');select.value=filter.value;
}
function inspectGround(point){
  hoverCell=point;if(!current||!point)return;
  const key=[current.doc.revision,point.x,point.y,map.view.tool,map.view.layer].join(':');if(key===landSampleKey)return;landSampleKey=key;
  const sample=JSON.parse(engine.land_preview(allBuildingArt[map.view.tool]||sourceKinds.includes(map.view.tool)?map.view.tool:'road',point.x,point.y)),g=sample.ground;
  $('creator-cell').textContent=`Cell ${point.x}, ${point.y}`;
  if(!g){$('creator-ground-detail').textContent='This footprint crosses a protected riverbank or map edge. Choose an inland plot.';return;}
  const deposits=landReport.deposits.filter(d=>point.x>=d.x&&point.x<d.x+d.width&&point.y>=d.y&&point.y<d.y+d.height);
  $('creator-ground-detail').innerHTML=`<p><b>${escape(g.biome)}</b><br>${escape(g.geology)}</p><dl><dt>Inspected footprint</dt><dd>${sample.cells} ${sample.cells===1?'cell':'cells'}</dd><dt>Fertility</dt><dd>${Math.round(g.fertility*100)}%</dd><dt>Water retention</dt><dd>×${g.retention.toFixed(2)}</dd><dt>Moisture</dt><dd>${Math.round(g.moisture*100)}%</dd><dt>Tree shade</dt><dd>${Math.round(g.shade*100)}%</dd><dt>Solar exposure</dt><dd>${Math.round(sample.solar_exposure*100)}%</dd><dt>Crop growth</dt><dd>×${sample.growth_multiplier.toFixed(2)}</dd><dt>Disturbance</dt><dd>${Math.round(g.disturbance*100)}%</dd></dl>${deposits.map(d=>`<p>${escape(catalog.materials[d.material])}: ${d.remaining} remaining of ${d.maximum}</p>`).join('')}${map.view.layer==='walkability'&&accessReport?`<p><b>Walking access:</b> ${accessReport.cells[point.y*64+point.x]?.walkable?(accessReport.cells[point.y*64+point.x]?.reachable?'Connected to the arrival camp.':'Clear cell centre, but no route from camp.'):'Blocked cell centre.'}</p>`:''}${report.ok?'':'<p>Draft has unresolved issues. Ground preview uses the last valid setup.</p>'}`;
}
function renderSelection(){
  if(!current)return;
  workspaces?.context(map.selection().length||map.view.selectedResident||map.view.selectedRoute||map.view.selectedBank||map.view.selectedSite);
  const d=current.doc.value,b=d.start.buildings.find(b=>b.id===map.view.selected),panel=$('creator-selection');
  const person=(d.start.residents??catalog.resident_presets).find(p=>p.id===map.view.selectedResident);
  if(person){panel.innerHTML=`<h2>${escape(person.name)}</h2><p>Starting circumstances belong to this scenario. Needs and routines govern their actions when playing.</p><button data-edit-start>Edit arrival</button>`;return;}
  const route=d.start.routes?.find(r=>r.id===map.view.selectedRoute);
  if(route){panel.innerHTML=`<h2>${escape(routeNames[route.kind])}</h2><p>${route.cells.length} corridor cells · ${route.state==='completed'?'Installed kit':'Parts and resident work needed'}</p><button data-route-inspect>Edit connection</button>`;return;}
  const bank=d.start.batteries?.find(p=>p.id===map.view.selectedBank);
  if(bank){const focus=document.activeElement?.dataset.startBank;panel.innerHTML=bankFields(bank,catalog.batteries);if(focus)[...panel.querySelectorAll('[data-start-bank]')].find(e=>e.dataset.startBank===focus)?.focus({preventScroll:true});return;}
  const site=d.start.resource_sites?.find(s=>s.id===map.view.selectedSite);
  if(site){const focus=document.activeElement?.dataset.startSite;panel.innerHTML=siteFields(site,catalog.resource_sites);if(focus)[...panel.querySelectorAll('[data-start-site]')].find(e=>e.dataset.startSite===focus)?.focus({preventScroll:true});return;}
  if(!b){panel.innerHTML='<h2>Our property</h2><p>Select a building, battery bank or material plot to inspect it. Choose Move to carry it to another cell.</p>';return;}
  if(map.selection().length>1){panel.innerHTML=`<h2>${map.selection().length} buildings</h2><p>Move this group together, or place a copy with its starting supplies. Shift-click toggles buildings in the group.</p><div class="creator-selection-actions"><button data-selection-action="move">Move group</button><button data-selection-action="duplicate">Copy group</button><button data-selection-action="remove">Remove group</button></div>`;return;}
  const cropFocus=document.activeElement?.dataset.startCrop,orchardFocus=document.activeElement?.dataset.startOrchard,animalFocus=document.activeElement?.dataset.startAnimal,recoveryFocus=document.activeElement?.matches('[data-start-recovery]'),bankFocus=document.activeElement?.dataset.buildingBank;
  const entry=catalog.buildings.find(e=>e.id===b.kind),appearances=(entry?.appearances||[]).filter(key=>key.startsWith('adobe-')===(b.recipe==='adobe'));
  panel.innerHTML=`<h2>${escape(title(b.kind))}</h2><div class="creator-coordinates"><div class="creator-field"><label for="creator-object-x">Column</label><input id="creator-object-x" type="number" min="1" max="62" step="1" value="${b.x}"></div><div class="creator-field"><label for="creator-object-y">Row</label><input id="creator-object-y" type="number" min="1" max="62" step="1" value="${b.y}"></div></div><div class="creator-field"><label for="creator-object-state">Starts as</label><select id="creator-object-state"><option value="completed" ${b.state==='completed'?'selected':''}>Completed building</option><option value="blueprint" ${b.state==='blueprint'?'selected':''}>Construction project</option></select></div><div class="creator-field"><label for="creator-object-recipe">Construction materials</label><select id="creator-object-recipe">${(entry?.recipes||[]).map(key=>`<option value="${key}" ${b.recipe===key?'selected':''}>${{standard:'Prepared materials',local:'Local materials',adobe:'Adobe and bamboo'}[key]}</option>`).join('')}</select></div>${appearances.length?`<div class="creator-field"><label for="creator-object-appearance">Appearance</label><select id="creator-object-appearance">${appearances.map(key=>`<option value="${key}" ${(b.appearance||'home')===key?'selected':''}>${escape(title(key))}</option>`).join('')}</select></div>`:''}${startingCropFields(b,catalog.farming)}${startingOrchardFields(b,catalog.orchards)}${startingAnimalFields(b,catalog.animals)}${buildingBatteryFields(b,catalog.batteries)}${startingRecoveryFields(b,entry)}<div class="creator-selection-actions"><button data-selection-action="move">Move on map</button><button data-selection-action="duplicate">Duplicate</button><button data-selection-action="remove">Remove</button></div>`;
  if(recoveryFocus)panel.querySelector('[data-start-recovery]')?.focus({preventScroll:true});
  if(bankFocus)[...panel.querySelectorAll('[data-building-bank]')].find(e=>e.dataset.buildingBank===bankFocus)?.focus({preventScroll:true});
  if(animalFocus)[...panel.querySelectorAll('[data-start-animal]')].find(input=>input.dataset.startAnimal===animalFocus)?.focus({preventScroll:true});
  if(orchardFocus)[...panel.querySelectorAll('[data-start-orchard]')].find(input=>input.dataset.startOrchard===orchardFocus)?.focus({preventScroll:true});
  if(cropFocus)[...panel.querySelectorAll('[data-start-crop]')].find(input=>input.dataset.startCrop===cropFocus)?.focus({preventScroll:true});
}
function renderSupplies(){suppliesEditor.render(current.doc.value,report);}
function renderReview(){
  workspaces?.review(report);
  renderOpeningSetup($('creator-opening-setup'),engine,report.ok);
  $('creator-review-title').textContent=report.ok?'Ready to test':'Before we can begin';
  $('creator-issues').innerHTML=report.issues.length?report.issues.slice(0,expandedReview?report.issues.length:40).map((i,n)=>`<div class="creator-issue" data-severity="${i.severity}"><p>${escape(i.message)}</p>${i.at||i.entity?`<button data-issue="${n}">Show on map</button>`:''}${i.path==='journal'||i.path.startsWith('journal.')?`<button data-issue-journal="${n}">${/^journal\.(events|roles|locked_buildings)(\.|$)/.test(i.path)?'Open events & roles':'Open journal'}</button>`:''}${i.path.startsWith('start.inventories')?'<button data-issue-supplies>Review supply locations</button>':i.path.startsWith('start.liquids')||i.path==='start.fresh_water'?'<button data-issue-liquids>Review starting liquids</button>':''}</div>`).join('')+(report.issues.length>40&&!expandedReview?`<button data-issue-more>Show all ${report.issues.length} review notes</button>`:''):'<p>Our starting setup is ready. Test it to see how village life unfolds.</p>';
}
function setTool(tool){
  const workspace=['road','route-path','battery-bank','move-bank','copy-bank','move-site','copy-site','duplicate',...sourceKinds].includes(tool)||allBuildingArt[tool]?'village':['habitat','nature','thin-nature','river','meadow','camp','camera'].includes(tool)?'land':tool==='region'?'story':tool==='resident-start'?'people':null;
  if(workspace)workspaces?.select(workspace);
  map.setTool(tool);landSampleKey='';inspectGround(hoverCell);
  const sourceMaterial=sourceKinds.indexOf(tool);if(sourceMaterial>=2){$('creator-land-layer').value=catalog.resource_sites.materials[sourceMaterial];$('creator-land-layer').dispatchEvent(new Event('change'));}
  if(tool==='habitat'){revealWorkspaceSection($('creator-ground'));$('creator-ground').open=true;$('creator-ground').scrollIntoView({block:'nearest'});}
  for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));
  $('creator-hint').textContent=tool==='route-path'?'Drag from a supply port to a destination port · each stroke replaces the proposed corridor · Esc cancels':['battery-bank','move-bank','copy-bank'].includes(tool)?'Click a clear inland cell for the battery bank · Esc cancels':sourceKinds.includes(tool)?`Place ${siteNames[sourceKinds.indexOf(tool)].toLowerCase()} · click a cell · Esc to select`:['move-site','copy-site'].includes(tool)?'Click a cell to place this material plot · Esc cancels':allBuildingArt[tool]?`Place ${title(tool).toLowerCase()} · click a cell · Esc to select`:({'resident-start':'Choose clear ground with space from other residents · click to place · Esc cancels',select:'Select · Shift-click or Shift-drag to add buildings · drag to pan · Delete removes the group',pan:'Drag to move around the property',move:'Drag a building group, battery bank or material plot to move it',duplicate:'Click a cell to place the copied group and its starting supplies · Esc cancels',road:'Drag to paint one path · the whole stroke can be undone',habitat:'Drag to paint habitat and baseline soil · existing plants stay in place · one undo step',nature:'Drag to plant a spaced cluster · brush width controls its area · one undo step','thin-nature':'Drag to remove natural objects · no materials are granted · one undo step',river:'Drag to shape the channel · steep bends cannot host hydro · one undo step',meadow:'Drag to clear vegetation · soil disturbance stays low · one undo step',erase:'Click a building, battery bank, material plot, connection or road to remove it',camp:'Click to move the arrival camp',camera:'Click to choose the starting camera view'})[tool];
}
function removeBuilding(id){
  const ids=map.selection().includes(id)?map.selection():[id];
  change(ids.length>1?'Remove building group':'Remove building',d=>{d.start.buildings=d.start.buildings.filter(b=>!ids.includes(b.id));});
  map.select(null);
  if(current.doc.value.start.liquids?.some(p=>ids.includes(p.owner.building))){revealWorkspaceSection($('creator-liquids'));$('creator-liquids').open=true;toast('Starting liquids still reference removed containers. Choose compatible storage before testing.');}
  if(current.doc.value.start.inventories.some(p=>ids.includes(p.owner.building))){revealWorkspaceSection($('creator-supplies'));$('creator-supplies').open=true;toast('Starting supplies still reference removed buildings. Choose new supply locations before testing.');}
}
function mapAction(action){
  if(!current||busy)return;
  if(action.type==='resident-start'){const id=action.resident??map.placingResident;if(!id)return;if(change('Choose resident starting place',d=>{ensureStart(d,id).position=[action.x,action.y];},{valid:true})){map.placingResident=null;setTool('select');map.selectResident(id);residentsEditor.openArrival(id);}return;}
  if(action.type==='route-path'){routesEditor.stroke(action.cells);return;}
  if(action.type==='battery-bank'){
    const bank=newStartingBank(action.x,action.y);if(change('Place battery bank',d=>{(d.start.batteries??=[]).push(bank);},{valid:true}))map.selectBank(bank.id);
  }else if(['move-bank','copy-bank'].includes(action.type)){
    const original=action.type==='copy-bank'?map.bankCopy:current.doc.value.start.batteries?.find(b=>b.id===map.view.selectedBank);if(!original)return;
    const bank={...clone(original),x:action.x,y:action.y};if(action.type==='copy-bank')bank.id=crypto.randomUUID();
    if(change(action.type==='copy-bank'?'Copy battery bank':'Move battery bank',d=>{if(action.type==='copy-bank')(d.start.batteries??=[]).push(bank);else Object.assign(d.start.batteries.find(b=>b.id===bank.id),bank);},{valid:true})){map.bankCopy=null;setTool('select');map.selectBank(bank.id);}
  }else if(sourceKinds.includes(action.type)){
    const material=catalog.resource_sites.materials[sourceKinds.indexOf(action.type)],site=newStartingSite(material,action.x,action.y);
    if(change('Place '+siteNames[sourceKinds.indexOf(action.type)],d=>{(d.start.resource_sites??=[]).push(site);},{valid:true}))map.selectSite(site.id);
  }
  else if(['move-site','copy-site'].includes(action.type)){
    const source=action.type==='copy-site'?map.siteCopy:current.doc.value.start.resource_sites?.find(s=>s.id===map.view.selectedSite);if(!source)return;
    const site=clone(source);site.x=action.x;site.y=action.y;if(action.type==='copy-site')site.id=crypto.randomUUID();
    if(change(action.type==='copy-site'?'Copy material plot':'Move material plot',d=>{if(action.type==='copy-site')(d.start.resource_sites??=[]).push(site);else Object.assign(d.start.resource_sites.find(s=>s.id===site.id),site);},{valid:true})){setTool('select');map.selectSite(site.id);map.siteCopy=null;}
  }
  else if(action.type==='region'){if((current.doc.value.map.regions?.length??0)>=catalog.max_regions){toast('Use up to 32 named regions.');return;}change('Draw named region',d=>{(d.map.regions??=[]).push({id:'region-'+crypto.randomUUID(),title:'New region',...action.rectangle});});revealWorkspaceSection($('creator-regions'));$('creator-regions').open=true;}
  else if(action.type==='road')change('Paint a road',d=>{const cells=new Map(d.start.roads.map(p=>[p.join(','),p]));for(const cell of action.cells)cells.set(cell.join(','),cell);d.start.roads=[...cells.values()];},{valid:true});
  else if(action.type==='habitat'){
    const preset=catalog.habitats.find(h=>h.key===$('creator-habitat').value),start=Math.floor(action.size/2);
    change('Paint habitat and soil',d=>{d.map.terrain=Array.from({length:4096},(_,i)=>d.map.terrain?.[i]||terrainBase[i]);for(const [x,y]of action.cells)for(let a=x-start;a<x-start+action.size;a++)for(let b=y-start;b<y-start+action.size;b++)if(a>=0&&a<64&&b>=0&&b<64&&!riverBank(a,b,d.map))d.map.terrain[b*64+a]={habitat:preset.key,fertility:preset.fertility,retention:preset.retention,cover:preset.cover};});
  }
  else if(action.type==='nature'){
    const definition=current.doc.value,existing=resolvedNature(definition,map.snapshot,catalog.nature),added=plantStroke(definition,existing,catalog.nature,map.natureSpecies.key,map.natureSize||1,action.cells,action.size);
    if(!added.length){toast('Choose inland ground with room between plants, away from buildings, roads and the arrival camp.');return;}
    change('Plant natural cluster',d=>{d.map.nature=[...existing,...added];});
  }
  else if(action.type==='thin-nature'){const objects=resolvedNature(current.doc.value,map.snapshot,catalog.nature);change('Thin natural vegetation',d=>{d.map.nature=thinStroke(objects,action.cells,action.size);});}
  else if(action.type==='river')change('Shape river course',d=>{d.map.river=riverStroke(d.map.river,action.cells);if(d.map.nature)d.map.nature=d.map.nature.filter(p=>!riverBank(Math.floor(p.x),Math.floor(p.y),d.map));});
  else if(action.type==='meadow')change('Clear a meadow',d=>{d.map.clearings=clearingStroke(d.map.clearings,action.cells,action.size);if(d.map.nature)d.map.nature=d.map.nature.filter(p=>!action.cells.some(([x,y])=>{const left=x-Math.floor(action.size/2)-.5,top=y-Math.floor(action.size/2)-.5;return p.x>=left&&p.x<left+action.size&&p.y>=top&&p.y<top+action.size;}));},{valid:true});
  else if(action.type==='move')change(action.ids.length>1?'Move building group':'Move building',d=>moveBuildings(d,action.ids,action.dx,action.dy),{valid:true});
  else if(action.type==='duplicate'&&map.copy){const copy=map.copy,anchor=copy.buildings[0];if(change('Copy building group',d=>placeBuildingCopy(d,copy,action.x-anchor.x,action.y-anchor.y),{valid:true})){setTool('select');map.select(null);for(const b of copy.buildings)map.select(b.id,true);map.copy=null;}}
  else if(action.type==='erase'){
    const bank=hitStartingBank(current.doc.value,action.x,action.y),site=hitStartingSite(current.doc.value,action.x,action.y),route=sceneRouteAt(current.doc.value,map.view,action.x,action.y);
    if(bank)change('Remove battery bank',d=>{d.start.batteries=d.start.batteries.filter(p=>p.id!==bank.id);});
    else if(site)change('Remove material plot',d=>{d.start.resource_sites=d.start.resource_sites.filter(s=>s.id!==site.id);});
    else if(action.id)removeBuilding(action.id);
    else if(route){const ids=dependentRoutes(current.doc.value,route.id);change('Remove utility connection',d=>{d.start.routes=d.start.routes.filter(r=>!ids.has(r.id));});}
    else change('Remove a road',d=>{d.start.roads=d.start.roads.filter(([x,y])=>x!==action.x||y!==action.y);});
  }else if(action.type==='camp')change('Move arrival camp',d=>{d.map.camp=[action.x,action.y];},{valid:true});
  else if(action.type==='camera')change('Choose starting view',d=>{d.map.camera=[action.x,action.y];},{valid:true});
  else if(allBuildingArt[action.type]){
    const id=crypto.randomUUID();
    if(change('Place '+title(action.type),d=>{d.start.buildings.push({id,kind:action.type,x:action.x,y:action.y,state:'completed',recipe:'standard',appearance:null});},{valid:true}))map.select(id);
  }
}
function attach(definition,{id,revision=null,checkpoint=null,view=null,record=null}={}){
  map.cancelGesture({paint:false});
  clearTimeout(saveTimer);expandedReview=false;
  const doc=checkpoint?EditorDocument.restore(checkpoint):new EditorDocument(definition);
  current={id:id||definition.id,doc,storageRevision:revision,record,viewDirty:false,conflicted:false};
  const ctx=current;
  doc.addEventListener('change',()=>{if(current===ctx){refresh();scheduleSave();}});
  map.view={center:clone(doc.value.map.camera),zoom:1.3,selected:null,selectedResident:null,selectedRoute:null,selectedBank:null,selectedSite:null,selection:[],tool:'select',grid:true,layer:'none',utilityKind:'all',regionId:'all',habitatPreset:'flower-meadow',workspace:'land'};
  if(view){
    const center=Array.isArray(view.center)&&view.center.length===2&&view.center.every(Number.isFinite)?view.center:map.view.center;
    const tool=['select','pan','move','road','meadow','river','nature','thin-nature','habitat','camp','camera','erase','battery-bank',...sourceKinds,...catalog.buildings.map(b=>b.id)].includes(view.tool)?view.tool:'select';
    map.view={center:clone(center),zoom:Number.isFinite(view.zoom)?Math.max(.3,Math.min(3,view.zoom)):1.3,selectedResident:typeof view.selectedResident==='string'?view.selectedResident:null,selectedRoute:typeof view.selectedRoute==='string'?view.selectedRoute:null,selectedBank:typeof view.selectedBank==='string'?view.selectedBank:null,selectedSite:typeof view.selectedSite==='string'?view.selectedSite:null,selected:typeof view.selected==='string'?view.selected:null,selection:Array.isArray(view.selection)?view.selection.filter(id=>typeof id==='string').slice(0,256):[],tool,habitatPreset:catalog.habitats.some(h=>h.key===view.habitatPreset)?view.habitatPreset:'flower-meadow',workspace:Object.hasOwn(workspaceNames,view.workspace)?view.workspace:'land',layer:Object.hasOwn(sceneLayers,view.layer)||Object.hasOwn(landLayers,view.layer)||Object.hasOwn(waterLayers,view.layer)?view.layer:'none',utilityKind:Object.hasOwn(routeNames,view.utilityKind)?view.utilityKind:'all',regionId:doc.value.map.regions?.some(r=>r.id===view.regionId)?view.regionId:'all',grid:view.grid!==false};
  }
  map.brushSize=[1,3,5,9].includes(view?.brushSize)?view.brushSize:3;map.natureSpecies=catalog.nature.find(s=>s.key===view?.natureSpeciesKey)||catalog.nature[0];map.natureSize=Number.isFinite(view?.natureSize)?Math.max(map.natureSpecies.min_size,Math.min(map.natureSpecies.max_size,view.natureSize)):1;
  $('creator-habitat').value=map.view.habitatPreset;
  $('creator-brush-size').value=map.brushSize;$('creator-species').value=map.natureSpecies.key;$('creator-nature-size').value=map.natureSize;$('creator-nature-scale').textContent=map.natureSize.toFixed(2)+'×';
  history.replaceState(null,'',`./editor.html?project=${encodeURIComponent(ctx.id)}`);
  $('creator-library-dialog').close();$('creator-library-title').textContent='Creation library';
  refresh();setTool(map.view.tool);workspaces.select(map.view.workspace,{notify:false});$('creator-land-layer').value=map.view.layer;$('creator-land-legend').textContent=overlayLegend();$('creator-grid').checked=map.view.grid;
  ctx.viewDirty=revision===null; // Restoring a durable view is not a new player edit.
  status(revision===null?'New creation · save to keep it':'Saved on this device');
  if(doc.historyRecovered)toast('The creation was recovered. Its damaged undo history was cleared.');
}
async function openProject(record){
  let checkpoint=record.checkpoint,view=record.view,recovered=false;
  try{EditorDocument.restore(checkpoint);}catch{
    if(!record.previous?.checkpoint)throw Error('This creation could not load. Export its original data before replacing it.');
    checkpoint=record.previous.checkpoint;view=record.previous.view;recovered=true;
  }
  try{
    const cached=JSON.parse(sessionStorage.getItem(recoveryKey(record.id))||'null');
    if(cached?.storageRevision===record.revision){EditorDocument.restore(cached.checkpoint);recovered=JSON.stringify(cached.checkpoint)!==JSON.stringify(checkpoint)||JSON.stringify(cached.view)!==JSON.stringify(view);checkpoint=cached.checkpoint;view=cached.view;}
  }catch{/* Keep the last durable checkpoint. */}
  attach(checkpoint.definition,{id:record.id,revision:record.revision,checkpoint,view,record});
  if(recovered){current.viewDirty=true;status('Recovered your last checkpoint');toast('Your creation was recovered. Save it to keep this checkpoint.');}
}
async function newProject(preset,source=null,attribution=[]){
  if(current)await save();
  const id=crypto.randomUUID();let d=source?clone(source):JSON.parse(engine.scenario_template('story'));
  d.id=id;d.map.id='map-'+id;d.revision=1;d.map.revision=1;
  if(!source){d.title='Our new ecovila';d.description='A new beginning, shaped together.';d.rules.mode='sandbox';}
  if(!source){const seed=preset==='generated'?crypto.getRandomValues(new Uint32Array(1))[0]:d.map.seed;const generated=JSON.parse(engine.generate_biome_property(newBiome,seed));d.map={...generated,id:d.map.id};}
  if(preset==='empty'){
    const items={};for(const p of d.start.inventories)for(const [key,n]of Object.entries(p.items))items[key]=(items[key]||0)+n;
    d.start.buildings=[];d.start.roads=[];d.start.inventories=[{owner:{kind:'camp'},items}];
  }
  const prepared=new Game();
  try{const checked=JSON.parse(prepared.load_scenario(JSON.stringify(d)));if(checked.ok)d=freezeCreation(d,{terrain:JSON.parse(prepared.terrain_template()),snapshot:JSON.parse(prepared.report_state()),catalog});}finally{prepared.free();}
  attach(d,{id,record:{attribution:clone(attribution)}});await save();
}
async function copyCurrent(){
  if(!current)return;
  clearTimeout(saveTimer);await saving.catch(()=>{});
  const id=crypto.randomUUID(),d=current.doc.value,view=map.state,attribution=clone(current.record?.attribution??[]);d.id=id;d.map.id='map-'+id;d.title=(d.title+' · copy').slice(0,100);d.revision=1;d.map.revision=1;
  attach(d,{id,view,record:{attribution}});await save();toast('A separate copy is saved.');
}
async function launch(definition,record,sessionKind,releaseId=null,releasePackage=null){
  const prepared=await prepareScenario(releasePackage??definition);
  const run=await library.createRun({definition,snapshot:prepared.snapshot,projectId:record.id,sessionKind,sourceRevision:record.revision,releaseId,thumbnail:previewOf(definition,prepared.report)});
  location.assign(`./?run=${encodeURIComponent(run.id)}`);return true;
}
async function showLibrary({reset=false}={}){
  if(current)await save();
  const [projects,runs,releases,maps,residentPresets]=await Promise.all([library.listProjects(),library.listRuns(),library.listReleases(),library.listMaps(),library.listResidentPresets()]);
  const backupSelect=$('creator-backup-entry'),selectedBackup=backupSelect.value,backupEntries=[['project',projects],['run',runs],['release',releases],['map',maps],['resident',residentPresets]].flatMap(([kind,entries])=>entries.filter(entry=>!entry.missingBody).map(entry=>new Option(`${{project:'Draft',run:'Village',release:'Scenario release',map:'Map',resident:'Resident preset'}[kind]} · ${entry.title??'Untitled'}`,JSON.stringify([kind,entry.id]))));
  backupSelect.replaceChildren(...(backupEntries.length?backupEntries:[new Option('No saved records available','')]));if(backupEntries.some(option=>option.value===selectedBackup))backupSelect.value=selectedBackup;$('creator-backup-record').disabled=!backupSelect.value;
  $('creator-project-list').innerHTML=projects.length?projects.map(p=>p.missingBody?missingLibraryEntry('project',p):`<div class="creator-library-row">${previewMarkup('project',p.id)}<div><b>${escape(p.title)}</b><small>Saved ${escape(new Date(p.updatedAt).toLocaleString())}</small>${p.residentBalance==='unrestricted'?'<small>Unrestricted starting skills</small>':''}</div><button data-open-project="${escape(p.id)}">Edit</button><button data-play-project="${escape(p.id)}">Play</button><button data-copy-project="${escape(p.id)}">Copy</button><button data-backup-project="${escape(p.id)}" title="Keep the original draft, history and previous checkpoint">Backup</button><button class="creator-remove" data-remove-project="${escape(p.id)}" aria-label="Remove ${escape(p.title)}">×</button></div>`).join(''):'<p>No creations yet. Choose a beginning above.</p>';
  $('creator-releases-heading').hidden=!releases.length;
  $('creator-release-list').innerHTML=releases.map(r=>{
    if(r.missingBody)return missingLibraryEntry('release',r);
    const compatible=r.compatibility&&Object.entries(catalog.releases.compatibility).every(([key,value])=>r.compatibility[key]===value);
    return `<div class="creator-library-row creator-release-row" data-release="${escape(r.id)}">${previewMarkup('release',r.id)}<div><b>${escape(r.title)}</b><small>Version ${escape(r.contentRevision)} · ${escape(r.author)}</small><small>${compatible?'Frozen content · independent of the draft':'Needs another game version · original export remains available'}</small></div><div class="creator-release-actions"><button data-play-release="${escape(r.id)}" ${compatible?'':'disabled'}>Play</button><button data-copy-release="${escape(r.id)}" ${compatible?'':'disabled'}>Edit a copy</button><button data-export-release="${escape(r.id)}">Export</button><button class="creator-remove" data-remove-release="${escape(r.id)}" aria-label="Remove release ${escape(r.title)} version ${escape(r.contentRevision)}">×</button></div></div>`;
  }).join('');
  $('creator-map-list').innerHTML=maps.map(m=>{
    if(m.missingBody)return missingLibraryEntry('map',m);
    const compatible=m.compatibility&&Object.entries(catalog.map_packages.compatibility).every(([key,value])=>m.compatibility[key]===value);
    return `<div class="creator-library-row creator-release-row" data-map="${escape(m.id)}">${previewMarkup('map',m.id)}<div><b>${escape(m.title)}</b><small>Version ${escape(m.contentRevision)} · ${escape(m.author)}</small><small>${compatible?'Land and climate · start a new scenario':'Needs another game version · original export remains available'}</small></div><div class="creator-release-actions"><button data-use-map="${escape(m.id)}" ${compatible?'':'disabled'}>Create scenario</button><button data-export-map="${escape(m.id)}">Export</button><button class="creator-remove" data-remove-map="${escape(m.id)}" aria-label="Remove map ${escape(m.title)}">×</button></div></div>`;
  }).join('');
  const villages=runs.filter(r=>r.sessionKind==='scenario'||r.missingBody);
  $('creator-runs-heading').hidden=!villages.length;
  $('creator-run-list').innerHTML=villages.map(r=>r.missingBody?missingLibraryEntry('run',r):`<div class="creator-library-row">${previewMarkup('run',r.id)}<div><b>${escape(r.title)}</b><small>Independent village save</small>${r.residentBalance==='unrestricted'?'<small>Unrestricted starting skills</small>':''}</div><button data-continue-run="${escape(r.id)}">Continue</button><button data-backup-run="${escape(r.id)}" title="Keep the original village and previous snapshot">Backup</button></div>`).join('');
  $('creator-library-title').textContent=projects.length+releases.length+villages.length+maps.length?'Creation library':'Create a village';
  if(!$('creator-library-dialog').open)$('creator-new-options').open=projects.length+releases.length+villages.length+maps.length===0;
  libraryDiscovery??=installLibraryDiscovery();libraryDiscovery.set(projects,releases,villages,maps);if(reset)libraryDiscovery.reset();
  const previewRecords=new Map([...projects.map(r=>['project:'+r.id,r]),...runs.map(r=>['run:'+r.id,r]),...releases.map(r=>['release:'+r.id,r]),...maps.map(r=>['map:'+r.id,r])]);
  // Start after the dialog opens; the task stops when its rows are replaced or
  // the library closes. Preview failures never disable content actions.
  setTimeout(()=>hydrateLibraryPreviews({library,dialog:$('creator-library-dialog'),records:previewRecords,makePreview:(kind,record)=>{
    if(kind==='map')return mapSharing.preview(record.package);
    const candidate=new Game();
    try{
      let definition=kind==='project'?record.checkpoint?.definition:kind==='release'?record.package?.definition:record.definition;
      if(kind==='run'){if(!candidate.restore(record.snapshot))return null;definition=JSON.parse(candidate.snapshot()).village.scenario?.definition;}
      if(!definition)return null;
      const checked=JSON.parse(candidate.load_scenario(JSON.stringify(kind==='release'?record.package:definition)));
      return checked.ok?previewOf(definition,JSON.parse(candidate.report_state())):null;
    }finally{candidate.free();}
  }}).catch(()=>{}),0);
  $('creator-library-status').textContent='';if(!$('creator-library-dialog').open)$('creator-library-dialog').showModal();
}
function wire(){
  $('creator-backup-entry').onchange=()=>{$('creator-backup-record').disabled=!$('creator-backup-entry').value;};
  $('creator-backup-record').onclick=async event=>{
    event.stopPropagation();const button=event.currentTarget;button.disabled=true;
    try{const [kind,id]=JSON.parse($('creator-backup-entry').value),get={project:()=>library.getProject(id),run:()=>library.getRun(id),release:()=>library.getRelease(id),map:()=>library.getMap(id),resident:()=>library.getResidentPreset(id)}[kind];if(!get)throw Error('Choose a saved entry to back up.');downloadRecoveryRecord(kind,await get());$('creator-library-status').textContent='Original record backup downloaded. Saved content is unchanged; keep this file even if this game cannot open it.';}
    catch(error){$('creator-library-status').textContent=error.message;}finally{button.disabled=!$('creator-backup-entry').value;}
  };

  $('creator-repair-index').onclick=async e=>{
    e.stopPropagation();const button=e.currentTarget;button.disabled=true;
    try{const result=await library.rebuildIndex();await showLibrary();$('creator-library-status').textContent=`Checked ${result.scanned} saved records · repaired ${result.repaired} library entries.${result.missing?` ${result.missing} entries have missing saved data; their remaining entry details are preserved.`:''}${result.skipped?' Some records could not be indexed; their stored data is unchanged.':''}`;}
    catch(error){$('creator-library-status').textContent=error.message;}finally{button.disabled=false;}
  };

  mapSharing=new MapSharingControls({library,catalog,engine,Game,art,save,newProject,showLibrary,notify:toast,source:()=>current?{id:current.id,revision:current.doc.revision,definition:current.doc.value,valid:report.ok,attribution:current.record?.attribution??[]}:null,resolve:prepared=>current.doc.transact('Resolve landscape for map sharing',d=>{d.map=prepared.map;d.rules.weather=prepared.weather;}),setBusy:value=>{busy=value;$('creator-test').disabled=busy||!report.ok;$('creator-release').disabled=busy||!report.ok;$('creator-save-map').disabled=busy;}});

  $('creator-route-tools').onclick=()=>{const details=$('creator-routes');revealWorkspaceSection(details);details.open=true;routesEditor.paint();details.scrollIntoView({block:'start'});};
  $('creator-habitat').onchange=()=>{map.view.habitatPreset=$('creator-habitat').value;setTool('habitat');};
  $('creator-species').onchange=()=>{map.natureSpecies=catalog.nature.find(s=>s.key===$('creator-species').value);$('creator-nature-size').min=map.natureSpecies.min_size;$('creator-nature-size').max=map.natureSpecies.max_size;setTool('nature');};
  $('creator-nature-size').oninput=e=>{map.natureSize=Number(e.target.value);$('creator-nature-scale').textContent=map.natureSize.toFixed(2)+'×';map.render();map.viewChanged(map.state);};
  $('creator-river-enabled').onchange=e=>change(e.target.checked?'Restore river':'Remove river',d=>{d.map.river=e.target.checked?JSON.parse(engine.scenario_template('story')).map.river:null;});
  $('creator-overlay-filter').onchange=e=>{map.view[map.view.layer==='utilities'?'utilityKind':'regionId']=e.target.value;$('creator-land-legend').textContent=overlayLegend();map.render();map.viewChanged(map.state);};
  $('creator-land-layer').onchange=e=>{map.view.layer=e.target.value;renderSceneFilter();map.landOverlay=overlayTiles();$('creator-land-legend').textContent=overlayLegend();inspectGround(hoverCell);map.render();map.viewChanged(map.state);};
  $('creator-brush-size').onchange=e=>{map.brushSize=Number(e.target.value);map.viewChanged(map.state);};
  $('creator-toolbelt').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
  $('creator-sites').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
  $('creator-buildings').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
  $('creator-grid').onchange=()=>{map.view.grid=$('creator-grid').checked;map.render();map.viewChanged(map.state);};
  $('creator-title').onchange=()=>change('Rename our village',d=>{d.title=$('creator-title').value;});
  for(const [id,path,label]of [['creator-description',['description'],'Edit introduction'],['creator-seed',['map','seed'],'Change landscape seed'],['creator-funds',['start','funds'],'Set the shared fund'],['creator-water',['start','fresh_water'],'Set starting fresh water']])$(id).onchange=()=>{
    const raw=$(id).value,value=id==='creator-description'?raw:id==='creator-funds'?Math.round(Number(raw)*100):Number(raw);
    change(label,d=>{if(path.length===1)d[path[0]]=value;else d[path[0]][path[1]]=value;});
  };
  $('creator-biomes').onclick=e=>{const b=e.target.closest('[data-biome]');if(!b)return;newBiome=b.dataset.biome;for(const choice of $('creator-biomes').querySelectorAll('button'))choice.setAttribute('aria-pressed',String(choice===b));};
  $('creator-rules').onchange=e=>{if(e.target.dataset.rule)change('Change village rules',d=>{d.rules[e.target.dataset.rule]=e.target.checked;});};
  $('creator-selection').onchange=e=>{
    if(e.target.matches('[data-start-recovery]')){const value=e.target.value,id=map.view.selected;change('Set inherited structure recovery',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(value==='none')delete b.material_recovery;else b.material_recovery=value;});return;}
    if(e.target.dataset.startBank){const key=e.target.dataset.startBank,value=Number(e.target.value),id=map.view.selectedBank;change('Edit battery bank',d=>{const b=d.start.batteries?.find(b=>b.id===id);if(b)b[key]=value;});return;}
    if(e.target.dataset.buildingBank){const key=e.target.dataset.buildingBank,value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value),id=map.view.selected;change('Edit building battery',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.battery)b.battery[key]=value;});return;}

    if(e.target.dataset.startAnimal){const key=e.target.dataset.startAnimal,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selected;change('Configure starting animals',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.animals)setStartingAnimalField(b,key,value);});return;}
    if(e.target.dataset.startSite){const key=e.target.dataset.startSite,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selectedSite;change('Edit material plot',d=>{const site=d.start.resource_sites?.find(s=>s.id===id);if(site)setSiteField(site,key,value);});return;}
    if(e.target.dataset.startOrchard){const field=e.target.dataset.startOrchard,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selected;change('Configure starting orchard',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.orchard)setStartingOrchardField(b,field,value);});return;}
    if(e.target.dataset.startCrop){const field=e.target.dataset.startCrop,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selected;change('Configure starting crops',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.crop)setStartingCropField(b,field,value);});return;}
    const id=map.view.selected,key={'creator-object-x':'x','creator-object-y':'y','creator-object-state':'state','creator-object-recipe':'recipe','creator-object-appearance':'appearance'}[e.target.id];
    if(key)change('Edit '+title(current.doc.value.start.buildings.find(b=>b.id===id)?.kind),d=>{
      const b=d.start.buildings.find(b=>b.id===id);if(!b)return;b[key]=['x','y'].includes(key)?Number(e.target.value):e.target.value;
      if(key==='recipe'&&b.kind==='home')b.appearance=b.recipe==='adobe'?'adobe-gable':b.recipe==='local'?'home-veranda':'home';
    });
  };
  $('creator-selection').onclick=e=>{
    if(e.target.closest('[data-edit-start]')){residentsEditor.openArrival(map.view.selectedResident);return;}
    if(e.target.closest('[data-route-inspect]')){routesEditor.edit(map.view.selectedRoute);return;}
    const buildingBank=e.target.closest('[data-building-bank-action]')?.dataset.buildingBankAction;if(buildingBank){const id=map.view.selected;change('Configure building battery',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(buildingBank==='reset')delete b.battery;else b.battery={charge:catalog.batteries.buildings.find(p=>p.id===b.kind).default_charge,owned:true};});return;}
    const bankAction=e.target.closest('[data-bank-action]')?.dataset.bankAction;if(bankAction){const id=map.view.selectedBank;if(bankAction==='remove'){change('Remove battery bank',d=>{d.start.batteries=d.start.batteries.filter(b=>b.id!==id);});map.select(null);}else if(bankAction==='duplicate'){map.bankCopy=clone(current.doc.value.start.batteries.find(b=>b.id===id));setTool('copy-bank');}else setTool('move-bank');return;}

    const animalAction=e.target.closest('[data-animal-action]')?.dataset.animalAction;if(animalAction){const id=map.view.selected;change('Configure starting animals',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(animalAction==='reset')delete b.animals;else b.animals=clone(catalog.animals.example);});return;}
    const siteAction=e.target.closest('[data-site-action]')?.dataset.siteAction;if(siteAction){const id=map.view.selectedSite;if(siteAction==='remove'){change('Remove material plot',d=>{d.start.resource_sites=d.start.resource_sites.filter(s=>s.id!==id);});map.select(null);}else if(siteAction==='duplicate'){map.siteCopy=clone(current.doc.value.start.resource_sites.find(s=>s.id===id));setTool('copy-site');}else setTool('move-site');return;}

    const orchardAction=e.target.closest('[data-orchard-action]')?.dataset.orchardAction;if(orchardAction){const id=map.view.selected;change('Configure starting orchard',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(orchardAction==='reset')delete b.orchard;else b.orchard=structuredClone(catalog.orchards.example);});return;}
    const cropAction=e.target.closest('[data-crop-action]')?.dataset.cropAction;if(cropAction){const id=map.view.selected;change('Configure starting crops',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(cropAction==='reset')delete b.crop;else b.crop=structuredClone(catalog.farming.example);});return;}
    const action=e.target.closest('[data-selection-action]')?.dataset.selectionAction,id=map.view.selected;if(!action)return;
    if(action==='move')setTool('move');
    if(action==='remove')removeBuilding(id);
    if(action==='duplicate'){
      try{map.copy=planBuildingCopy(current.doc.value,map.selection());map.copy.cropViews=Object.fromEntries(map.copy.buildings.map(b=>[b.id,structuredClone(map.snapshot.village.buildings.find(p=>p.kind===b.kind&&p.x===b.x&&p.y===b.y)?.crop)]));if(map.copy.buildings.length)setTool('duplicate');}catch(error){toast(error.message);}
    }
  };
  $('creator-issues').onclick=e=>{
    const journalIssue=e.target.closest('[data-issue-journal]');if(journalIssue){const issue=report.issues[Number(journalIssue.dataset.issueJournal)];if(issue){const section=$('creator-journal');revealWorkspaceSection(section);section.open=true;journalEditor.openIssue(issue.path);}return;}
    if(e.target.closest('[data-issue-more]')){expandedReview=true;renderReview();return;}
    const button=e.target.closest('[data-issue]');
    if(button){const issue=report.issues[Number(button.dataset.issue)];if(issue.at)map.centerAt(...issue.at);if(issue.entity){if((current.doc.value.start.residents??catalog.resident_presets).some(p=>p.id===issue.entity)){map.selectResident(issue.entity);residentsEditor.openArrival(issue.entity);}else if(current.doc.value.start.routes?.some(r=>r.id===issue.entity)){map.selectRoute(issue.entity);routesEditor.edit(issue.entity);}else if(current.doc.value.start.batteries?.some(b=>b.id===issue.entity))map.selectBank(issue.entity);else if(current.doc.value.start.resource_sites?.some(s=>s.id===issue.entity))map.selectSite(issue.entity);else map.select(issue.entity);}}
    if(e.target.matches('[data-issue-liquids]')){revealWorkspaceSection($('creator-liquids'));$('creator-liquids').open=true;$('creator-liquids').scrollIntoView({block:'nearest'});}
    if(e.target.matches('[data-issue-supplies]')){revealWorkspaceSection($('creator-supplies'));$('creator-supplies').open=true;$('creator-supplies').scrollIntoView({block:'nearest'});}
  };
  $('creator-undo').onclick=()=>stepHistory();$('creator-redo').onclick=()=>stepHistory(true);
  $('creator-release').onclick=()=>{if(!current||busy||!report.ok)return;$('creator-release-status').textContent='';$('creator-release-credits').textContent=(current.record?.attribution??[]).map(c=>`Based on version ${c.revision} by ${c.author}`).join(' · ');$('creator-release-dialog').showModal();};
  $('creator-release-cancel').onclick=()=>{if(releasePublication)releasePublication.abort(new DOMException('Release publication cancelled. Your checked draft is still saved.','AbortError'));else $('creator-release-dialog').close();};
  $('creator-release-dialog').addEventListener('cancel',e=>{if(busy){e.preventDefault();releasePublication?.abort(new DOMException('Release publication cancelled. Your checked draft is still saved.','AbortError'));}});
  $('creator-release-confirm').onclick=async()=>{
    const author=$('creator-release-author');if(!author.reportValidity()||!current||busy)return;
    busy=true;author.disabled=true;$('creator-release-confirm').disabled=true;$('creator-release-cancel').disabled=true;$('creator-release-status').textContent='Checking and saving this release…';
    const ctx=current,revision=ctx.doc.revision;
    try{
      const frozen=await prepareRelease(ctx.doc.value);
      if(current!==ctx||ctx.doc.revision!==revision)throw Error('This draft changed during preparation. Prepare the release again.');
      $('creator-release-status').textContent='Saving the checked release…';
      await save();
      if(canonical(frozen)!==canonical(current.doc.value)){current.doc.transact('Resolve landscape for frozen release',d=>Object.assign(d,frozen));await save();}
      const thumbnail=previewOf(current.doc.value,map.snapshot);releasePublication=new AbortController();$('creator-release-cancel').disabled=false;$('creator-release-cancel').textContent='Cancel save';$('creator-release-status').textContent='Checking your release…';
      const record=await library.createRelease({projectId:current.id,expectedRevision:current.storageRevision,author:author.value,signal:releasePublication.signal,validate:raw=>validatePublication('release',raw,{signal:releasePublication.signal,onStage:stage=>$('creator-release-status').textContent=stage}),thumbnail});
      $('creator-release-dialog').close();await showLibrary({reset:true});toast(`Version ${record.package.content_revision} is saved independently.`);
    }catch(error){$('creator-release-status').textContent=error.message;}finally{releasePublication=null;busy=false;author.disabled=false;$('creator-release-cancel').textContent='Keep editing';$('creator-release-confirm').disabled=false;$('creator-release-cancel').disabled=false;if(current&&current.doc.revision!==revision)refresh();if($('creator-release-dialog').open)$('creator-release-confirm').focus();}
  };
  $('creator-save').onclick=()=>save().then(()=>toast('Your creation is saved.')).catch(()=>{});
  $('creator-save-copy').onclick=()=>copyCurrent().catch(e=>toast(e.message));
  $('creator-export').onclick=async()=>{if(!current||busy)return;busy=true;try{await download(current.doc.value);}catch(error){toast(error.message);}finally{busy=false;$('creator-export').focus();}};
  $('creator-library').onclick=()=>showLibrary().catch(e=>toast(e.message));
  $('creator-library-close').onclick=()=>{if(current)$('creator-library-dialog').close();else location.assign('./');};
  $('creator-library-dialog').addEventListener('cancel',e=>{if(!current){e.preventDefault();location.assign('./');}});
  $('creator-zoom-in').onclick=()=>map.setZoom(map.view.zoom+.15);$('creator-zoom-out').onclick=()=>map.setZoom(map.view.zoom-.15);$('creator-center').onclick=()=>map.centerAt(...current.doc.value.map.camp);
  $('creator-test').onclick=async()=>{
    if(!current||busy||!report.ok)return;busy=true;$('creator-test').disabled=true;status('Preparing the playtest…');
    try{const record=await save();await launch(current.doc.value,record,'playtest');}catch(e){toast(e.message);}finally{busy=false;refresh();$('creator-test').focus();}
  };
  $('creator-back').onclick=async e=>{e.preventDefault();try{if(current)await save();location.assign('./');}catch{/* Keep the unsaved work available to export. */}};
  $('creator-library-dialog').onclick=async e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;b.disabled=true;
    try{
      if(b.dataset.backupMissingKind)await downloadMissingEntryDetails(library,b.dataset.backupMissingKind,b.dataset.backupMissingId);
      if(b.dataset.backupProject)downloadRecoveryRecord('project',await library.getProject(b.dataset.backupProject));
      if(b.dataset.backupRun)downloadRecoveryRecord('run',await library.getRun(b.dataset.backupRun));
      if(b.dataset.example){const definition=await loadExampleScenario(b.dataset.example,raw=>JSON.parse(engine.validate_scenario(raw)));await newProject('copy',definition);toast('A separate editable copy of the example is saved.');}
      if(b.dataset.preset)await newProject(b.dataset.preset);
      if(b.dataset.openProject){const record=await library.getProject(b.dataset.openProject);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await openProject(record);}
      if(b.dataset.playProject){const record=await library.getProject(b.dataset.playProject);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await launch(record.checkpoint.definition,record,'scenario');}
      if(b.dataset.copyProject){const record=await library.getProject(b.dataset.copyProject);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await newProject('copy',{...record.checkpoint.definition,title:(record.title+' · copy').slice(0,100)},record.attribution??[]);}
      if(b.dataset.useMap){const record=await library.getMap(b.dataset.useMap);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await mapSharing.use(record);}
      if(b.dataset.exportMap){const record=await library.getMap(b.dataset.exportMap);const result=downloadStoredPackage('map',record);$('creator-library-status').textContent=result.backup?'The content package is damaged. A full original-record backup was downloaded; saved data is unchanged.':'Original map package exported. Saved data is unchanged.';}
      if(b.dataset.removeMap){const record=await library.getMap(b.dataset.removeMap);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record){pendingDelete={kind:'map',record};$('creator-delete-title').textContent='Remove this reusable map?';$('creator-delete-dialog').querySelector('p').textContent='Only this saved map is removed. Existing drafts, releases and villages keep their own land.';$('creator-delete-dialog').showModal();}}
      if(b.dataset.playRelease){const record=await library.getRelease(b.dataset.playRelease);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await launch(record.package.definition,{id:record.projectId,revision:record.sourceRevision},'scenario',record.id,record.package);}
      if(b.dataset.exportRelease){const record=await library.getRelease(b.dataset.exportRelease);const result=downloadStoredPackage('release',record);$('creator-library-status').textContent=result.backup?'The content package is damaged. A full original-record backup was downloaded; saved data is unchanged.':'Original release package exported. Saved data is unchanged.';}
      if(b.dataset.copyRelease){const record=await library.getRelease(b.dataset.copyRelease);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record){const checked=JSON.parse(engine.validate_scenario(canonical(record.package)));if(!checked.ok)throw Error(checked.issues.find(i=>i.severity==='error')?.message||'This release cannot open.');const p=record.package,credits=[...(p.credits??[]),{release:p.id,revision:p.content_revision,author:p.author}];if(credits.length>catalog.releases.maximum_credits)throw Error('This release already has the maximum source credits. Keep its original export.');await newProject('copy',{...p.definition,title:(p.title+' · copy').slice(0,100)},credits);}}
      if(b.dataset.removeRelease){const record=await library.getRelease(b.dataset.removeRelease);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record){pendingDelete={kind:'release',record};$('creator-delete-title').textContent='Remove this frozen release?';$('creator-delete-dialog').querySelector('p').textContent='Only this release is removed. Drafts and saved villages keep their own content.';$('creator-delete-dialog').showModal();}}
      if(b.dataset.removeProject){$('creator-delete-title').textContent='Remove this creation?';$('creator-delete-dialog').querySelector('p').textContent='The editable project will be removed. Frozen releases and independent villages keep their content and saves.';pendingDelete=await library.getProject(b.dataset.removeProject);$('creator-delete-dialog').showModal();}
      if(b.dataset.continueRun){if(!await library.getRun(b.dataset.continueRun))throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');location.assign(`./?run=${encodeURIComponent(b.dataset.continueRun)}`);}
    }catch(error){$('creator-library-status').textContent=error.message;}finally{b.disabled=false;}
  };
  $('creator-delete-cancel').onclick=()=>$('creator-delete-dialog').close();
  $('creator-delete-confirm').onclick=async()=>{
    try{if(pendingDelete?.kind==='map'){await library.deleteMap(pendingDelete.record.id,pendingDelete.record.revision);}else if(pendingDelete?.kind==='release'){await library.deleteRelease(pendingDelete.record.id,pendingDelete.record.revision);}else if(pendingDelete){await library.deleteProject(pendingDelete.id,pendingDelete.revision);if(current?.id===pendingDelete.id){current=null;history.replaceState(null,'','./editor.html');}}
      $('creator-delete-dialog').close();pendingDelete=null;await showLibrary();}catch(error){toast(error.message);}
  };
  $('creator-import').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    $('creator-library-status').textContent='Reading creation…';
    try{
      if(file.size>MAX_RECOVERY_FILE_BYTES)throw Error('This backup or creation file exceeds 96 MiB. Keep the original file.');
      const raw=await file.text();let content;try{content=JSON.parse(raw);}catch{throw Error('This file is not a readable creation.');}
      if(content.format==='solar-friends-recovery'){
        if(['map','release','resident'].includes(content.kind)){
          const recovered=recoveredPackage(content,{validateMap:mapSharing.validate,validateScenario:raw=>JSON.parse(engine.validate_scenario(raw)),validateResident:raw=>JSON.parse(engine.validate_resident_preset(raw,true))});
          if(current)await save();
          if(recovered.kind==='map')await library.importMap(recovered.file,mapSharing.validate,mapSharing.preview(recovered.file));
          else if(recovered.kind==='release')await library.importRelease(recovered.file,raw=>JSON.parse(engine.validate_scenario(raw)));
          else await library.saveResidentPreset({id:crypto.randomUUID(),file:recovered.file});
          await showLibrary({reset:true});$('creator-library-status').textContent=`Recovered a separate ${recovered.kind==='resident'?'resident preset':recovered.kind==='release'?'scenario release':'reusable map'}. The original backup and saved entries are unchanged.${recovered.kind==='resident'?' Find the recovered person under Founding cast → Resident presets.':''}`;return;
        }

        const recovered=await chooseRecoveryCheckpoint(content,{Game,validate:data=>JSON.parse(engine.validate_scenario(data))});if(!recovered)return;
        if(content.kind==='run'){if(current)await save();await library.importRecoveredRun(recovered);await showLibrary({reset:true});toast('Recovered as a separate saved village.');}
        else{if(current)await save();const id=crypto.randomUUID(),doc=EditorDocument.fork(recovered.checkpoint,id);attach(doc.value,{id,checkpoint:doc.checkpoint(),view:recovered.view,record:{attribution:clone(recovered.attribution)}});await save();toast(recovered.historyRecovered||doc.historyRecovered?'Recovered a separate draft. Damaged undo history was cleared.':recovered.playable?'Recovered as a separate draft with its history and view.':'Recovered as a separate draft. Review its issues before playing.');}
        return;
      }
      if(file.size>MAX_CREATION_BYTES)throw Error('This creation file is too large.');
      const checked=JSON.parse(engine.validate_scenario(raw));
      if(content.format===MAP_FORMAT){const accepted=validateMapPackage(content,mapSharing.validate);if(current)await save();const thumbnail=mapSharing.preview(accepted);await library.importMap(accepted,mapSharing.validate,thumbnail);await showLibrary({reset:true});toast('Imported as a separate reusable map.');return;}
      if(content.format===RELEASE_FORMAT){if(!checked.ok)throw Error(checked.issues.find(i=>i.severity==='error')?.message||'This release cannot open.');if(current)await save();const previewGame=new Game();let thumbnail;try{const loaded=JSON.parse(previewGame.load_scenario(raw));if(loaded.ok)thumbnail=previewOf(content.definition,JSON.parse(previewGame.report_state()));}finally{previewGame.free();}await library.importRelease(content,data=>JSON.parse(engine.validate_scenario(data)),thumbnail);await showLibrary({reset:true});toast('Imported as a separate frozen release.');return;}
      const importIssue=draftImportIssue(checked);if(importIssue)throw Error(importIssue.message);
      await newProject('import',JSON.parse(raw));toast(checked.ok?'The creation was imported as a separate project.':'Imported as a draft. Review its issues before testing.');
    }catch(error){$('creator-library-status').textContent=error.message;}finally{e.target.value='';}
  };
  window.addEventListener('keydown',e=>{
    if(busy||document.querySelector('dialog[open]')||!current||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if((e.metaKey||e.ctrlKey)&&e.code==='KeyZ'){e.preventDefault();stepHistory(e.shiftKey);}
    else if((e.metaKey||e.ctrlKey)&&e.code==='KeyS'){e.preventDefault();save().catch(()=>{});}
    else if(e.code==='Escape'){e.preventDefault();routesEditor.cancel();setTool('select');map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedRoute){e.preventDefault();const ids=dependentRoutes(current.doc.value,map.view.selectedRoute);change('Remove utility connection',d=>{d.start.routes=d.start.routes.filter(r=>!ids.has(r.id));});map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedBank){e.preventDefault();const id=map.view.selectedBank;change('Remove battery bank',d=>{d.start.batteries=d.start.batteries.filter(b=>b.id!==id);});map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedSite){e.preventDefault();const id=map.view.selectedSite;change('Remove material plot',d=>{d.start.resource_sites=d.start.resource_sites.filter(s=>s.id!==id);});map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selected){e.preventDefault();removeBuilding(map.view.selected);}
  });
  window.addEventListener('beforeunload',e=>{map?.cancelGesture();if(current&&(current.doc.dirty||current.viewDirty||current.conflicted)){cacheRecovery(current,current.doc.checkpoint(),map.state);e.preventDefault();e.returnValue='';}});
  window.addEventListener('blur',()=>map?.cancelGesture());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){map?.cancelGesture();if(current)save().catch(()=>{});}});
  library.addEventListener('change',e=>{if(e.detail.remote&&current?.id===e.detail.id&&e.detail.revision!==current.storageRevision){current.conflicted=true;status('Changed in another tab · save a copy');toast('Another tab changed this creation. Your edits are kept here; save a copy to retain them.');}});
}

try{
  await init({module_or_path:new URL('../pkg/solar_friends_bg.wasm',import.meta.url)});
  outlook=new ScenarioOutlook($('creator-outlook'),{source:()=>({key:current?current.id+':'+current.doc.revision:null,valid:!!current&&report.ok,snapshot:()=>engine.snapshot(),projects:checkpoint=>projectPlaces(checkpoint,current.doc.value.start.buildings,title)}),reviewProject:p=>{if(!current?.doc.value.start.buildings.some(b=>b.id===p.id))return;setTool('select');map.select(p.id);map.centerAt(p.x,p.y);workspaces.select('village');$('creator-selection').scrollIntoView({block:'nearest'});}});
  engine=new Game();catalog=JSON.parse(engine.scenario_catalog());art=await loadEditorArt();
  map=new EditorMap($('creator-map'),art,{retryButton:$('creator-art-retry'),onTerrainReady:()=>{if(current){current.artRevision=(current.artRevision??0)+1;current.thumbnailRevision=null;scheduleSave();}},onArtworkReady:()=>{if(current){current.artRevision=(current.artRevision??0)+1;current.thumbnailRevision=null;scheduleSave();}},action:mapAction,viewChanged:()=>{if(current){const key=JSON.stringify(map.state);if(key===current.viewKey)return;current.viewKey=key;current.viewDirty=true;if(!current.conflicted)status('Changes to save');const selection=JSON.stringify([map.selection(),map.view.selectedSite,map.view.selectedBank,map.view.selectedRoute,map.view.selectedResident]);if(selection!==inspectorSelection){inspectorSelection=selection;renderSelection();}scheduleSave();}},hover:inspectGround});
  minimap=new EditorMinimap($('creator-minimap'),map);map.onRender=()=>minimap.draw();
  $('creator-sites').innerHTML='<button data-tool="battery-bank" aria-pressed="false">Battery bank</button>'+sourceKinds.map((kind,i)=>`<button data-tool="${kind}" aria-pressed="false">${escape(siteNames[i])}</button>`).join('');
  $('creator-buildings').innerHTML=catalog.buildings.map(b=>`<button data-tool="${b.id}" aria-pressed="false"><canvas width="154" height="100" data-palette="${b.id}" aria-hidden="true"></canvas><span>${escape(title(b.id))}</span></button>`).join('');
  for(const canvas of document.querySelectorAll('[data-palette]')){const key=canvas.dataset.palette;paintIcon(canvas,key,art.images[key],allBuildingArt[key]);}
  $('creator-rules').innerHTML=Object.entries(ruleNames).map(([key,label])=>`<label class="creator-rule"><input id="creator-rule-${key}" type="checkbox" data-rule="${key}"> ${escape(label)}</label>`).join('');
  for(const h of catalog.habitats)$('creator-habitat').append(new Option(h.name,h.key));
  for(const species of catalog.nature)$('creator-species').append(new Option(species.name,species.key));map.natureSpecies=catalog.nature[0];map.natureSize=1;
  $('creator-examples').innerHTML=exampleScenarios.map(e=>`<button data-example="${escape(e.id)}"><b>${escape(e.title)}</b><small>${escape(e.biome)} · ${escape(e.summary)}</small></button>`).join('');
  $('creator-biomes').innerHTML=catalog.biomes.map(b=>`<button type="button" data-biome="${b.id}" aria-pressed="${b.id===newBiome}"><img src="./art/${b.id==='mata-atlantica'?'mata-atlantica-atlas.png':b.id==='cerrado'?'cerrado-vegetation-v1.png':'caatinga-vegetation-v1.png'}" alt=""><b>${escape(b.name)}</b><small>${escape(b.summary)}</small></button>`).join('');
  equipmentEditor=new EquipmentEditor($('creator-equipment-fields'),{engine,catalog:catalog.equipment,change,focus:(x,y)=>map.centerAt(x,y)});
  routesEditor=new RoutesEditor($('creator-routes-fields'),{engine,Game,catalog,change,buildingName:title,notify:toast,focus:(x,y)=>map.centerAt(x,y),select:id=>{setTool('select');if(id)map.selectRoute(id);else map.select(null);},preview:plan=>{if(!plan&&!map.utilityPreview)return;map.utilityPreview=plan;map.render();},draw:()=>setTool('route-path')});
  liquidsEditor=new LiquidsEditor($('creator-liquids-fields'),{catalog,engine,change,undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo}),source:()=>({id:current.id,definition:current.doc.value,revision:current.doc.revision}),notify:toast});
  suppliesEditor=new SuppliesEditor($('creator-supply-locations'),{catalog,engine,change,undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo}),source:()=>({id:current.id,definition:current.doc.value,revision:current.doc.revision}),notify:toast});
  regionsEditor=new RegionsEditor($('creator-regions-fields'),{change,maximum:catalog.max_regions,draw:()=>setTool('region'),focus:r=>map.centerAt(r.x+(r.width-1)/2,r.y+(r.height-1)/2)});
  journalEditor=new JournalEditor($('creator-journal-fields'),{catalog,change,undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo})});
  relationshipsEditor=new RelationshipsEditor($('creator-relationships-fields'),{presets:catalog.resident_presets,art,change});
  const residentPresets=new ResidentPresetLibrary({library,engine,art,presets:catalog.resident_presets,maximum:catalog.max_residents,source:()=>({id:current.id,revision:current.doc.revision,definition:current.doc.value}),change,notify:toast});
  residentsEditor=new ResidentsEditor($('creator-residents-fields'),{presets:catalog.resident_presets,occupations:catalog.occupations,personality:catalog.resident_personality,experience:catalog.resident_experience,appearances:catalog.resident_appearances,maximum:catalog.max_residents,art,catalog,undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo}),change,source:()=>current.doc.value,placeStart:id=>{map.placingResident=id;setTool('resident-start');map.selectResident(id);},locateStart:(id,position)=>{setTool('select');map.selectResident(id);map.centerAt(...position);},savePreset:person=>residentPresets.save(person),openPresets:()=>residentPresets.open()});
  weatherEditor=new WeatherEditor($('creator-weather-fields'),{defaults:catalog.weather,biomes:catalog.biomes,change});
  geologyEditor=new GeologyEditor($('creator-geology-fields'),{change,center:()=>map.view.center,defaults:JSON.parse(engine.scenario_template('story')).map.deposits,focus:p=>{map.centerAt(p.x+(p.width-1)/2,p.y+(p.height-1)/2);$('creator-land-layer').value=p.material;$('creator-land-layer').dispatchEvent(new Event('change'));}});
  biomeEditor=new BiomeEditor($('creator-biome-setting-fields'),{catalog,art,Game,change,notify:toast,source:()=>({id:current.id,revision:current.doc.revision,definition:report.ok?freezeCreation(current.doc.value,{terrain:terrainBase,snapshot:map.snapshot,catalog}):current.doc.value})});
  workspaces=new Workspaces({change:key=>{if(!current)return;map.cancelGesture();map.view.workspace=key;if(!['select','pan','move','erase'].includes(map.view.tool))setTool('select');map.viewChanged(map.state);}});
  wire();const id=new URLSearchParams(location.search).get('project');
  if(id){const record=await library.getProject(id);if(record)await openProject(record);else{await showLibrary();$('creator-library-status').textContent='This creation is no longer in the library. Independent villages remain available.';}}
  else await showLibrary();
  document.body.dataset.creatorReady='true';
}catch(error){status('The workshop could not open');toast(error.message);}
