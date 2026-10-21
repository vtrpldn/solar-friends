import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {sourcePlacementReason,sourceDeposit} from '../web/resource-sites.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),loaded=new Game();
try{
 const d=JSON.parse(g.scenario_template('sandbox'));d.rules.land=true;
 assert.equal(d.map.deposits.length,9);
 d.map.deposits=[{id:'our-stone',material:'stone',x:5,y:5,width:4,height:4,quantity:40}];
 assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,true);
 const before=JSON.parse(g.snapshot()),v=before.village;
 assert.deepEqual(v.economy.land,[0,40,0]);assert.equal(v.land.deposits.length,1);
 assert.equal(sourceDeposit(v,3,6,6).maximum,40);
 assert.equal(sourcePlacementReason(v,3,6,6),'');
 assert.equal(g.place_source(3,6,6),'ok');
 assert.equal(JSON.parse(g.snapshot()).village.economy.sources[0].maximum,40);
 assert.notEqual(g.place_source(3,24,24),'ok');
 const raw=g.snapshot();assert(loaded.restore(raw));assert.equal(loaded.snapshot(),raw);
 const forged=JSON.parse(raw);forged.village.land.deposits[0].remaining=41;assert(!loaded.restore(JSON.stringify(forged)));assert.equal(loaded.snapshot(),raw);
 d.map.deposits=[];assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,true);assert.deepEqual(JSON.parse(g.snapshot()).village.economy.land,[0,0,0]);
 const empty=g.snapshot();d.map.deposits=[{id:'bad',material:'stone',x:2147483647,y:5,width:4,height:4,quantity:40}];
 assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,false);assert.equal(g.snapshot(),empty);
 console.log('PASS authored finite geology, northwest stone placement and matching frontend preview, no phantom patches, exact checkpoints and atomic invalid reserve rejection.');
}finally{g.free();loaded.free();}
