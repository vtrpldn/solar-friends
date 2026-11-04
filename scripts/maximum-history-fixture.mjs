import assert from 'node:assert/strict';
import {EditorDocument} from '../web/editor/document.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
import {addCombinedEditorLoad} from './combined-editor-load.mjs';
export function maximumHistoryBase(game){const template=JSON.parse(game.scenario_template('sandbox'));template.map.river=null;const{definition}=mixedBuilderFixture(game,template,{population:5,custom:false}),load=addCombinedEditorLoad(game,definition,JSON.parse(game.scenario_catalog()));assert(JSON.parse(game.load_scenario(JSON.stringify(definition))).ok);definition.map.terrain=JSON.parse(game.terrain_template());assert(JSON.parse(game.validate_scenario(JSON.stringify(definition))).ok);return{definition,load};}
export function historyFixture(base,kind){
 const doc=new EditorDocument(base),timings=[];let edits=0;
 for(let n=1;n<=80;n++){const t=performance.now();doc.transact('History '+kind+' '+n,d=>{if(kind==='steps')d.title='History step '+n;else if(kind==='compound'){d.title='Compound history step '+n;for(let i=0;i<1080;i++)d.map.terrain[i].fertility=n%2?.25:.75;}else for(const cell of d.map.terrain)cell.fertility=n%2?.25:.75;});timings.push(performance.now()-t);edits=n;if(kind==='bytes'&&n>=20){const cp=doc.checkpoint(),bytes=new TextEncoder().encode(JSON.stringify(cp.history)).length;if(cp.history.past.length<n&&bytes>7*1024*1024)break;}}
 const checkpoint=doc.checkpoint(),bytes=new TextEncoder().encode(JSON.stringify(checkpoint.history)).length;assert(bytes<8*1024*1024);if(kind==='steps'||kind==='compound')assert.equal(checkpoint.history.past.length,64);else{assert(bytes>7*1024*1024);assert(checkpoint.history.past.length<edits);}if(kind==='compound')assert(bytes>7.5*1024*1024);return{checkpoint,summary:{kind,edits,cells:kind==='compound'?1080:undefined,steps:checkpoint.history.past.length,bytes,maxEditMs:Math.max(...timings)}};
}
