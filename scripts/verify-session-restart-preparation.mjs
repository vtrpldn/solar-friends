import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {PlayerSession} from '../web/player-session.js';
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function fixture(){
 const game=new Game(),definition=JSON.parse(game.scenario_template('sandbox'));assert(JSON.parse(game.load_scenario(JSON.stringify(definition))).ok);const start=game.snapshot();game.tick(3);const current=game.snapshot();
 let durable={id:'restart-test',format:'solar-friends-run',schema:1,sessionKind:'playtest',revision:1,definition,snapshot:current},fail=false,writes=0,blocked=null;const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const library={async saveRun(id,raw,revision){writes++;if(blocked)await blocked;assert.equal(revision,durable.revision);if(fail)throw Error('Synthetic checkpoint failure');durable={...durable,snapshot:raw,revision:revision+1};return structuredClone(durable);}};
 const session=new PlayerSession(library,structuredClone(durable),game,()=>storage);
 return {game,session,start,current,data,durable:()=>durable,writes:()=>writes,fail:value=>{fail=value;},block:promise=>{blocked=promise;}};
}
{
 const f=fixture(),controller=new AbortController();let release,entered=false,undo=0;const gate=new Promise(resolve=>{release=resolve;});
 const pending=f.session.restartTest({signal:controller.signal,prepare:snapshot=>{entered=true;assert.deepEqual(snapshot,JSON.parse(f.start));assert.equal(f.game.snapshot(),f.current);return gate;}});await flush();assert(entered);assert.equal(f.writes(),0);await assert.rejects(f.session.restartTest(),/already/);await assert.rejects(f.session.finishTest(),/Cancel.*restart/);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.game.snapshot(),f.current);assert.equal(f.durable().snapshot,f.current);release(()=>{undo++;});await flush();assert.equal(undo,1);assert.equal(f.writes(),0);await f.session.restartTest();assert.equal(f.game.snapshot(),f.start);assert.equal(f.durable().snapshot,f.start);assert.equal(f.session.game,f.game);f.session.dispose();
}
{
 const f=fixture();let undo=0;const key='solar-friends-run-recovery:restart-test',recovery=JSON.stringify({revision:1,snapshot:f.current});f.data.set(key,recovery);f.fail(true);
 await assert.rejects(f.session.restartScenario({prepare:()=>()=>{undo++;}}),/Synthetic checkpoint failure/);assert.equal(undo,1);assert.equal(f.game.snapshot(),f.current);assert.equal(f.durable().snapshot,f.current);assert.equal(f.data.get(key),recovery);f.fail(false);await f.session.save();assert.equal(f.durable().snapshot,f.current);assert.equal(f.writes(),2);f.session.dispose();
}
{
 const f=fixture();await assert.rejects(f.session.restartScenario({prepare:()=>{throw Error('Artwork failure');}}),/Artwork failure/);assert.equal(f.game.snapshot(),f.current);assert.equal(f.writes(),0);f.session.record.definition.start.residents=[];let prepared=false;await assert.rejects(f.session.restartScenario({prepare:()=>{prepared=true;}}));assert(!prepared);assert.equal(f.game.snapshot(),f.current);f.session.dispose();
}
{
 const f=fixture();let release,undo=0;const pending=f.session.restartScenario({prepare:()=>new Promise(resolve=>{release=resolve;})});await flush();f.session.dispose({freeGame:false});await assert.rejects(pending,{name:'AbortError'});release(()=>{undo++;});await flush();assert.equal(undo,1);assert.equal(f.game.snapshot(),f.current);assert.equal(f.writes(),0);f.game.free();
}
{
 const f=fixture(),controller=new AbortController();controller.abort();let prepared=false;await assert.rejects(f.session.restartScenario({signal:controller.signal,prepare:()=>{prepared=true;}}),{name:'AbortError'});assert(!prepared);assert.equal(f.game.snapshot(),f.current);f.session.dispose();
}
{
 const f=fixture(),controller=new AbortController();let release,prepared=false;f.block(new Promise(resolve=>{release=resolve;}));f.game.tick(.25);const lived=f.game.snapshot(),saving=f.session.save();await flush();const restarting=f.session.restartScenario({signal:controller.signal,prepare:()=>{prepared=true;}});await flush();controller.abort();await assert.rejects(restarting,{name:'AbortError'});assert(!prepared);assert.equal(f.game.snapshot(),lived);release();await saving;assert.equal(f.durable().snapshot,lived);assert.equal(f.writes(),1);f.session.dispose();
}
console.log('PASS: native restart stages an independent candidate, preserves the live game through cancellation/preparation failure, serializes restarts, rejects invalid definitions, rolls back native/recovery/artwork on write failure, retries saves and releases candidates on disposal/late completion.');
