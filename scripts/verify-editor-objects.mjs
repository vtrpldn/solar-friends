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

// A connected authored quarter includes pipes, a cable to an installed pump,
// and inherited equipment. Copy topology without borrowing external owners.
const connected=JSON.parse(await readFile('assets/validation/editor-scene-layers-v1/authored.solar-scenario','utf8'));
const route=connected.start.routes.find(r=>r.kind==='fresh'),solar=connected.start.buildings.find(b=>b.kind==='solar_farm');
connected.start.equipment=[{asset:{kind:'pump',id:route.id},condition:42,defer_automatic:true},{asset:{kind:'building_battery',id:solar.id},condition:63,defer_automatic:false},{asset:{kind:'truck'},condition:71,defer_automatic:true}];
const checker=new Game();
try{
 assert(JSON.parse(checker.validate_scenario(JSON.stringify(connected))).ok);
 const original=structuredClone(connected),ids=connected.start.buildings.map(b=>b.id),copy=planBuildingCopy(connected,ids,(()=>{let n=0;return()=>`connected-copy-${++n}`;})());
 assert.deepEqual(connected,original);assert.equal(copy.routes.length,5);assert.equal(copy.equipment.length,2);assert(!copy.equipment.some(e=>e.asset.kind==='truck'));
 const remap=new Map(original.start.buildings.map((b,i)=>[b.id,copy.buildings[i].id])),routeRemap=new Map(original.start.routes.map((r,i)=>[r.id,copy.routes[i].id]));
 for(const [i,r]of copy.routes.entries())for(const key of ['from','to'])assert.equal(r[key].id,(r[key].kind==='pump'?routeRemap:remap).get(original.start.routes[i][key].id));
 assert.equal(copy.equipment.find(e=>e.asset.kind==='pump').asset.id,routeRemap.get(route.id));assert.equal(copy.equipment.find(e=>e.asset.kind==='pump').condition,42);
 const well=original.start.buildings.find(b=>b.kind==='well'),kitchen=original.start.buildings.find(b=>b.kind==='kitchen'),partial=planBuildingCopy(connected,[well.id,kitchen.id]);assert.equal(partial.routes.length,1);assert.equal(partial.routes[0].kind,'fresh');assert.equal(partial.equipment.length,1,'Copied pump retains wear, without the outside solar cable or battery');
 assert.throws(()=>planBuildingCopy(connected,ids,()=>original.start.routes[0].id),/distinct/);
 const collision=structuredClone(connected),fresh=collision.start.routes.find(r=>r.kind==='fresh'),prior=fresh.id;fresh.id=well.id;
 for(const r of collision.start.routes)for(const end of ['from','to'])if(r[end].kind==='pump'&&r[end].id===prior)r[end].id=fresh.id;
 collision.start.equipment.find(e=>e.asset.kind==='pump').asset.id=fresh.id;collision.start.routes.reverse();
 assert(JSON.parse(checker.validate_scenario(JSON.stringify(collision))).ok,'Typed route/building ID collision fixture must be native-valid');
 const collisionCopy=planBuildingCopy(collision,ids),copiedFresh=collisionCopy.routes.find(r=>r.kind==='fresh'),copiedCable=collisionCopy.routes.find(r=>r.kind==='electricity');assert.equal(copiedCable.to.id,copiedFresh.id);assert.notEqual(copiedFresh.from.id,copiedFresh.id,'Pump and building namespaces were conflated');assert.equal(collisionCopy.equipment.find(e=>e.asset.kind==='pump').asset.id,copiedFresh.id);

 const doc=new EditorDocument(connected);let offset;
 for(let dy=-24;dy<=24&&!offset;dy+=3)for(let dx=-24;dx<=24&&!offset;dx+=3){const candidate=structuredClone(connected);placeBuildingCopy(candidate,copy,dx,dy);if(JSON.parse(checker.validate_scenario(JSON.stringify(candidate))).ok)offset=[dx,dy];}
 assert(offset,'Connected quarter needs a legal second site');doc.transact('Copy connected quarter',d=>placeBuildingCopy(d,copy,...offset));const copied=doc.value;assert.equal(copied.start.routes.length,10);assert.deepEqual(copied.start.routes.slice(0,5),original.start.routes);for(const [i,r]of copied.start.routes.slice(5).entries())assert.deepEqual(r.cells,original.start.routes[i].cells.map(([x,y])=>[x+offset[0],y+offset[1]]));assert(JSON.parse(checker.validate_scenario(JSON.stringify(copied))).ok);
 doc.undo();assert.deepEqual(doc.value,original);doc.redo();assert.deepEqual(doc.value,copied);
 doc.undo();doc.transact('Move connected quarter',d=>moveBuildings(d,ids,...offset));const moved=doc.value;assert(JSON.parse(checker.validate_scenario(JSON.stringify(moved))).ok);assert.deepEqual(moved.start.equipment,original.start.equipment);assert.deepEqual(moved.start.routes[0].cells,original.start.routes[0].cells.map(([x,y])=>[x+offset[0],y+offset[1]]));doc.undo();assert.deepEqual(doc.value,original);doc.redo();assert.deepEqual(doc.value,moved);
 console.log('PASS connected group copy/move: remapped pipe/pump/cable identities, equipment wear, translated paths, excluded outside links/truck, native placement and exact atomic undo/redo.');
}finally{checker.free();}
