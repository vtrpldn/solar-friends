import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game(),snap=game=>JSON.parse(game.snapshot());
try{
 const catalog=JSON.parse(g.scenario_catalog());assert.equal(catalog.resident_personality.social_styles.length,3);
 for(const [style,factor]of [['balanced',1],['outgoing',1.2],['reserved',.8]]){
  const template=JSON.parse(g.scenario_template('sandbox'));template.start.residents[0].personality={social_style:style,work_interest:'building'};
  assert(JSON.parse(g.load_scenario(JSON.stringify(template))).ok);
  const setup=snap(g);setup.village.arrived=true;
  for(const person of setup.residents)Object.assign(person,{task:'rest',requested:true,remaining:60,energy:30,hunger:10,social:80,target_x:person.x,target_y:person.y});
  assert(g.restore(JSON.stringify(setup)));g.tick(.25);const person=snap(g).residents[0];
  assert(Math.abs(person.social-(80-.25*.035*factor))<.00002);assert.equal(person.favorite,'build');assert.equal(person.social_style,style);
  assert.equal(person.routine_preferences.preferred_bedtime,1290);assert.equal(snap(g).village.economy.outside_professions[0],'nursery_assistant');
  const companyState=snap(g);Object.assign(companyState.residents[0],{task:'socialize',remaining:60,requested:true,social:50});
  assert(g.restore(JSON.stringify(companyState)));g.tick(.25);assert(Math.abs(snap(g).residents[0].social-(50+(.25*1.3-.25*.035)*factor))<.00002);
  const saved=g.snapshot();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);g.tick(.25);copy.tick(.25);assert.equal(copy.snapshot(),g.snapshot());
 }
 const before=g.snapshot(),old=JSON.parse(before);old.village.version=38;for(const person of old.residents)delete person.social_style;
 assert(g.restore(JSON.stringify(old)));const migrated=snap(g);assert(migrated.residents.every(p=>p.social_style==='balanced'));
 assert.deepEqual(migrated.village.economy,old.village.economy);assert.deepEqual(migrated.village.skills,old.village.skills);
 for(const person of migrated.residents){const previous=old.residents.find(p=>p.id===person.id);assert.equal(person.energy,previous.energy);assert.equal(person.hunger,previous.hunger);assert.deepEqual(person.sleep,previous.sleep);assert.deepEqual(person.routine_preferences,previous.routine_preferences);}
 const safe=g.snapshot();
 for(const personality of [{social_style:'unknown',work_interest:'building'},{social_style:'outgoing',work_interest:'arbitrary'},{social_style:'balanced',work_interest:'cooking',salary:100000}]){
  const d=JSON.parse(g.scenario_template('sandbox'));d.start.residents[0].personality=personality;
  assert.equal(JSON.parse(g.load_scenario(JSON.stringify(d))).ok,false);assert.equal(g.snapshot(),safe);
 }
 console.log('PASS native personality catalog, actual social-need rates, independent work interest/job/routine, exact continuation, legacy state preservation and atomic unsupported-profile rejection.');
}finally{g.free();copy.free();}
