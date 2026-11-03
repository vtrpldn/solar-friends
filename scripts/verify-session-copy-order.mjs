import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {PlayerSession} from '../web/player-session.js';
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
for(const priorConflict of [false,true])for(const failLater of [false,true]){
 const game=new Game(),definition=JSON.parse(game.scenario_template('sandbox'));assert(JSON.parse(game.load_scenario(JSON.stringify(definition))).ok);
 const record={id:'original',title:'Shared clearing',format:'solar-friends-run',schema:1,sessionKind:'scenario',revision:1,definition,snapshot:game.snapshot(),release:{author:'Founders',content_revision:2,credits:[{author:'Earlier author',revision:1,release:'earlier'}]}},records=new Map([['original',structuredClone(record)]]),data=new Map(),events=[];
 const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 let unblock;const blocked=new Promise(resolve=>{unblock=resolve;});let first=true,laterFails=failLater;
 const library={async saveRun(id,snapshot,expected){events.push(['save',id]);if(first){first=false;await blocked;if(priorConflict){const e=Error('Newer original');e.name='LibraryConflict';throw e;}}if(id==='copy'&&laterFails){laterFails=false;throw Error('Storage full');}const old=records.get(id);assert.equal(expected,old.revision);const next={...old,revision:old.revision+1,snapshot};records.set(id,next);return structuredClone(next);},async importRecoveredRun({definition,snapshot,release,title}){events.push(['copy']);const next={...record,id:'copy',revision:1,definition:structuredClone(definition),snapshot,release:structuredClone(release),title};records.set('copy',next);return structuredClone(next);}};
 const session=new PlayerSession(library,structuredClone(record),game,()=>storage);game.tick(.1);const firstRaw=game.snapshot(),firstSave=session.save();const observedFirst=firstSave.catch(e=>e);await flush();assert.deepEqual(events,[['save','original']]);
 game.tick(.1);const copyRaw=game.snapshot(),copying=session.saveCopy();game.tick(.1);const latestRaw=game.snapshot(),following=session.save(),observedFollowing=following.catch(e=>e);await flush();assert.deepEqual(events,[['save','original']],'Copy overtook its preceding checkpoint');
 unblock();await observedFirst;const copied=await copying;assert.equal(copied.snapshot,copyRaw);assert.deepEqual(copied.release,record.release);const result=await observedFollowing;
 assert.deepEqual(events,[['save','original'],['copy'],['save','copy']]);assert.equal(records.get('original').snapshot,priorConflict?record.snapshot:firstRaw);assert.equal(session.id,'copy');assert.equal(game.snapshot(),latestRaw);
 assert.equal(data.get('solar-friends-run-recovery:original'),undefined,'Copy branch left recovery data attached to the original run');
 if(failLater){assert.match(result.message,/Storage full/);const recovery=JSON.parse(data.get('solar-friends-run-recovery:copy')??'null');assert.equal(recovery?.snapshot,latestRaw,'Queued failed checkpoint lost recovery at the new run ID');assert.equal(recovery.revision,1);await session.save();}
 else assert.equal(result.snapshot,latestRaw);
 assert.equal(records.get('copy').snapshot,latestRaw);assert.equal(data.get('solar-friends-run-recovery:copy'),undefined);session.dispose();
}
for(const transferQuota of [false,true]){
 const game=new Game(),definition=JSON.parse(game.scenario_template('sandbox'));assert(JSON.parse(game.load_scenario(JSON.stringify(definition))).ok);
 const original={id:'original',title:'Queue',revision:1,definition,snapshot:game.snapshot(),sessionKind:'scenario'},data=new Map(),events=[];let quota=transferQuota,releaseCopy,releaseWrite,enterWrite;
 const copyGate=new Promise(r=>{releaseCopy=r;}),writeGate=new Promise(r=>{releaseWrite=r;}),entered=new Promise(r=>{enterWrite=r;});let durableCopy;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(k.endsWith(':copy')&&quota){quota=false;throw Error('Recovery storage full once');}data.set(k,v);},removeItem:k=>data.delete(k)};
 const library={async importRecoveredRun(values){events.push('copy');await copyGate;durableCopy={...original,...values,id:'copy',revision:1};return structuredClone(durableCopy);},async saveRun(id,raw,revision){assert.equal(id,'copy');events.push('save');if(events.length===2){enterWrite();await writeGate;}assert.equal(revision,durableCopy.revision);durableCopy={...durableCopy,snapshot:raw,revision:revision+1};return structuredClone(durableCopy);}};
 const session=new PlayerSession(library,structuredClone(original),game,()=>storage);game.tick(.1);const copying=session.saveCopy();await flush();game.tick(.1);const middle=game.snapshot(),first=session.save();game.tick(.1);const latest=game.snapshot(),second=session.save();assert.notEqual(middle,latest);releaseCopy();await copying;await entered;
 assert(!data.has('solar-friends-run-recovery:original'),'Pending newer recovery remained attached to original after transfer retry');assert.equal(JSON.parse(data.get('solar-friends-run-recovery:copy')).snapshot,latest,'Older queued checkpoint replaced the latest recovery');
 releaseWrite();await first;await second;assert.equal(durableCopy.snapshot,latest);assert.equal(original.revision,1);assert.equal(data.size,0);const count=events.length;await session.save();assert.equal(events.length,count,'Already saved latest checkpoint was written twice');session.dispose();
}
console.log('PASS native session copy ordering: preceding save/conflict, later checkpoint to new identity, frozen credits, original isolation, failed-write retry, multiple queued checkpoints preserve newest recovery, transfer-quota retry and duplicate-save coalescing.');
