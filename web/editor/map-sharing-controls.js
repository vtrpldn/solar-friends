import {canonical} from './journal.js';
import {freezeCreation} from './files.js';
import {mapThumbnail} from './thumbnail.js';
import {checkSharedMap,prepareSharedMap,mapPreviewDefinition,scenarioFromSharedMap} from './map-sharing.js';
const $=id=>document.getElementById(id);
export class MapSharingControls{
 constructor({library,catalog,engine,Game,art,source,save,resolve,setBusy,showLibrary,notify,newProject}){
  Object.assign(this,{library,catalog,engine,Game,art,source,save,resolve,setBusy,showLibrary,notify,newProject});
  this.validate=raw=>JSON.parse(engine.validate_map_package(raw));
  $('creator-save-map').onclick=()=>{const ctx=source();if(!ctx||this.saving)return;$('creator-map-title').value=ctx.definition.title;$('creator-map-description').value=ctx.definition.description;$('creator-map-save-status').textContent='';$('creator-map-save-dialog').showModal();};
  $('creator-map-save-cancel').onclick=()=>$('creator-map-save-dialog').close();
  $('creator-map-save-dialog').addEventListener('cancel',event=>{if(this.saving)event.preventDefault();});
  $('creator-map-save-confirm').onclick=()=>this.freeze();
 }
 template(){return JSON.parse(this.engine.scenario_template('sandbox'));}
 preview(file){
  const game=new this.Game();
  try{const definition=mapPreviewDefinition(file,this.template(),this.validate),checked=JSON.parse(game.load_scenario(JSON.stringify(definition)));return checked.ok?mapThumbnail(definition,JSON.parse(game.report_state()),this.art):null;}catch{return null;}finally{game.free();}
 }
 async freeze(){
  const ctx=this.source();if(!ctx||this.saving||!$('creator-map-title').reportValidity()||!$('creator-map-author').reportValidity())return;
  this.saving=true;this.setBusy(true);$('creator-map-save-confirm').disabled=true;$('creator-map-save-cancel').disabled=true;$('creator-map-save-status').textContent='Checking the land and saving this map…';
  try{
   const resolved=ctx.valid?freezeCreation(ctx.definition,{terrain:ctx.terrain,snapshot:ctx.snapshot,catalog:this.catalog}):null;
   const prepared=prepareSharedMap(ctx.definition,{catalog:this.catalog,resolved,defaultMap:this.template().map}),title=$('creator-map-title').value,description=$('creator-map-description').value,author=$('creator-map-author').value;
   const checked=checkSharedMap({...prepared,title,description,author,credits:ctx.attribution,validate:this.validate});
   if(canonical(prepared.map)!==canonical(ctx.definition.map)||canonical(prepared.weather)!==canonical(ctx.definition.rules.weather??null))this.resolve(prepared);
   const record=await this.save();await this.library.createMap({projectId:ctx.id,expectedRevision:record.revision,title,description,author,validate:this.validate,thumbnail:this.preview(checked)});
   $('creator-map-save-dialog').close();await this.showLibrary({reset:true});this.notify('A separate map is saved. Use it to begin another scenario.');
  }catch(error){$('creator-map-save-status').textContent=error.message;}finally{this.saving=false;$('creator-map-save-confirm').disabled=false;$('creator-map-save-cancel').disabled=false;this.setBusy(false);}
 }
 async use(record){const content=scenarioFromSharedMap(record.package,this.template(),this.validate);await this.newProject('copy',content.definition,content.credits);this.notify('A new scenario uses its own copy of this land. Add buildings, friends and goals.');}
}
