import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {EditorDocument} from '../web/editor/document.js';
import {canonical} from '../web/editor/journal.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game();
try{
 const initial=JSON.parse(game.scenario_template('sandbox'));initial.map.terrain=JSON.parse(game.terrain_template());
 const doc=new EditorDocument(initial),before=canonical(initial);
 for(let n=0;n<64;n++)doc.transact('Paint soil '+n,d=>{d.map.terrain[n*59].fertility=.2+n*.005;});
 const final=canonical(doc.value),checkpoint=doc.checkpoint(),historyBytes=Buffer.byteLength(JSON.stringify(checkpoint.history));
 assert.equal(checkpoint.history.past.length,64);assert(historyBytes<256*1024,'64 cell edits must not retain 64 map copies');
 const reopened=EditorDocument.restore(checkpoint);assert(!reopened.historyRecovered);
 for(let n=0;n<64;n++)assert(reopened.undo());assert.equal(canonical(reopened.value),before);assert(!reopened.canUndo);
 for(let n=0;n<64;n++)assert(reopened.redo());assert.equal(canonical(reopened.value),final);
 const changed=structuredClone(checkpoint);changed.definition.description='An unjournaled edit';const recovered=EditorDocument.restore(changed);
 assert(recovered.historyRecovered);assert.equal(recovered.value.description,'An unjournaled edit');assert(!recovered.canUndo);
 // Deterministic action sequences exercise array insertions/removals/reordering,
 // nested object additions/deletions, and checkpoint branches against snapshots.
 let seed=17;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const probe=new EditorDocument(initial),past=[],future=[];
 for(let n=0;n<700;n++){
  const action=random(7);
  if(action===0&&past.length){future.push(canonical(probe.value));assert(probe.undo());assert.equal(canonical(probe.value),past.pop());}
  else if(action===1&&future.length){past.push(canonical(probe.value));assert(probe.redo());assert.equal(canonical(probe.value),future.pop());}
  else{
   const old=canonical(probe.value);
   const edited=probe.transact('Probe '+n,d=>{
    const roads=d.start.roads;
    if(action===2)roads.splice(random(roads.length+1),0,[random(64),random(64)]);
    else if(action===3&&roads.length)roads.splice(random(roads.length),1);
    else if(action===4)roads.reverse();
    else if(action===5){if(d.start.inventories[0].items.test_marker)delete d.start.inventories[0].items.test_marker;else d.start.inventories[0].items.test_marker=1;}
    else d.description='State '+n+' 🌱';
   });
   if(edited){past.push(old);if(past.length>64)past.shift();future.length=0;}
  }
  if(n%70===0){const restored=EditorDocument.restore(probe.checkpoint());assert(!restored.historyRecovered);assert.equal(canonical(restored.value),canonical(probe.value));}
 }
 // Old journals migrate without changing data, and retain both undo and redo.
 const a=structuredClone(initial),b=structuredClone(initial),c=structuredClone(initial);b.title='Second';c.title='Third';
 const legacy={schema:1,revision:2,definition:b,history:{past:[{label:'First',before:JSON.stringify(a),after:JSON.stringify(b)}],future:[{label:'Next',before:JSON.stringify(b),after:JSON.stringify(c)}]}};
 const migrated=EditorDocument.restore(legacy);assert(!migrated.historyRecovered);migrated.redo();assert.equal(migrated.value.title,'Third');migrated.undo();migrated.undo();assert.equal(migrated.value.title,initial.title);
 const special=new EditorDocument(initial);special.transact('Plain JSON key',d=>Object.defineProperty(d.start,'__proto__',{value:{safe:true},enumerable:true,configurable:true}));assert.equal(special.value.start.__proto__.safe,true);special.undo();assert.equal(Object.prototype.safe,undefined);special.redo();assert.equal(special.value.start.__proto__.safe,true);
 const poisoned=special.checkpoint();poisoned.history.past[0].changes[0].path=['start','constructor','prototype','polluted'];const safe=EditorDocument.restore(poisoned);assert(safe.historyRecovered);assert.equal(Object.prototype.polluted,undefined);
 console.log(`PASS 64 resolved-grid undo steps in ${historyBytes} journal bytes, exact replay/reopening, 700 action sequences, legacy migration, corruption recovery and plain-data special keys.`);
}finally{game.free();}
