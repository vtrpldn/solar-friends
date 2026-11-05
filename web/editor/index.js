import {showJournalReading} from './journal-reading.js';
import {RuleEditor} from './rule-presets.js';
import {prepareNightInspection} from './prepare-inspection.js';
import {prepareDraft,prepareRecoveredDraft} from './prepare-draft.js';
import {heavyDraft} from './heavy-draft.js';
import {prepareEdit} from './prepare-edit.js';
import {applyRoadStroke} from './road-placement.js';
import {applyAssetPlacement} from './asset-placement.js';
import {wrapDialogTab} from './dialog-focus.js';
import {parseImportObject} from './import-object.js';
import {LandscapeRegeneration} from './landscape-regeneration.js';
import {removalMarkup} from './removal-impact.js';
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
import {restoreEditableCheckpoint} from './draft-checkpoint.js';
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
import {RelationshipsEditor} from './relationships.js';
import {ResidentsEditor} from './residents.js';
import {BiomeEditor} from './biome-editor.js';
import {WeatherEditor} from './weather.js';
import {freezeCreation,MAX_CREATION_BYTES} from './files.js';
import {resolvedNature,plantStroke,thinStroke,placeNatureObject} from './nature.js';
import {riverBank} from '../terrain.js';
import {GeologyEditor} from './geology.js';
import {EditorMinimap} from './minimap.js';
import {landLayers,landTiles} from '../land-layers.js';
import {newStartingBuilding,planBuildingCopy,moveBuildings,placeBuildingCopy} from './objects.js';
import {clearingStroke,riverStroke} from './brush.js';
import init,{Game} from '../pkg/solar_friends.js';
import {ContentLibrary,LibraryConflict} from '../content-library.js';
import {EditorDocument} from './document.js';
import {EditorMap,loadEditorArt,MIN_EDITOR_ZOOM} from './map-view.js';
import {allBuildingArt} from '../building-art.js?v=night-1';
import {paintIcon} from '../build-menu.js';

const $=id=>document.getElementById(id),library=new ContentLibrary();
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>structuredClone(value),title=kind=>allBuildingArt[kind]?.name||kind;
let newBiome="mata-atlantica";
let libraryDiscovery,mapSharing,workspaces;
let current,map,engine,catalog,art,saveTimer,toastTimer,busy=false;
const waterLayers={water:{legend:'Owned fresh water · green: open, stocked and reachable; gold: empty; red: closed or unreachable. Labels show unclaimed units and friends with a route. Neighbour service and future deliveries are excluded.'},walkability:{legend:"Green · connected to camp. Gold · clear but disconnected. Red · blocked cell centre. Footprints and riverbanks use native walking rules; this does not reserve space from other residents."},banks:{legend:"Blue · native protected banks. Keep ordinary buildings and paths inland."},hydro:{legend:"Gold · native river segments aligned with the generator artwork. Buildings, worker access and free space are checked when placing."}};
let minimap,ruleEditor,equipmentEditor,routesEditor,liquidsEditor,suppliesEditor,regionsEditor,journalEditor,relationshipsEditor,residentsEditor,biomeEditor,weatherEditor,geologyEditor,geometry=null,terrainBase=null,inspectorSelection='';
let expandedReview=false,outlook;
let landReport=null,landReportKey=null,mapPreviewKey=null,landSampleKey='',hoverCell=null;
let accessReport=null,accessReportKey=null,waterAccessReport=null,waterAccessKey=null;
let inspectionSerial=0,playerJournal=null;
let releasePublication=null,preparedEdit=null,engineDefinition=null;
let saving=Promise.resolve(),report={ok:false,issues:[]};
const recoveryKey=id=>`solar-friends-project-recovery:${id}`;
function toast(text){$('creator-toast').textContent=text;$('creator-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('creator-toast').hidden=true,6000);}
function status(text){$('creator-save-status').textContent=text;$('creator-recovery-copy').hidden=!(current?.conflicted||current?.preserveDamagedRecord);}
function markPublicationConflict(id){if(current?.id===id){current.conflicted=true;status('Changed in another tab · save a copy');}}
function stepHistory(redo=false){
  if(!current||busy)return false;if(map?.cancelGesture())return true;
  const target=current.doc.historyTarget(redo);if(!target)return false;
  if(heavyDraft(current.doc.value)||heavyDraft(target)){void changePrepared(redo?'Redo edit':'Undo edit',null,{target,history:redo?'redo':'undo',allowInvalid:true});return true;}
  return redo?current.doc.redo():current.doc.undo();
}
async function download(definition){
  const file=await prepareCreationExport(definition,report.ok?{terrain:terrainBase,snapshot:map.snapshot,catalog}:null);
  const url=URL.createObjectURL(new Blob([file],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=(definition.title||'our-village').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.solar-scenario';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function cacheRecovery(ctx,checkpoint,view){try{const raw=JSON.stringify({storageRevision:ctx.storageRevision,checkpoint,view});sessionStorage.setItem(recoveryKey(ctx.id),raw);return raw;}catch{/* The durable library remains the primary save. */return null;}}
function clearSavedToast(){if($('creator-toast').textContent==='Your creation is saved.'){$('creator-toast').hidden=true;clearTimeout(toastTimer);}}
function scheduleSave(){clearSavedToast();clearTimeout(saveTimer);if(!current?.conflicted)saveTimer=setTimeout(()=>{save({automatic:true}).catch(()=>{});},450);}
function previewOf(definition,snapshot){try{return creationThumbnail(definition,snapshot,art);}catch{return null;}}
function previewMarkup(kind,id){return `<span class="creator-preview" data-preview-kind="${kind}" data-preview-id="${escape(id)}"><span>No preview yet</span></span>`;}
function save({automatic=true}={}){
  clearSavedToast();clearTimeout(saveTimer);
  if(!current)return Promise.resolve();
  // Only explicit Save controls acknowledge replacement of a damaged
  // original. Navigation, previews and other implicit saves keep a separate
  // session checkpoint so the original remains available for backup.
  const ctx=current,view=map.state,snapshot=map.snapshot,terrainLoading=map.terrainLoading,valid=report.ok;
  const requestKey=JSON.stringify([ctx.doc.revision,view,ctx.artRevision??0,terrainLoading,automatic&&ctx.preserveDamagedRecord===true]);
  const pending=ctx.pendingSaves??=new Map();
  if(pending.has(requestKey))return pending.get(requestKey);
  const preparation=ctx.doc.checkpointAsync();
  // Observe preparation failures even while an earlier durable save is queued.
  preparation.catch(()=>{});
  if(current===ctx)status('Saving…');
  const operation=saving.catch(()=>{}).then(async()=>{
    const checkpoint=await preparation;
    if(automatic&&ctx.preserveDamagedRecord){
      if(cacheRecovery(ctx,checkpoint,view)===null)throw Error('Could not keep recovered edits separately. Export or save a copy before leaving this creation.');
      if(ctx.conflicted)throw new LibraryConflict();
      if(current===ctx)status('Recovered checkpoint · original preserved');
      return ctx.record;
    }
    if(ctx.thumbnailRevision!==checkpoint.revision){
      // Snapshot and terrain readiness belong to the captured revision. Edits
      // made while preparation yields must not paint a newer world into it.
      if(terrainLoading){ctx.thumbnail=undefined;ctx.thumbnailRevision=null;}
      else{ctx.thumbnail=valid?previewOf(checkpoint.definition,snapshot):null;ctx.thumbnailRevision=checkpoint.revision;}
    }
    const thumbnail=ctx.thumbnail,recoveryBytes=cacheRecovery(ctx,checkpoint,view);
    if(ctx.conflicted)throw new LibraryConflict();
    const record=await library.savePreparedProject({id:ctx.id,checkpoint,view,attribution:ctx.record?.attribution,thumbnail},ctx.storageRevision);
    ctx.storageRevision=record.revision;ctx.record=record;ctx.doc.markSaved(checkpoint);ctx.preserveDamagedRecord=false;
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
// Heavy edits and history prepare separately. Invalid history targets retain
// the last valid preview; valid checkpoints install only for the same revision.
async function changePrepared(label,edit,{target=null,history=null,allowInvalid=false,preflight=null}={}){
  if(!current||busy)return false;
  const ctx=current,revision=ctx.doc.revision,draft=target??ctx.doc.value;
  busy=true;clearTimeout(toastTimer);$('creator-toast').hidden=true;status('Preparing edit…');
  let previous,installed=false,committed=false;
  try{
    edit?.(draft);
    const prepared=await prepareEdit(draft,{allowInvalid,preflight});
    if(current!==ctx||ctx.doc.revision!==revision)throw Error('The draft changed. Try this edit again.');
    if(prepared.validation.ok){
      previous=engine.snapshot();
      if(!engine.restore(prepared.snapshot))throw Error('The prepared edit could not be installed. Your draft is unchanged.');
      installed=true;
    }
    busy=false;
    preparedEdit={key:canonical(draft),report:prepared.validation};
    committed=history?ctx.doc[history]():ctx.doc.transact(label,d=>{for(const key of Object.keys(d))if(!Object.hasOwn(draft,key))delete d[key];Object.assign(d,draft);});return committed;
  }catch(error){toast(error.message);return false;}
  finally{
    preparedEdit=null;busy=false;
    if(installed&&!committed&&previous&&!engine.restore(previous))throw Error('The previous preview could not be restored. Reload the saved draft.');
    if(current===ctx&&!committed)status(ctx.doc.dirty||ctx.viewDirty?'Changes to save':'Saved on this device');
  }
}
async function changeMap(label,edit,{force=false,...options}={}){
  if(!current||busy)return false;
  if(force||heavyDraft(current.doc.value))return changePrepared(label,edit,{allowInvalid:!options.valid,preflight:options.preflight});
  return change(label,edit,options);
}
async function changeSelection(label,edit,options){
  const ctx=current,committed=await changeMap(label,edit,options);
  if(!committed&&current===ctx)renderSelection();
  return committed;
}
// Inspector handlers do not depend on an immediate placement result. Keep their
// old field values visible if a heavy preparation is cancelled or fails.
function changeInspector(label,edit,restore){
  if(!current||busy)return;
  const ctx=current;
  if(heavyDraft(ctx.doc.value))void changePrepared(label,edit,{allowInvalid:true}).then(committed=>{if(!committed&&current===ctx)restore?.();});
  else if(!change(label,edit))restore?.();
}
function field(id,value){if(document.activeElement!==$(id))$(id).value=value;}
function refresh(){
  if(!current)return;
  const d=current.doc.value;
  if(preparedEdit&&preparedEdit.key===canonical(d)){
    report=preparedEdit.report;preparedEdit=null;
  }else report=JSON.parse(engine.load_scenario(JSON.stringify(d)));
  playerJournal=report.ok?JSON.parse(engine.scenario_journal()):null;
  if(report.ok){engineDefinition=JSON.stringify(d);report.roles=playerJournal?.roles??[];}
  const snapshot=JSON.parse(engine.report_state());
  const nextMapKey=landPreviewKey(d),nextLandKey=report.ok?nextMapKey:null;
  const landChanged=!landReport||(report.ok&&nextLandKey!==landReportKey);
  if(landChanged){
    terrainBase=JSON.parse(engine.terrain_template());
    landReport=JSON.parse(engine.land_report());geometry=JSON.parse(engine.world_geometry());
    landReportKey=nextLandKey;
  }
  landSampleKey='';
  const inspectionChanged=!!map.inspection;
  if(inspectionChanged){inspectionSerial++;map.inspection=null;$('creator-inspection').value='day';$('creator-inspection-note').hidden=true;}
  map.landOverlay=overlayTiles();
  map.set(d,snapshot,undefined,{paint:inspectionChanged||!report.ok||nextMapKey!==mapPreviewKey});mapPreviewKey=nextMapKey;
  minimap.set(landReport,geometry);
  geologyEditor.render(d,landReport);
  weatherEditor.render(d, false, report.ok ? snapshot.environment.weather?.forecast?.[0] ?? null : null);
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
  ruleEditor.render(d);
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
  workspaces?.context(map.selection().length||map.view.selectedResident||map.view.selectedRoute||map.view.selectedBank||map.view.selectedSite||map.view.selectedNature);
  const d=current.doc.value,b=d.start.buildings.find(b=>b.id===map.view.selected),panel=$('creator-selection');
  const person=(d.start.residents??catalog.resident_presets).find(p=>p.id===map.view.selectedResident);
  if(person){panel.innerHTML=`<h2>${escape(person.name)}</h2><p>Starting circumstances belong to this scenario. Needs and routines govern their actions when playing.</p><button data-edit-start>Edit arrival</button>`;return;}
  const route=d.start.routes?.find(r=>r.id===map.view.selectedRoute);
  if(route){panel.innerHTML=`<h2>${escape(routeNames[route.kind])}</h2><p>${route.cells.length} corridor cells · ${route.state==='completed'?'Installed kit':'Parts and resident work needed'}</p><button data-route-inspect>Edit connection</button>`;return;}
  const bank=d.start.batteries?.find(p=>p.id===map.view.selectedBank);
  if(bank){const focus=document.activeElement?.dataset.startBank;panel.innerHTML=bankFields(bank,catalog.batteries);if(focus)[...panel.querySelectorAll('[data-start-bank]')].find(e=>e.dataset.startBank===focus)?.focus({preventScroll:true});return;}
  const site=d.start.resource_sites?.find(s=>s.id===map.view.selectedSite);
  if(site){const focus=document.activeElement?.dataset.startSite;panel.innerHTML=siteFields(site,catalog.resource_sites);if(focus)[...panel.querySelectorAll('[data-start-site]')].find(e=>e.dataset.startSite===focus)?.focus({preventScroll:true});return;}
  const natural=map.naturalObjects?.find(p=>p.id===map.view.selectedNature),species=catalog.nature.find(p=>p.key===natural?.species);
  if(natural&&species){const focus=document.activeElement?.dataset.naturalField;panel.innerHTML=`<h2>${escape(species.name)}</h2><p>Natural scenery · moving or removing it grants no harvested materials.</p><div class="creator-coordinates">${['x','y'].map(k=>`<label class="creator-field">${k==='x'?'Column':'Row'}<input data-natural-field="${k}" type="number" min="0" max="63" step="any" value="${escape(natural[k])}"></label>`).join('')}</div><label class="creator-field">Size<input data-natural-field="size" type="number" min="${species.min_size}" max="${species.max_size}" step="any" value="${natural.size}"></label><div class="creator-selection-actions"><button data-nature-action="move">Move on map</button><button data-nature-action="duplicate">Duplicate</button><button data-nature-action="remove">Remove</button></div>`;if(focus)panel.querySelector(`[data-natural-field="${focus}"]`)?.focus({preventScroll:true});return;}
  if(!b){panel.innerHTML='<h2>Our property</h2><p>Select a building, plant, rock, battery bank or material plot to inspect it. Choose Move to carry it to another cell.</p>';return;}
  if(map.selection().length>1){panel.innerHTML=`<h2>${map.selection().length} buildings</h2><p>Move this group together, or place a copy with its supplies, equipment and internal utility connections. Connections outside the group stay with the originals. Shift-click toggles buildings in the group.</p>${removalMarkup(d,{buildings:map.selection()})}<div class="creator-selection-actions"><button data-selection-action="move">Move group</button><button data-selection-action="duplicate">Copy group</button><button data-selection-action="remove">Remove group</button></div>`;return;}
  const cropFocus=document.activeElement?.dataset.startCrop,orchardFocus=document.activeElement?.dataset.startOrchard,animalFocus=document.activeElement?.dataset.startAnimal,recoveryFocus=document.activeElement?.matches('[data-start-recovery]'),bankFocus=document.activeElement?.dataset.buildingBank;
  const entry=catalog.buildings.find(e=>e.id===b.kind),appearances=(entry?.appearances||[]).filter(key=>key.startsWith('adobe-')===(b.recipe==='adobe'));
  panel.innerHTML=`<h2>${escape(title(b.kind))}</h2><div class="creator-coordinates"><div class="creator-field"><label for="creator-object-x">Column</label><input id="creator-object-x" type="number" min="1" max="62" step="1" value="${b.x}"></div><div class="creator-field"><label for="creator-object-y">Row</label><input id="creator-object-y" type="number" min="1" max="62" step="1" value="${b.y}"></div></div><div class="creator-field"><label for="creator-object-state">Starts as</label><select id="creator-object-state"><option value="completed" ${b.state==='completed'?'selected':''}>Completed building</option><option value="blueprint" ${b.state==='blueprint'?'selected':''}>Construction project</option></select></div><div class="creator-field"><label for="creator-object-recipe">Construction materials</label><select id="creator-object-recipe">${(entry?.recipes||[]).map(key=>`<option value="${key}" ${b.recipe===key?'selected':''}>${{standard:'Prepared materials',local:'Local materials',adobe:'Adobe and bamboo'}[key]}</option>`).join('')}</select></div>${appearances.length?`<div class="creator-field"><label for="creator-object-appearance">Appearance</label><select id="creator-object-appearance">${appearances.map(key=>`<option value="${key}" ${(b.appearance||'home')===key?'selected':''}>${escape(title(key))}</option>`).join('')}</select></div>`:''}${startingCropFields(b,catalog.farming)}${startingOrchardFields(b,catalog.orchards)}${startingAnimalFields(b,catalog.animals)}${buildingBatteryFields(b,catalog.batteries)}${startingRecoveryFields(b,entry)}${removalMarkup(d,{buildings:[b.id]})}<div class="creator-selection-actions"><button data-selection-action="move">Move on map</button><button data-selection-action="duplicate">Duplicate</button><button data-selection-action="remove">Remove</button></div>`;
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
  const workspace=['road','route-path','battery-bank','move-bank','copy-bank','move-site','copy-site','duplicate',...sourceKinds].includes(tool)||allBuildingArt[tool]?'village':['habitat','nature','thin-nature','move-nature','copy-nature','river','meadow','camp','camera'].includes(tool)?'land':tool==='region'?'story':tool==='resident-start'?'people':null;
  if(workspace)workspaces?.select(workspace);
  if(tool!=='copy-nature')map.natureCopy=null;
  map.setTool(tool);landSampleKey='';inspectGround(hoverCell);
  const sourceMaterial=sourceKinds.indexOf(tool);if(sourceMaterial>=2){$('creator-land-layer').value=catalog.resource_sites.materials[sourceMaterial];$('creator-land-layer').dispatchEvent(new Event('change'));}
  if(tool==='habitat'){revealWorkspaceSection($('creator-ground'));$('creator-ground').open=true;$('creator-ground').scrollIntoView({block:'nearest'});}
  for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));
  $('creator-hint').textContent=['move-nature','copy-nature'].includes(tool)?'Choose clear ground for this natural object · Esc cancels':tool==='route-path'?'Drag from a supply port to a destination port · each stroke replaces the proposed corridor · Esc cancels':['battery-bank','move-bank','copy-bank'].includes(tool)?'Click a clear inland cell for the battery bank · Esc cancels':sourceKinds.includes(tool)?`Place ${siteNames[sourceKinds.indexOf(tool)].toLowerCase()} · click a cell · Esc to select`:['move-site','copy-site'].includes(tool)?'Click a cell to place this material plot · Esc cancels':allBuildingArt[tool]?`Place ${title(tool).toLowerCase()} · click a cell · Esc to select`:({'resident-start':'Choose clear ground with space from other residents · click to place · Esc cancels',select:'Select · Shift-click or Shift-drag to add buildings · drag to pan · Delete removes the selection',pan:'Drag to move around the property',move:'Drag a building group, natural object, battery bank or material plot to move it',duplicate:'Click a cell to place the copied group and its starting supplies · Esc cancels',road:'Drag to paint one path · the whole stroke can be undone',habitat:'Drag to paint habitat and baseline soil · existing plants stay in place · one undo step',nature:'Drag to plant a spaced cluster · brush width controls its area · one undo step','thin-nature':'Drag to remove natural objects · no materials are granted · one undo step',river:'Drag to shape the channel · steep bends cannot host hydro · one undo step',meadow:'Drag to clear vegetation · soil disturbance stays low · one undo step',erase:'Click a building, battery bank, material plot, connection, road or natural object to remove it',camp:'Click to move the arrival camp',camera:'Click to choose the starting camera view'})[tool];
}
async function removeBuilding(id){
  const ids=map.selection().includes(id)?map.selection():[id];
  if(!await changeMap(ids.length>1?'Remove building group':'Remove building',d=>{d.start.buildings=d.start.buildings.filter(b=>!ids.includes(b.id));}))return false;
  map.select(null);
  if(current.doc.value.start.liquids?.some(p=>ids.includes(p.owner.building))){revealWorkspaceSection($('creator-liquids'));$('creator-liquids').open=true;toast('Starting liquids still reference removed containers. Choose compatible storage before testing.');}
  if(current.doc.value.start.inventories.some(p=>ids.includes(p.owner.building))){revealWorkspaceSection($('creator-supplies'));$('creator-supplies').open=true;toast('Starting supplies still reference removed buildings. Choose new supply locations before testing.');}
}
async function removeNatureObject(id){
  const objects=resolvedNature(current.doc.value,map.snapshot,catalog.nature);
  if(!objects.some(p=>p.id===id))return;
  if(await changeMap('Remove natural object',d=>{d.map.nature=objects.filter(p=>p.id!==id);}))map.select(null);
}
async function editNatureObject(type,x,y,size){
  const objects=resolvedNature(current.doc.value,map.snapshot,catalog.nature),copy=type==='copy-nature',source=copy?map.natureCopy:objects.find(p=>p.id===map.view.selectedNature);
  if(!source)return false;
  try{
    const next=placeNatureObject(current.doc.value,objects,catalog.nature,source,x,y,size??source.size,{copy}),id=copy?next.at(-1).id:source.id;
    if(await changeMap(copy?'Copy natural object':'Move or resize natural object',d=>{d.map.nature=next;},{valid:true})){map.natureCopy=null;setTool('select');map.selectNature(id);return true;}
  }catch(error){toast(error.message);}
  renderSelection();return false;
}
async function mapAction(action){
  if(!current||busy)return;
  if(['move-nature','copy-nature'].includes(action.type)){editNatureObject(action.type,action.x,action.y);return;}
  if(action.type==='resident-start'){const id=action.resident??map.placingResident;if(!id)return;if(await changeMap('Choose resident starting place',d=>{ensureStart(d,id).position=[action.x,action.y];},{valid:true})){map.placingResident=null;setTool('select');map.selectResident(id);residentsEditor.openArrival(id);}return;}
  if(action.type==='route-path'){routesEditor.stroke(action.cells);return;}
  if(action.type==='battery-bank'){
    const bank=newStartingBank(action.x,action.y);if(await changeMap('Place battery bank',d=>{applyAssetPlacement(d,{collection:'batteries',asset:bank},action.x,action.y);},{valid:true}))map.selectBank(bank.id);
  }else if(['move-bank','copy-bank'].includes(action.type)){
    const original=action.type==='copy-bank'?map.bankCopy:current.doc.value.start.batteries?.find(b=>b.id===map.view.selectedBank);if(!original)return;
    const bank={...clone(original),x:action.x,y:action.y};if(action.type==='copy-bank')bank.id=crypto.randomUUID();
    if(await changeMap(action.type==='copy-bank'?'Copy battery bank':'Move battery bank',d=>{applyAssetPlacement(d,{collection:'batteries',asset:bank,replace:action.type==='move-bank',copyFrom:action.type==='copy-bank'?original.id:null},action.x,action.y);},{valid:true})){map.bankCopy=null;setTool('select');map.selectBank(bank.id);}
  }else if(sourceKinds.includes(action.type)){
    const material=catalog.resource_sites.materials[sourceKinds.indexOf(action.type)],site=newStartingSite(material,action.x,action.y);
    if(await changeMap('Place '+siteNames[sourceKinds.indexOf(action.type)],d=>{applyAssetPlacement(d,{collection:'resource_sites',asset:site},action.x,action.y);},{valid:true}))map.selectSite(site.id);
  }
  else if(['move-site','copy-site'].includes(action.type)){
    const source=action.type==='copy-site'?map.siteCopy:current.doc.value.start.resource_sites?.find(s=>s.id===map.view.selectedSite);if(!source)return;
    const site=clone(source);site.x=action.x;site.y=action.y;if(action.type==='copy-site')site.id=crypto.randomUUID();
    if(await changeMap(action.type==='copy-site'?'Copy material plot':'Move material plot',d=>{applyAssetPlacement(d,{collection:'resource_sites',asset:site,replace:action.type==='move-site'},action.x,action.y);},{valid:true})){setTool('select');map.selectSite(site.id);map.siteCopy=null;}
  }
  else if(action.type==='region'){if((current.doc.value.map.regions?.length??0)>=catalog.max_regions){toast('Use up to 32 named regions.');return;}const id='region-'+crypto.randomUUID();if(await changeMap('Draw named region',d=>{(d.map.regions??=[]).push({id,title:'New region',...action.rectangle});})){revealWorkspaceSection($('creator-regions'));$('creator-regions').open=true;regionsEditor.open(id);}}
  else if(action.type==='road')await changeMap('Paint a road',d=>applyRoadStroke(d,action.cells),{valid:true});
  else if(action.type==='habitat'){
    const preset=catalog.habitats.find(h=>h.key===$('creator-habitat').value),start=Math.floor(action.size/2);
    await changeMap('Paint habitat and soil',d=>{d.map.terrain=Array.from({length:4096},(_,i)=>d.map.terrain?.[i]||terrainBase[i]);for(const [x,y]of action.cells)for(let a=x-start;a<x-start+action.size;a++)for(let b=y-start;b<y-start+action.size;b++)if(a>=0&&a<64&&b>=0&&b<64&&!riverBank(a,b,d.map))d.map.terrain[b*64+a]={habitat:preset.key,fertility:preset.fertility,retention:preset.retention,cover:preset.cover};});
  }
  else if(action.type==='nature'){
    const definition=current.doc.value,existing=resolvedNature(definition,map.snapshot,catalog.nature),added=plantStroke(definition,existing,catalog.nature,map.natureSpecies.key,map.natureSize||1,action.cells,action.size,undefined,map.natureDensity);
    if(!added.length){toast('Choose inland ground with room between plants, away from buildings, roads and the arrival camp.');return;}
    await changeMap('Plant natural cluster',d=>{d.map.nature=[...existing,...added];});
  }
  else if(action.type==='thin-nature'){const objects=resolvedNature(current.doc.value,map.snapshot,catalog.nature);await changeMap('Thin natural vegetation',d=>{d.map.nature=thinStroke(objects,action.cells,action.size);});}
  else if(action.type==='river')await changeMap('Shape river course',d=>{d.map.river=riverStroke(d.map.river,action.cells);if(d.map.nature)d.map.nature=d.map.nature.filter(p=>!riverBank(Math.floor(p.x),Math.floor(p.y),d.map));});
  else if(action.type==='meadow')await changeMap('Clear a meadow',d=>{d.map.clearings=clearingStroke(d.map.clearings,action.cells,action.size);if(d.map.nature)d.map.nature=d.map.nature.filter(p=>!action.cells.some(([x,y])=>{const left=x-Math.floor(action.size/2)-.5,top=y-Math.floor(action.size/2)-.5;return p.x>=left&&p.x<left+action.size&&p.y>=top&&p.y<top+action.size;}));},{valid:true});
  else if(action.type==='move'){
    const label=action.ids.length>1?'Move building group':'Move building',edit=d=>moveBuildings(d,action.ids,action.dx,action.dy);
    await changeMap(label,edit,{valid:true,force:action.ids.length>32});
  }
  else if(action.type==='duplicate'&&map.copy){const copy=map.copy,anchor=copy.buildings[0];if(await changeMap('Copy building group',d=>placeBuildingCopy(d,copy,action.x-anchor.x,action.y-anchor.y),{valid:true})){setTool('select');map.select(null);for(const b of copy.buildings)map.select(b.id,true);map.copy=null;}}
  else if(action.type==='erase'){
    const bank=hitStartingBank(current.doc.value,action.x,action.y),site=hitStartingSite(current.doc.value,action.x,action.y),route=sceneRouteAt(current.doc.value,map.view,action.x,action.y);
    if(bank)await changeMap('Remove battery bank',d=>{d.start.batteries=d.start.batteries.filter(p=>p.id!==bank.id);});
    else if(site)await changeMap('Remove material plot',d=>{d.start.resource_sites=d.start.resource_sites.filter(s=>s.id!==site.id);});
    else if(action.id)removeBuilding(action.id);
    else if(route){const ids=dependentRoutes(current.doc.value,route.id);await changeMap('Remove utility connection',d=>{d.start.routes=d.start.routes.filter(r=>!ids.has(r.id));});}
    else if(action.natureId&&!current.doc.value.start.roads.some(([x,y])=>x===action.x&&y===action.y))removeNatureObject(action.natureId);
    else await changeMap('Remove a road',d=>{d.start.roads=d.start.roads.filter(([x,y])=>x!==action.x||y!==action.y);});
  }else if(action.type==='camp')await changeMap('Move arrival camp',d=>{d.map.camp=[action.x,action.y];},{valid:true});
  else if(action.type==='camera')await changeMap('Choose starting view',d=>{d.map.camera=[action.x,action.y];},{valid:true});
  else if(allBuildingArt[action.type]){
    const id=crypto.randomUUID();
    if(await changeMap('Place '+title(action.type),d=>{d.start.buildings.push(newStartingBuilding(action.type,action.x,action.y,id));},{valid:true}))map.select(id);
  }
}
function attach(definition,{id,revision=null,checkpoint=null,view=null,record=null,restored=null,prepared=null}={}){
  map.cancelGesture({paint:false});
  clearTimeout(saveTimer);expandedReview=false;
  const doc=restored??(checkpoint?EditorDocument.restore(checkpoint):new EditorDocument(definition));
  if(prepared?.snapshot&&!engine.restore(prepared.snapshot))throw Error('The prepared creation could not be installed. Your saved data is unchanged.');
  current={id:id||definition.id,doc,storageRevision:revision,record,viewDirty:false,conflicted:false};
  const ctx=current;
  doc.addEventListener('change',()=>{if(current===ctx){refresh();scheduleSave();}});
  map.view={center:clone(doc.value.map.camera),zoom:1.3,selected:null,selectedResident:null,selectedRoute:null,selectedBank:null,selectedSite:null,selectedNature:null,selection:[],tool:'select',grid:true,layer:'none',utilityKind:'all',regionId:'all',habitatPreset:'flower-meadow',workspace:'land'};
  if(view){
    const center=Array.isArray(view.center)&&view.center.length===2&&view.center.every(Number.isFinite)?view.center:map.view.center;
    const tool=['select','pan','move','road','meadow','river','nature','thin-nature','habitat','camp','camera','erase','battery-bank',...sourceKinds,...catalog.buildings.map(b=>b.id)].includes(view.tool)?view.tool:'select';
    map.view={center:clone(center),zoom:Number.isFinite(view.zoom)?Math.max(MIN_EDITOR_ZOOM,Math.min(3,view.zoom)):1.3,selectedResident:typeof view.selectedResident==='string'?view.selectedResident:null,selectedRoute:typeof view.selectedRoute==='string'?view.selectedRoute:null,selectedBank:typeof view.selectedBank==='string'?view.selectedBank:null,selectedNature:typeof view.selectedNature==='string'?view.selectedNature:null,selectedSite:typeof view.selectedSite==='string'?view.selectedSite:null,selected:typeof view.selected==='string'?view.selected:null,selection:Array.isArray(view.selection)?view.selection.filter(id=>typeof id==='string').slice(0,256):[],tool,habitatPreset:catalog.habitats.some(h=>h.key===view.habitatPreset)?view.habitatPreset:'flower-meadow',workspace:Object.hasOwn(workspaceNames,view.workspace)?view.workspace:'land',layer:Object.hasOwn(sceneLayers,view.layer)||Object.hasOwn(landLayers,view.layer)||Object.hasOwn(waterLayers,view.layer)?view.layer:'none',utilityKind:Object.hasOwn(routeNames,view.utilityKind)?view.utilityKind:'all',regionId:doc.value.map.regions?.some(r=>r.id===view.regionId)?view.regionId:'all',grid:view.grid!==false};
  }
  map.natureDensity=[.25,.5,1].includes(view?.natureDensity)?view.natureDensity:1;map.brushSize=[1,3,5,9].includes(view?.brushSize)?view.brushSize:3;map.natureSpecies=catalog.nature.find(s=>s.key===view?.natureSpeciesKey)||catalog.nature[0];map.natureSize=Number.isFinite(view?.natureSize)?Math.max(map.natureSpecies.min_size,Math.min(map.natureSpecies.max_size,view.natureSize)):1;
  $('creator-habitat').value=map.view.habitatPreset;
  $('creator-nature-density').value=map.natureDensity;$('creator-brush-size').value=map.brushSize;$('creator-species').value=map.natureSpecies.key;$('creator-nature-size').value=map.natureSize;$('creator-nature-scale').textContent=map.natureSize.toFixed(2)+'×';
  history.replaceState(null,'',`./editor.html?project=${encodeURIComponent(ctx.id)}`);
  $('creator-library-dialog').close();$('creator-library-title').textContent='Creation library';
  if(prepared)preparedEdit={key:canonical(doc.value),report:prepared.validation};
  try{refresh();}finally{preparedEdit=null;}setTool(map.view.tool);workspaces.select(map.view.workspace,{notify:false});$('creator-land-layer').value=map.view.layer;$('creator-land-legend').textContent=overlayLegend();$('creator-grid').checked=map.view.grid;
  ctx.viewDirty=revision===null; // Restoring a durable view is not a new player edit.
  status(revision===null?'New creation · save to keep it':'Saved on this device');
  if(doc.historyRecovered)toast('The creation was recovered. Its damaged undo history was cleared.');
}
async function openProject(record){
  const restore=async checkpoint=>{const count=(checkpoint.history?.past?.length??0)+(checkpoint.history?.future?.length??0),large=heavyDraft(checkpoint.definition)||count>=16||JSON.stringify(checkpoint.history??{}).length>=128*1024;return large?prepareDraft(checkpoint):{doc:restoreEditableCheckpoint(checkpoint,raw=>JSON.parse(engine.validate_scenario(raw)))};};
  let checkpoint=record.checkpoint,view=record.view,recovered=false,previousRecovered=false,prepared;
  try{prepared=await restore(checkpoint);}catch(error){
    if(error.name==='AbortError')throw error;
    if(!record.previous?.checkpoint)throw Error('This creation could not load. Export its original data before replacing it.');
    checkpoint=record.previous.checkpoint;view=record.previous.view;prepared=await restore(checkpoint);recovered=true;previousRecovered=true;
  }
  try{
    const cached=JSON.parse(sessionStorage.getItem(recoveryKey(record.id))||'null');
    if(cached?.storageRevision===record.revision){const candidate=await restore(cached.checkpoint);prepared=candidate;recovered=JSON.stringify(cached.checkpoint)!==JSON.stringify(checkpoint)||JSON.stringify(cached.view)!==JSON.stringify(view);checkpoint=cached.checkpoint;view=cached.view;}
  }catch(error){if(error.name==='AbortError')throw error;/* Keep the last durable checkpoint. */}
  const latest=await library.getProject(record.id);if(!latest||latest.revision!==record.revision)throw new LibraryConflict();
  attach(checkpoint.definition,{id:record.id,revision:record.revision,checkpoint,view,record,restored:prepared.doc,prepared:prepared.validation?prepared:null});
  current.preserveDamagedRecord=previousRecovered;
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
  $('creator-replace-field').hidden=!current;
  const [projects,runs,releases,maps]=await Promise.all([library.listProjects(),library.listRuns(),library.listReleases(),library.listMaps()]);
  const backupSelect=$('creator-backup-entry'),selectedBackup=backupSelect.value,backupEntries=[['project',projects],['run',runs],['release',releases],['map',maps]].flatMap(([kind,entries])=>entries.filter(entry=>!entry.missingBody).map(entry=>new Option(`${{project:'Draft',run:'Village',release:'Scenario release',map:'Map'}[kind]} · ${entry.title??'Untitled'}`,JSON.stringify([kind,entry.id]))));
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
    return `<div class="creator-library-row creator-release-row" data-map="${escape(m.id)}">${previewMarkup('map',m.id)}<div><b>${escape(m.title)}</b><small>Version ${escape(m.contentRevision)} · ${escape(m.author)}</small><small>${compatible?'Land and climate · start a new scenario':'Needs another game version · original export remains available'}</small></div><div class="creator-release-actions"><button data-use-map="${escape(m.id)}" ${compatible?'':'disabled'}>Create scenario</button><button data-sandbox-map="${escape(m.id)}" ${compatible?'':'disabled'}>Sandbox</button><button data-rename-map="${escape(m.id)}" ${compatible?'':'disabled'}>Rename</button><button data-copy-map="${escape(m.id)}" ${compatible?'':'disabled'}>Copy</button><button data-export-map="${escape(m.id)}">Export</button><button class="creator-remove" data-remove-map="${escape(m.id)}" aria-label="Remove map ${escape(m.title)}">×</button></div></div>`;
  }).join('');
  const villages=runs.filter(r=>r.sessionKind==='scenario'||r.missingBody);
  $('creator-runs-heading').hidden=!villages.length;
  $('creator-run-list').innerHTML=villages.map(r=>r.missingBody?missingLibraryEntry('run',r):`<div class="creator-library-row">${previewMarkup('run',r.id)}<div><b>${escape(r.title)}</b><small>Independent village save</small>${r.residentBalance==='unrestricted'?'<small>Unrestricted starting skills</small>':''}</div><button data-continue-run="${escape(r.id)}">Continue</button><button data-rename-run="${escape(r.id)}">Rename</button><button data-backup-run="${escape(r.id)}" title="Keep the original village and previous snapshot">Backup</button><button class="creator-remove" data-remove-run="${escape(r.id)}" aria-label="Remove saved village ${escape(r.title)}">×</button></div>`).join('');
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
    try{const [kind,id]=JSON.parse($('creator-backup-entry').value),get={project:()=>library.getProject(id),run:()=>library.getRun(id),release:()=>library.getRelease(id),map:()=>library.getMap(id)}[kind];if(!get)throw Error('Choose a saved entry to back up.');downloadRecoveryRecord(kind,await get());$('creator-library-status').textContent='Original record backup downloaded. Saved content is unchanged; keep this file even if this game cannot open it.';}
    catch(error){$('creator-library-status').textContent=error.message;}finally{button.disabled=!$('creator-backup-entry').value;}
  };

  $('creator-repair-index').onclick=async e=>{
    e.stopPropagation();const button=e.currentTarget;button.disabled=true;
    try{const result=await library.rebuildIndex();await showLibrary();$('creator-library-status').textContent=`Checked ${result.scanned} saved records · repaired ${result.repaired} library entries.${result.missing?` ${result.missing} entries have missing saved data; their remaining entry details are preserved.`:''}${result.skipped?' Some records could not be indexed; their stored data is unchanged.':''}`;}
    catch(error){$('creator-library-status').textContent=error.message;}finally{button.disabled=false;}
  };

  mapSharing=new MapSharingControls({library,catalog,engine,Game,art,save,onConflict:markPublicationConflict,newProject,showLibrary,notify:toast,source:()=>current?{id:current.id,revision:current.doc.revision,definition:current.doc.value,valid:report.ok,attribution:current.record?.attribution??[]}:null,resolve:prepared=>current.doc.transact('Resolve landscape for map sharing',d=>{d.map=prepared.map;d.rules.weather=prepared.weather;}),setBusy:value=>{busy=value;$('creator-test').disabled=busy||!report.ok;$('creator-release').disabled=busy||!report.ok;$('creator-save-map').disabled=busy;}});

  $('creator-route-tools').onclick=()=>{const details=$('creator-routes');revealWorkspaceSection(details);details.open=true;routesEditor.paint();details.scrollIntoView({block:'start'});};
  $('creator-habitat').onchange=()=>{map.view.habitatPreset=$('creator-habitat').value;setTool('habitat');};
  $('creator-species').onchange=()=>{map.natureSpecies=catalog.nature.find(s=>s.key===$('creator-species').value);$('creator-nature-size').min=map.natureSpecies.min_size;$('creator-nature-size').max=map.natureSpecies.max_size;setTool('nature');};
  $('creator-nature-density').onchange=e=>{map.natureDensity=Number(e.target.value);map.viewChanged(map.state);};
  $('creator-nature-size').oninput=e=>{map.natureSize=Number(e.target.value);$('creator-nature-scale').textContent=map.natureSize.toFixed(2)+'×';map.render();map.viewChanged(map.state);};
  $('creator-river-enabled').onchange=e=>change(e.target.checked?'Restore river':'Remove river',d=>{d.map.river=e.target.checked?JSON.parse(engine.scenario_template('story')).map.river:null;});
  $('creator-overlay-filter').onchange=e=>{map.view[map.view.layer==='utilities'?'utilityKind':'regionId']=e.target.value;$('creator-land-legend').textContent=overlayLegend();map.render();map.viewChanged(map.state);};
  $('creator-land-layer').onchange=e=>{map.view.layer=e.target.value;renderSceneFilter();map.landOverlay=overlayTiles();$('creator-land-legend').textContent=overlayLegend();inspectGround(hoverCell);map.render();map.viewChanged(map.state);};
  $('creator-brush-size').onchange=e=>{map.brushSize=Number(e.target.value);map.viewChanged(map.state);};
  $('creator-toolbelt').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
  $('creator-sites').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
  $('creator-buildings').onclick=e=>{const b=e.target.closest('[data-tool]');if(b)setTool(b.dataset.tool);};
  $('creator-grid').onchange=()=>{map.view.grid=$('creator-grid').checked;map.render();map.viewChanged(map.state);};
  $('creator-title').onchange=()=>{const value=$('creator-title').value;changeInspector('Rename our village',d=>{d.title=value;},()=>{$('creator-title').value=current.doc.value.title;});};
  for(const [id,path,label]of [['creator-description',['description'],'Edit introduction'],['creator-seed',['map','seed'],'Change landscape seed'],['creator-funds',['start','funds'],'Set the shared fund'],['creator-water',['start','fresh_water'],'Set starting fresh water']])$(id).onchange=()=>{
    const raw=$(id).value,value=id==='creator-description'?raw:id==='creator-funds'?Math.round(Number(raw)*100):Number(raw);
    changeInspector(label,d=>{if(path.length===1)d[path[0]]=value;else d[path[0]][path[1]]=value;},()=>{const d=current.doc.value,stored=path.length===1?d[path[0]]:d[path[0]][path[1]];$(id).value=id==='creator-funds'?stored/100:stored;});
  };
  $('creator-biomes').onclick=e=>{const b=e.target.closest('[data-biome]');if(!b)return;newBiome=b.dataset.biome;for(const choice of $('creator-biomes').querySelectorAll('button'))choice.setAttribute('aria-pressed',String(choice===b));};
  $('creator-selection').onchange=async e=>{
    if(e.target.dataset.naturalField){if(e.target.value===''){toast('Enter a position or size before applying this change.');renderSelection();return;}const source=map.naturalObjects?.find(p=>p.id===map.view.selectedNature);if(source){const field=e.target.dataset.naturalField,next={...source,[field]:Number(e.target.value)};editNatureObject('move-nature',next.x,next.y,next.size);}return;}
    if(e.target.matches('[data-start-recovery]')){const value=e.target.value,id=map.view.selected;await changeSelection('Set inherited structure recovery',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(value==='none')delete b.material_recovery;else b.material_recovery=value;});return;}
    if(e.target.dataset.startBank){const key=e.target.dataset.startBank,value=Number(e.target.value),id=map.view.selectedBank;await changeSelection('Edit battery bank',d=>{const b=d.start.batteries?.find(b=>b.id===id);if(b)b[key]=value;});return;}
    if(e.target.dataset.buildingBank){const key=e.target.dataset.buildingBank,value=e.target.type==='checkbox'?e.target.checked:Number(e.target.value),id=map.view.selected;await changeSelection('Edit building battery',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.battery)b.battery[key]=value;});return;}

    if(e.target.dataset.startAnimal){const key=e.target.dataset.startAnimal,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selected;await changeSelection('Configure starting animals',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.animals)setStartingAnimalField(b,key,value);});return;}
    if(e.target.dataset.startSite){const key=e.target.dataset.startSite,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selectedSite;await changeSelection('Edit material plot',d=>{const site=d.start.resource_sites?.find(s=>s.id===id);if(site)setSiteField(site,key,value);});return;}
    if(e.target.dataset.startOrchard){const field=e.target.dataset.startOrchard,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selected;await changeSelection('Configure starting orchard',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.orchard)setStartingOrchardField(b,field,value);});return;}
    if(e.target.dataset.startCrop){const field=e.target.dataset.startCrop,value=e.target.type==='checkbox'?e.target.checked:e.target.value,id=map.view.selected;await changeSelection('Configure starting crops',d=>{const b=d.start.buildings.find(b=>b.id===id);if(b?.crop)setStartingCropField(b,field,value);});return;}
    const id=map.view.selected,key={'creator-object-x':'x','creator-object-y':'y','creator-object-state':'state','creator-object-recipe':'recipe','creator-object-appearance':'appearance'}[e.target.id];
    if(key)await changeSelection('Edit '+title(current.doc.value.start.buildings.find(b=>b.id===id)?.kind),d=>{
      const b=d.start.buildings.find(b=>b.id===id);if(!b)return;b[key]=['x','y'].includes(key)?Number(e.target.value):e.target.value;
      if(key==='recipe'&&b.kind==='home')b.appearance=b.recipe==='adobe'?'adobe-gable':b.recipe==='local'?'home-veranda':'home';
    });
  };
  $('creator-selection').onclick=async e=>{
    if(e.target.closest('[data-edit-start]')){residentsEditor.openArrival(map.view.selectedResident);return;}
    if(e.target.closest('[data-route-inspect]')){routesEditor.edit(map.view.selectedRoute);return;}
    const buildingBank=e.target.closest('[data-building-bank-action]')?.dataset.buildingBankAction;if(buildingBank){const id=map.view.selected;await changeSelection('Configure building battery',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(buildingBank==='reset')delete b.battery;else b.battery={charge:catalog.batteries.buildings.find(p=>p.id===b.kind).default_charge,owned:true};});return;}
    const bankAction=e.target.closest('[data-bank-action]')?.dataset.bankAction;if(bankAction){const id=map.view.selectedBank;if(bankAction==='remove'){if(await changeSelection('Remove battery bank',d=>{d.start.batteries=d.start.batteries.filter(b=>b.id!==id);}))map.select(null);}else if(bankAction==='duplicate'){map.bankCopy=clone(current.doc.value.start.batteries.find(b=>b.id===id));setTool('copy-bank');}else setTool('move-bank');return;}

    const animalAction=e.target.closest('[data-animal-action]')?.dataset.animalAction;if(animalAction){const id=map.view.selected;await changeSelection('Configure starting animals',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(animalAction==='reset')delete b.animals;else b.animals=clone(catalog.animals.example);});return;}
    const natureAction=e.target.closest('[data-nature-action]')?.dataset.natureAction;if(natureAction){const source=map.naturalObjects?.find(p=>p.id===map.view.selectedNature);if(!source)return;if(natureAction==='remove')removeNatureObject(source.id);else if(natureAction==='duplicate'){map.natureCopy=clone(source);setTool('copy-nature');}else setTool('move-nature');return;}
    const siteAction=e.target.closest('[data-site-action]')?.dataset.siteAction;if(siteAction){const id=map.view.selectedSite;if(siteAction==='remove'){if(await changeSelection('Remove material plot',d=>{d.start.resource_sites=d.start.resource_sites.filter(s=>s.id!==id);}))map.select(null);}else if(siteAction==='duplicate'){map.siteCopy=clone(current.doc.value.start.resource_sites.find(s=>s.id===id));setTool('copy-site');}else setTool('move-site');return;}

    const orchardAction=e.target.closest('[data-orchard-action]')?.dataset.orchardAction;if(orchardAction){const id=map.view.selected;await changeSelection('Configure starting orchard',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(orchardAction==='reset')delete b.orchard;else b.orchard=structuredClone(catalog.orchards.example);});return;}
    const cropAction=e.target.closest('[data-crop-action]')?.dataset.cropAction;if(cropAction){const id=map.view.selected;await changeSelection('Configure starting crops',d=>{const b=d.start.buildings.find(b=>b.id===id);if(!b)return;if(cropAction==='reset')delete b.crop;else b.crop=structuredClone(catalog.farming.example);});return;}
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
    }catch(error){if(error instanceof LibraryConflict)markPublicationConflict(ctx.id);$('creator-release-status').textContent=error.message;}finally{releasePublication=null;busy=false;author.disabled=false;$('creator-release-cancel').textContent='Keep editing';$('creator-release-confirm').disabled=false;$('creator-release-cancel').disabled=false;if(current&&current.doc.revision!==revision)refresh();if($('creator-release-dialog').open)$('creator-release-confirm').focus();}
  };
  $('creator-save').onclick=()=>save({automatic:false}).then(()=>{if($('creator-save-status').textContent==='Saved on this device')toast('Your creation is saved.');}).catch(()=>{});
  $('creator-recovery-copy').onclick=$('creator-save-copy').onclick=()=>copyCurrent().catch(e=>toast(e.message));
  $('creator-export').onclick=async()=>{if(!current||busy)return;busy=true;try{await download(current.doc.value);}catch(error){toast(error.message);}finally{busy=false;$('creator-export').focus();}};
  $('creator-library').onclick=()=>showLibrary().catch(e=>toast(e.message));
  $('creator-library-close').onclick=()=>{if(current)$('creator-library-dialog').close();else location.assign('./');};
  $('creator-library-dialog').addEventListener('cancel',e=>{if(!current){e.preventDefault();location.assign('./');}});
  $('creator-inspection').onchange=async e=>{
    if(!current)return;const ctx=current,revision=ctx.doc.revision,mode=e.target.value,serial=++inspectionSerial,previous=map.inspection;
    try{const result=mode==='night'?await prepareNightInspection(ctx.doc.value):null;if(current!==ctx||ctx.doc.revision!==revision||serial!==inspectionSerial)return;map.inspection=mode==='day'?null:{mode,...result};map.render();$('creator-inspection-note').hidden=mode==='day';$('creator-inspection-note').textContent=mode==='night'?'Visual inspection · 22:00 opening power · no time passes':'Visual inspection · example rainfall, not a forecast · no time passes';}
    catch(error){if(current===ctx&&serial===inspectionSerial){e.target.value=previous?.mode??'day';toast(error.message);}}
  };
  $('creator-zoom-in').onclick=()=>map.setZoom(map.view.zoom+.15);$('creator-zoom-out').onclick=()=>map.setZoom(map.view.zoom-.15);$('creator-center').onclick=()=>map.centerAt(...current.doc.value.map.camp);
  $('creator-test').onclick=async()=>{
    if(!current||busy||!report.ok)return;busy=true;$('creator-test').disabled=true;status('Preparing the playtest…');
    try{const record=await save();await launch(current.doc.value,record,'playtest');}catch(e){toast(e.message);}finally{busy=false;refresh();$('creator-test').focus();}
  };
  $('creator-back').onclick=async e=>{e.preventDefault();try{if(current)await save();location.assign('./');}catch{/* Keep the unsaved work available to export. */}};
  const entryNameDialog=$('creator-entry-name-dialog'),entryNameInput=$('creator-entry-name');
  const entryNameStatus=$('creator-entry-name-status'),entryNameConfirm=$('creator-entry-name-confirm');
  const entryNameCancel=$('creator-entry-name-cancel');
  let entryNameAction;
  async function nameLibraryEntry(kind,id,copy=false){
    const record=await library.getEntryDetails(kind,id);
    if(!record||record.missingBody)throw Error('Saved data for this entry is missing. Use Repair library list or import a backup.');
    const label=kind==='map'?'map':'village';
    entryNameAction={kind,copy,record,label};
    $('creator-entry-name-title').textContent=copy?'Copy map':`Rename ${label}`;
    $('creator-entry-name-description').textContent=kind==='map'
      ?'The exported map keeps its published title and credits.'
      :'The new name identifies this save in the library. Your progress and the original scenario stay intact.';
    entryNameConfirm.textContent=copy?'Copy map':'Save name';
    entryNameInput.value=copy?`${record.title.slice(0,93)} · copy`:record.title;
    entryNameStatus.textContent='';
    entryNameDialog.showModal();
    entryNameInput.select();
  }
  entryNameCancel.onclick=()=>entryNameDialog.close();
  entryNameInput.oninput=()=>{entryNameStatus.textContent='';};
  entryNameDialog.oncancel=event=>{if(entryNameCancel.disabled)event.preventDefault();};
  $('creator-entry-name-form').onsubmit=async event=>{
    event.preventDefault();
    if(!entryNameAction||entryNameConfirm.disabled)return;
    const {kind,copy,record,label}=entryNameAction;
    const action=kind==='run'?'renameRun':copy?'copyMap':'renameMap';
    entryNameConfirm.disabled=entryNameCancel.disabled=true;
    try{
      const result=await library[action](record.id,record.revision,entryNameInput.value);
      entryNameDialog.close();
      await showLibrary({reset:true});
      $('creator-library-status').textContent=copy?'Map copied.':`Renamed ${label}.`;
      document.querySelector(`[data-rename-${kind}="${CSS.escape(result.id)}"]`)?.focus();
    }catch(error){
      if(entryNameDialog.open)entryNameStatus.textContent=error.message;
      else $('creator-library-status').textContent=error.message;
    }finally{entryNameConfirm.disabled=entryNameCancel.disabled=false;}
  };
  const deleteDialog=$('creator-delete-dialog'),deleteConfirm=$('creator-delete-confirm');
  const deleteCancel=$('creator-delete-cancel'),deleteStatus=$('creator-delete-status');
  const removal={
    map:{label:'map',description:'Existing drafts, releases and villages keep their own land.',remove:(id,revision)=>library.deleteMap(id,revision)},
    release:{label:'release',description:'Drafts and saved villages keep their own content.',remove:(id,revision)=>library.deleteRelease(id,revision)},
    project:{label:'draft',description:'Frozen releases and independent villages keep their content and saves.',remove:(id,revision)=>library.deleteProject(id,revision)},
    run:{label:'saved village',description:'This village and its checkpoints will be deleted from this device. The source creation and other villages remain in the library.',remove:(id,revision)=>library.deleteRun(id,revision)}
  };
  let pendingDelete;
  async function requestRemoval(kind,id,opener){
    const entry=await library.getEntryDetails(kind,id);
    if(!entry||entry.missingBody)throw Error('Saved data for this entry is missing. Use Repair library list or import a backup.');
    const {label,description}=removal[kind];
    pendingDelete={kind,entry,opener};
    $('creator-delete-title').textContent=`Remove ${label}?`;
    $('creator-delete-name').textContent=entry.title;
    $('creator-delete-description').textContent=description;
    deleteConfirm.textContent=`Remove ${label}`;
    deleteConfirm.disabled=false;
    deleteStatus.textContent='';
    deleteDialog.showModal();
    deleteCancel.focus();
  }
  deleteCancel.onclick=()=>deleteDialog.close();
  deleteDialog.oncancel=event=>{if(deleteCancel.disabled)event.preventDefault();};
  deleteDialog.onclose=()=>{
    pendingDelete?.opener.focus({preventScroll:true});
    pendingDelete=null;
  };
  deleteConfirm.onclick=async()=>{
    if(!pendingDelete||deleteConfirm.disabled)return;
    const {kind,entry}=pendingDelete;
    const {id,revision}=entry;
    deleteConfirm.disabled=deleteCancel.disabled=true;
    try{
      await removal[kind].remove(id,revision);
      if(kind==='run'){
        try{sessionStorage.removeItem(`solar-friends-run-recovery:${id}`);}catch{/* The durable deletion already succeeded. */}
      }
      if(kind==='project'&&current?.id===id){
        current=null;
        history.replaceState(null,'','./editor.html');
      }
      pendingDelete=null;
      deleteDialog.close();
      await showLibrary();
      $('creator-library-status').textContent=`Removed ${removal[kind].label}.`;
      $('creator-library-search').focus({preventScroll:true});
    }catch(error){
      if(deleteDialog.open){
        deleteStatus.textContent=error instanceof LibraryConflict
          ?'This entry changed in another tab. Close this dialog and review the entry again before removing it.'
          :error.message;
        deleteConfirm.disabled=error instanceof LibraryConflict;
      }else $('creator-library-status').textContent=error.message;
    }finally{deleteCancel.disabled=false;}
  };
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
      if(b.dataset.renameMap)await nameLibraryEntry('map',b.dataset.renameMap);
      if(b.dataset.copyMap)await nameLibraryEntry('map',b.dataset.copyMap,true);
      if(b.dataset.renameRun)await nameLibraryEntry('run',b.dataset.renameRun);
      if(b.dataset.sandboxMap){
        const record=await library.getMap(b.dataset.sandboxMap);
        if(!record)throw Error('Saved map data is missing. Use Repair library list or import an exported backup.');
        await mapSharing.previewSandbox(record,b);
      }
      if(b.dataset.useMap){const record=await library.getMap(b.dataset.useMap);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await mapSharing.use(record);}
      if(b.dataset.exportMap){const record=await library.getMap(b.dataset.exportMap);const result=downloadStoredPackage('map',record);$('creator-library-status').textContent=result.backup?'The content package is damaged. A full original-record backup was downloaded; saved data is unchanged.':'Original map package exported. Saved data is unchanged.';}
      if(b.dataset.removeMap)await requestRemoval('map',b.dataset.removeMap,b);
      if(b.dataset.playRelease){const record=await library.getRelease(b.dataset.playRelease);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record)await launch(record.package.definition,{id:record.projectId,revision:record.sourceRevision},'scenario',record.id,record.package);}
      if(b.dataset.exportRelease){const record=await library.getRelease(b.dataset.exportRelease);const result=downloadStoredPackage('release',record);$('creator-library-status').textContent=result.backup?'The content package is damaged. A full original-record backup was downloaded; saved data is unchanged.':'Original release package exported. Saved data is unchanged.';}
      if(b.dataset.copyRelease){const record=await library.getRelease(b.dataset.copyRelease);if(!record)throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');if(record){const checked=JSON.parse(engine.validate_scenario(canonical(record.package)));if(!checked.ok)throw Error(checked.issues.find(i=>i.severity==='error')?.message||'This release cannot open.');const p=record.package,credits=[...(p.credits??[]),{release:p.id,revision:p.content_revision,author:p.author}];if(credits.length>catalog.releases.maximum_credits)throw Error('This release already has the maximum source credits. Keep its original export.');await newProject('copy',{...p.definition,title:(p.title+' · copy').slice(0,100)},credits);}}
      if(b.dataset.removeRelease)await requestRemoval('release',b.dataset.removeRelease,b);
      if(b.dataset.removeProject)await requestRemoval('project',b.dataset.removeProject,b);
      if(b.dataset.removeRun)await requestRemoval('run',b.dataset.removeRun,b);
      if(b.dataset.continueRun){if(!await library.getRun(b.dataset.continueRun))throw Error('Saved data for this entry is missing. Use Repair library list to keep the remaining entry details, or import an exported backup.');location.assign(`./?run=${encodeURIComponent(b.dataset.continueRun)}`);}
    }catch(error){$('creator-library-status').textContent=error.message;}finally{b.disabled=false;if(b.dataset.openProject&&b.isConnected&&$('creator-library-dialog').open&&document.querySelectorAll('dialog[open]').length===1)b.focus({preventScroll:true});}
  };
  const replaceDialog=$('creator-replace-dialog'),replaceConfirm=$('creator-replace-confirm');
  const replaceCancel=$('creator-replace-cancel'),replaceStatus=$('creator-replace-status');
  let pendingReplacement;
  replaceCancel.onclick=()=>replaceDialog.close();
  replaceDialog.oncancel=event=>{if(replaceCancel.disabled)event.preventDefault();};
  replaceDialog.onclose=()=>{pendingReplacement=null;};
  $('creator-replace-import').onchange=async event=>{
    const input=event.currentTarget,file=input.files[0],ctx=current;
    if(!file||!ctx)return;
    input.disabled=true;
    try{
      if(file.size>MAX_CREATION_BYTES)throw Error('This creation file is too large.');
      const raw=await file.text(),definition=parseImportObject(raw);
      if(definition.format!=='solar-friends-scenario')throw Error('Choose a scenario draft file to replace this draft. Use Import a creation for maps, releases and backups.');
      const issue=draftImportIssue(JSON.parse(engine.validate_scenario(raw)));
      if(issue)throw Error(issue.message);
      await saving;
      if(current!==ctx||ctx.conflicted||ctx.preserveDamagedRecord)throw Error('Open the current saved draft before replacing it.');
      const existing=ctx.doc.value;
      pendingReplacement={ctx,storageRevision:ctx.storageRevision,editRevision:ctx.doc.revision,definition};
      $('creator-replace-summary').textContent=`Replace “${existing.title}” with “${typeof definition.title==='string'?definition.title.slice(0,100):file.name}”?`;
      replaceStatus.textContent='';
      replaceDialog.showModal();
    }catch(error){$('creator-library-status').textContent=error.message;}
    finally{input.disabled=false;input.value='';}
  };
  replaceConfirm.onclick=async()=>{
    if(!pendingReplacement||replaceConfirm.disabled)return;
    const {ctx,storageRevision,editRevision,definition}=pendingReplacement;
    replaceConfirm.disabled=replaceCancel.disabled=true;
    try{
      const existing=ctx.doc.value;
      definition.id=existing.id;
      definition.revision=existing.revision;
      if(definition.map&&typeof definition.map==='object'){
        definition.map.id=existing.map.id;
        definition.map.revision=existing.map.revision;
      }
      const prepared=await prepareDraft({schema:1,revision:editRevision+1,definition});
      if(current!==ctx||ctx.conflicted||ctx.doc.revision!==editRevision||ctx.storageRevision!==storageRevision)throw new LibraryConflict();
      const checkpoint=prepared.doc.checkpoint();
      const view={center:checkpoint.definition.map.camera,zoom:1.3,tool:'select'};
      const record=await library.savePreparedProject({id:ctx.id,checkpoint,view,attribution:[],thumbnail:null},storageRevision);
      try{sessionStorage.removeItem(recoveryKey(ctx.id));}catch{/* The durable record is authoritative. */}
      replaceDialog.close();
      attach(checkpoint.definition,{id:ctx.id,revision:record.revision,view,record,restored:prepared.doc,prepared});
      toast(prepared.validation.ok?'Draft replaced.':'Draft replaced. Review its issues before testing.');
    }catch(error){
      replaceStatus.textContent=error instanceof LibraryConflict
        ?'This draft changed. Close this dialog and reopen the latest draft before trying again.'
        :error.message;
    }finally{replaceConfirm.disabled=replaceCancel.disabled=false;}
  };
  $('creator-import').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    $('creator-library-status').textContent='Reading creation…';
    try{
      if(file.size>MAX_RECOVERY_FILE_BYTES)throw Error('This backup or creation file exceeds 96 MiB. Keep the original file.');
      const raw=await file.text(),content=parseImportObject(raw);
      if(content.format==='solar-friends-resident')throw Error('Resident packages are no longer supported. Import a map or scenario instead.');
      if(content.format==='solar-friends-recovery'){
        if(content.kind==='resident')throw Error('Resident creation and resident packages have been removed. Your original file is unchanged.');
        if(['map','release'].includes(content.kind)){
          const recovered=recoveredPackage(content,{validateMap:mapSharing.validate,validateScenario:raw=>JSON.parse(engine.validate_scenario(raw))});
          if(current)await save();
          if(recovered.kind==='map')await library.importMap(recovered.file,mapSharing.validate,mapSharing.preview(recovered.file));
          else if(recovered.kind==='release')await library.importRelease(recovered.file,raw=>JSON.parse(engine.validate_scenario(raw)));
          await showLibrary({reset:true});$('creator-library-status').textContent=`Recovered a separate ${recovered.kind==='release'?'scenario release':'reusable map'}. The original backup and saved entries are unchanged.`;return;
        }

        const recovered=await chooseRecoveryCheckpoint(content);if(!recovered)return;
        if(content.kind==='run'){if(current)await save();await library.importRecoveredRun(recovered);await showLibrary({reset:true});toast('Recovered as a separate saved village.');}
        else{if(current)await save();const id=crypto.randomUUID(),prepared=await prepareRecoveredDraft(recovered.checkpoint,id),doc=prepared.doc;attach(doc.value,{id,restored:doc,prepared,view:recovered.view,record:{attribution:clone(recovered.attribution)}});await save();toast(recovered.historyRecovered||doc.historyRecovered?'Recovered a separate draft. Damaged undo history was cleared.':recovered.playable?'Recovered as a separate draft with its history and view.':'Recovered as a separate draft. Review its issues before playing.');}
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
  window.addEventListener('keydown',async e=>{
    if(wrapDialogTab(e))return;
    if(busy||document.querySelector('dialog[open]')||!current||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if((e.metaKey||e.ctrlKey)&&e.code==='KeyZ'){e.preventDefault();stepHistory(e.shiftKey);}
    else if((e.metaKey||e.ctrlKey)&&e.code==='KeyS'){e.preventDefault();save({automatic:false}).catch(()=>{});}
    else if(e.code==='Escape'){e.preventDefault();routesEditor.cancel();setTool('select');map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedRoute){e.preventDefault();const ids=dependentRoutes(current.doc.value,map.view.selectedRoute);if(await changeMap('Remove utility connection',d=>{d.start.routes=d.start.routes.filter(r=>!ids.has(r.id));}))map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedBank){e.preventDefault();const id=map.view.selectedBank;if(await changeMap('Remove battery bank',d=>{d.start.batteries=d.start.batteries.filter(b=>b.id!==id);}))map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedNature){e.preventDefault();removeNatureObject(map.view.selectedNature);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selectedSite){e.preventDefault();const id=map.view.selectedSite;if(await changeMap('Remove material plot',d=>{d.start.resource_sites=d.start.resource_sites.filter(s=>s.id!==id);}))map.select(null);}
    else if(['Delete','Backspace'].includes(e.code)&&map.view.selected){e.preventDefault();removeBuilding(map.view.selected);}
  });
  window.addEventListener('beforeunload',e=>{map?.cancelGesture();if(current&&(current.doc.dirty||current.viewDirty||current.conflicted)){cacheRecovery(current,current.doc.checkpoint(),map.state);e.preventDefault();e.returnValue='';}});
  window.addEventListener('blur',()=>map?.cancelGesture());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){map?.cancelGesture();if(current)save({automatic:true}).catch(()=>{});}});
  library.addEventListener('change',e=>{if(e.detail.remote&&current?.id===e.detail.id&&e.detail.revision!==current.storageRevision){current.conflicted=true;status('Changed in another tab · save a copy');toast('Another tab changed this creation. Your edits are kept here; save a copy to retain them.');}});
}

try{
  await init({module_or_path:new URL('../pkg/solar_friends_bg.wasm',import.meta.url)});
  outlook=new ScenarioOutlook($('creator-outlook'),{source:()=>({key:current?current.id+':'+current.doc.revision:null,valid:!!current&&report.ok,snapshot:()=>engine.snapshot(),projects:checkpoint=>projectPlaces(checkpoint,current.doc.value.start.buildings,title)}),reviewProject:p=>{if(!current?.doc.value.start.buildings.some(b=>b.id===p.id))return;setTool('select');map.select(p.id);map.centerAt(p.x,p.y);workspaces.select('village');$('creator-selection').scrollIntoView({block:'nearest'});}});
  engine=new Game();catalog=JSON.parse(engine.scenario_catalog());art=await loadEditorArt();
  map=new EditorMap($('creator-map'),art,{retryButton:$('creator-art-retry'),onTerrainReady:()=>{if(current){current.artRevision=(current.artRevision??0)+1;current.thumbnailRevision=null;scheduleSave();}},onArtworkReady:()=>{if(current){current.artRevision=(current.artRevision??0)+1;current.thumbnailRevision=null;scheduleSave();}},action:mapAction,viewChanged:()=>{if(current){const key=JSON.stringify(map.state);if(key===current.viewKey)return;current.viewKey=key;current.viewDirty=true;if(!current.conflicted)status('Changes to save');const selection=JSON.stringify([map.selection(),map.view.selectedSite,map.view.selectedBank,map.view.selectedRoute,map.view.selectedResident,map.view.selectedNature]);if(selection!==inspectorSelection){inspectorSelection=selection;renderSelection();if(map.view.selected||map.view.selectedSite||map.view.selectedBank||map.view.selectedRoute||map.view.selectedResident||map.view.selectedNature)$('creator-selection').querySelector('h2')?.scrollIntoView({block:'nearest'});}scheduleSave();}},hover:inspectGround});
  map.natureCatalog=catalog.nature;
  minimap=new EditorMinimap($('creator-minimap'),map);map.onRender=()=>minimap.draw();
  $('creator-sites').innerHTML='<button data-tool="battery-bank" aria-pressed="false">Battery bank</button>'+sourceKinds.map((kind,i)=>`<button data-tool="${kind}" aria-pressed="false">${escape(siteNames[i])}</button>`).join('');
  $('creator-buildings').innerHTML=catalog.buildings.map(b=>`<button data-tool="${b.id}" aria-pressed="false"><canvas width="154" height="100" data-palette="${b.id}" aria-hidden="true"></canvas><span>${escape(title(b.id))}</span></button>`).join('');
  for(const canvas of document.querySelectorAll('[data-palette]')){const key=canvas.dataset.palette;paintIcon(canvas,key,art.images[key],allBuildingArt[key]);}
  ruleEditor=new RuleEditor($('creator-rules'),{change:(label,edit)=>changeInspector(label,edit,()=>ruleEditor.render(current.doc.value,{force:true}))});
  for(const h of catalog.habitats)$('creator-habitat').append(new Option(h.name,h.key));
  for(const species of catalog.nature)$('creator-species').append(new Option(species.name,species.key));map.natureSpecies=catalog.nature[0];map.natureSize=1;
  $('creator-examples').innerHTML=exampleScenarios.map(e=>`<button data-example="${escape(e.id)}"><b>${escape(e.title)}</b><small>${escape(e.biome)} · ${escape(e.summary)}</small></button>`).join('');
  $('creator-biomes').innerHTML=catalog.biomes.map(b=>`<button type="button" data-biome="${b.id}" aria-pressed="${b.id===newBiome}"><img src="./art/${b.id==='mata-atlantica'?'mata-atlantica-atlas.png':b.id==='cerrado'?'cerrado-vegetation-v1.png':'caatinga-vegetation-v1.png'}" alt=""><b>${escape(b.name)}</b><small>${escape(b.summary)}</small></button>`).join('');
  equipmentEditor=new EquipmentEditor($('creator-equipment-fields'),{engine,catalog:catalog.equipment,change:(label,edit)=>changeInspector(label,edit,()=>equipmentEditor.render(current.doc.value)),focus:(x,y)=>map.centerAt(x,y)});
  routesEditor=new RoutesEditor($('creator-routes-fields'),{engine,Game,catalog,change:changeMap,buildingName:title,notify:toast,clearNotice:()=>{clearTimeout(toastTimer);$('creator-toast').hidden=true;},focus:(x,y)=>map.centerAt(x,y),select:id=>{setTool('select');if(id)map.selectRoute(id);else map.select(null);},preview:plan=>{if(!plan&&!map.utilityPreview)return;map.utilityPreview=plan;map.render();},draw:()=>setTool('route-path')});
  liquidsEditor=new LiquidsEditor($('creator-liquids-fields'),{catalog,engine,change:(label,edit)=>{const selected=liquidsEditor.selected,previewOpen=liquidsEditor.preview.open;changeInspector(label,edit,()=>{liquidsEditor.selected=selected;liquidsEditor.render(current.doc.value,report);if(previewOpen&&!liquidsEditor.preview.open)liquidsEditor.preview.showModal();});},undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo}),source:()=>({id:current.id,definition:current.doc.value,revision:current.doc.revision}),notify:toast});
  suppliesEditor=new SuppliesEditor($('creator-supply-locations'),{catalog,engine,change:(label,edit)=>{const selected=suppliesEditor.selected,previewOpen=suppliesEditor.preview.open;changeInspector(label,edit,()=>{suppliesEditor.selected=selected;suppliesEditor.render(current.doc.value,report);if(previewOpen&&!suppliesEditor.preview.open)suppliesEditor.preview.showModal();});},undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo}),source:()=>({id:current.id,definition:current.doc.value,revision:current.doc.revision}),notify:toast});
  regionsEditor=new RegionsEditor($('creator-regions-fields'),{change:(label,edit)=>changeInspector(label,edit,()=>regionsEditor.render(current.doc.value)),maximum:catalog.max_regions,draw:()=>setTool('region'),focus:r=>map.centerAt(r.x+(r.width-1)/2,r.y+(r.height-1)/2)});
  journalEditor=new JournalEditor($('creator-journal-fields'),{catalog,preview:chapter=>{try{showJournalReading({definition:current.doc.value,report:playerJournal,chapter,residents:map.snapshot.residents});}catch(error){toast(error.message);}},change:(label,edit)=>{const view={chapter:journalEditor.chapter,reveal:journalEditor.reveal,eventReveal:journalEditor.events.reveal,open:journalEditor.dialog.open,eventsOpen:journalEditor.events.dialog.open};changeInspector(label,edit,()=>{journalEditor.chapter=view.chapter;journalEditor.reveal=view.reveal;journalEditor.events.reveal=view.eventReveal;if(view.open&&!journalEditor.dialog.open)journalEditor.dialog.showModal();if(view.eventsOpen&&!journalEditor.events.dialog.open)journalEditor.events.dialog.showModal();journalEditor.render(current.doc.value,report);});},undo:()=>stepHistory(),redo:()=>stepHistory(true),history:()=>({undo:current.doc.canUndo,redo:current.doc.canRedo})});
  relationshipsEditor=new RelationshipsEditor($('creator-relationships-fields'),{presets:catalog.resident_presets,art,change:(label,edit)=>changeInspector(label,edit,()=>{relationshipsEditor.signature=null;relationshipsEditor.render(current.doc.value);})});
  residentsEditor=new ResidentsEditor($('creator-residents-fields'),{presets:catalog.resident_presets,occupations:catalog.occupations,catalog,change:(label,edit)=>changeInspector(label,edit,()=>{residentsEditor.signature=null;residentsEditor.render(current.doc.value,report);}),source:()=>current.doc.value,placeStart:id=>{map.placingResident=id;setTool('resident-start');map.selectResident(id);},locateStart:(id,position)=>{setTool('select');map.selectResident(id);map.centerAt(...position);}});
  weatherEditor=new WeatherEditor($('creator-weather-fields'),{defaults:catalog.weather,biomes:catalog.biomes,change:changeMap});
  geologyEditor=new GeologyEditor($('creator-geology-fields'),{change:(label,edit)=>changeInspector(label,edit,()=>geologyEditor.render(current.doc.value,landReport)),center:()=>map.view.center,defaults:JSON.parse(engine.scenario_template('story')).map.deposits,focus:p=>{map.centerAt(p.x+(p.width-1)/2,p.y+(p.height-1)/2);$('creator-land-layer').value=p.material;$('creator-land-layer').dispatchEvent(new Event('change'));}});
  biomeEditor=new BiomeEditor($('creator-biome-setting-fields'),{catalog,art,change,notify:toast,source:()=>({id:current.id,revision:current.doc.revision,definition:report.ok?freezeCreation(current.doc.value,{terrain:terrainBase,snapshot:map.snapshot,catalog}):current.doc.value})});
  new LandscapeRegeneration($('creator-biome-setting-fields'),{art,source:()=>({id:current.id,revision:current.doc.revision,definition:current.doc.value}),change,notify:toast});
  workspaces=new Workspaces({change:key=>{if(!current)return;map.cancelGesture();map.view.workspace=key;if(!['select','pan','move','erase'].includes(map.view.tool))setTool('select');map.viewChanged(map.state);}});
  wire();const id=new URLSearchParams(location.search).get('project');
  if(id){const record=await library.getProject(id);if(record){try{await openProject(record);}catch(error){if(error.name!=='AbortError'&&!(error instanceof LibraryConflict))throw error;await showLibrary();$('creator-library-status').textContent=error.message;}}else{await showLibrary();$('creator-library-status').textContent='This creation is no longer in the library. Independent villages remain available.';}}
  else await showLibrary();
  document.body.dataset.creatorReady='true';
}catch(error){status('The workshop could not open');toast(error.message);}
