import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {plantStroke,thinStroke} from '../web/editor/nature.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const game=new Game(),loaded=new Game();
try{
 const d=JSON.parse(game.scenario_template('sandbox')),catalog=JSON.parse(game.scenario_catalog()).nature;
 assert.equal(catalog.length,12);assert(d.map.nature.length>100);
 const original=game.snapshot(),generated=game.generate_property(42);assert.equal(game.generate_property(42),generated);assert.notEqual(game.generate_property(43),generated);assert.equal(game.snapshot(),original);
 d.map.nature=[];
 const plants=plantStroke(d,[],catalog,'jequitiba-rosa',1,[[26,34],[26,35],[26,36]],3);
 assert(plants.length>1);assert(plants.every(p=>p.size===1));
 for(const a of plants)for(const b of plants)if(a!==b)assert(Math.hypot(a.x-b.x,a.y-b.y)>=1.7);
 assert.equal(plantStroke(d,[],catalog,'jucara',1,[[32,32]],1).length,0);
 assert.equal(plantStroke(d,[],catalog,'jucara',1,[[61,10]],1).length,0);
 d.map.nature=plants;assert.equal(JSON.parse(game.load_scenario(JSON.stringify(d))).ok,true);
 let v=JSON.parse(game.snapshot()).village;assert(v.land.vegetation.some(t=>!t.cleared));
 assert(JSON.parse(game.land_preview('road',plants[0].x,plants[0].y)).ground.shade>0);
 const before=JSON.stringify(v.economy.stock),raw=game.snapshot();assert(loaded.restore(raw));assert.equal(loaded.snapshot(),raw);
 const thinned=thinStroke(plants,[[26,35]],9);assert.equal(thinned.length,0);d.map.nature=thinned;
 assert.equal(JSON.parse(game.load_scenario(JSON.stringify(d))).ok,true);v=JSON.parse(game.snapshot()).village;assert.equal(v.land.vegetation.length,0);assert.equal(JSON.stringify(v.economy.stock),before);
 const empty=game.snapshot();d.map.nature=[{id:'bad',species:'unknown',x:25,y:35,size:1}];assert.equal(JSON.parse(game.load_scenario(JSON.stringify(d))).ok,false);assert.equal(game.snapshot(),empty);
 console.log('PASS frozen generated nature, native species catalog, spaced brush placement, protected ground, real shade, exact saves, material-free thinning and atomic unknown-species rejection.');
}finally{game.free();loaded.free();}
