import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {EditorDocument} from '../web/editor/document.js';
import {planBuildingCopy,moveBuildings,placeBuildingCopy} from '../web/editor/objects.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game();
try{
 const initial=JSON.parse(game.scenario_template('story')),doc=new EditorDocument(initial),ids=initial.start.buildings.map(b=>b.id);
 const copy=planBuildingCopy(initial,ids,(()=>{let i=0;return()=>`copied-${++i}`;})());
 assert.deepEqual(initial,doc.value);
 assert.equal(copy.buildings.length,2);assert.equal(copy.inventories.length,1);
 assert.equal(copy.inventories[0].owner.building,'copied-2');
 assert.deepEqual(copy.inventories[0].items,initial.start.inventories[0].items);
 assert.throws(()=>planBuildingCopy(initial,ids,()=>ids[0]),/distinct/);
 const validate=d=>JSON.parse(game.validate_scenario(JSON.stringify(d)));
 let placement;
 for(let dy=-8;dy<=8&&!placement;dy+=2)for(let dx=-8;dx<=8&&!placement;dx+=2){const candidate=structuredClone(initial);placeBuildingCopy(candidate,copy,dx,dy);if(validate(candidate).ok)placement={dx,dy};}
 assert.ok(placement,'There is a legal group-copy position');
 doc.transact('Copy group',d=>placeBuildingCopy(d,copy,placement.dx,placement.dy));
 assert.equal(doc.value.start.buildings.length,4);assert(validate(doc.value).ok);
 const copied=doc.value;doc.undo();assert.deepEqual(doc.value,initial);doc.redo();assert.deepEqual(doc.value,copied);
 doc.transact('Move originals',d=>moveBuildings(d,ids,-2,0));
 for(const id of ids){assert.equal(doc.value.start.buildings.find(b=>b.id===id).x,initial.start.buildings.find(b=>b.id===id).x-2);}
 assert.deepEqual(doc.value.start.inventories,copied.start.inventories);
 doc.undo();assert.deepEqual(doc.value,copied);doc.redo();
 console.log('PASS group copy uses distinct stable identities and native-valid remapped stores; move preserves ownership; exact whole-group undo/redo.');
}finally{game.free();}
