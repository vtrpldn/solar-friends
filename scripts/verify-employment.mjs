import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceGame} from '../web/dev/scenarios.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game(),snap=g=>JSON.parse(g.snapshot());
try{
 const d=JSON.parse(g.scenario_template('story'));
 d.start.minutes=539;d.start.residents[0].name='João';d.start.residents[0].occupation='school_cook';d.start.residents[0].outside_shifts=true;
 d.start.residents[1].occupation='none';
 assert(JSON.parse(g.load_scenario(JSON.stringify(d))).ok);
 const fixture=snap(g);fixture.village.arrived=true;
 for(const r of fixture.residents)Object.assign(r,{task:'idle',remaining:0,requested:false,energy:90,hunger:20,social:90,last_meal_slot:0,target_x:r.x,target_y:r.y});
 assert(g.restore(JSON.stringify(fixture)));
 assert.equal(g.set_resident_job(1,true),false);
 const funds=fixture.village.economy.money;
 function until(test,label){for(let i=0;i<2400;i++){if(test(snap(g)))return;g.tick(.25);}throw Error('Timed out: '+label);}
 until(s=>s.residents[0].trip?.phase==='leaving','chosen occupation departure');
 assert(snap(g).residents[0].reason.includes('school canteen cook'));
 until(s=>s.residents[0].trip?.phase==='away','chosen occupation away');
 assert(snap(g).residents[0].reason.includes('nearby rural school'));
 const saved=g.snapshot();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);
 assert(g.set_resident_job(0,false));
 advanceGame(g,1021-snap(g).village.minutes);
 const returned=snap(g);
 assert.equal(returned.village.economy.money,funds+18000);
 assert.equal(returned.village.economy.work_day[0],0);
 assert(returned.village.skills.people[0].experience[3]>=2);
 assert(returned.village.economy.ledger.some(e=>e.note==='João · School canteen cook contribution'));
 assert.equal(returned.residents[1].trip?.purpose==='work',false);
 const paid=g.snapshot();assert(copy.restore(paid));assert.equal(copy.snapshot(),paid);
 advanceGame(g,20);assert.equal(snap(g).village.economy.money,funds+18000);
 const invalid=snap(g);delete invalid.village.economy.outside_jobs[0];
 const before=g.snapshot();assert(!g.restore(JSON.stringify(invalid)));assert.equal(g.snapshot(),before);
 console.log('PASS chosen occupation commute, reason, exact away save, disabled committed shift, correct income/skill, no-job resident and pay-once restoration.');
}finally{g.free();copy.free();}
