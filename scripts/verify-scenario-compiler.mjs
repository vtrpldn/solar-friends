import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {hydroCell} from '../web/terrain.js';
import {usesLogistics,usesLand,usesUtilities} from '../web/sandbox-rules.js';
import {sandboxPlanningScene} from '../web/dev/sandbox-fixture.js';

await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const snapshot=g=>JSON.parse(g.snapshot());
const load=(g,d)=>JSON.parse(g.load_scenario(JSON.stringify(d)));
const game=new Game();
try{
  const original=game.snapshot(),catalog=JSON.parse(game.scenario_catalog());
  assert.equal(catalog.format,'solar-friends-scenario');
  assert.equal(JSON.parse(game.scenario_template('unknown')),null);
  const templates=['story','sandbox'].map(mode=>JSON.parse(game.scenario_template(mode)));
  for(const definition of templates){
    assert.equal(JSON.parse(game.validate_scenario(JSON.stringify(definition))).ok,true);
    assert.equal(game.snapshot(),original,'Read-only validation cannot replace a playable village');
  }
  for(const entry of catalog.buildings){
    for(const state of ['completed','blueprint']){
      const d=structuredClone(templates[1]);
      d.rules.logistics=true;d.rules.land=true;d.rules.utilities=true;
      d.start.buildings.push({id:'extra-building',kind:entry.id,x:entry.id==='hydro'?hydroCell(10):10,y:10,state,recipe:'standard',appearance:null});
      const result=load(game,d);assert(result.ok,JSON.stringify({kind:entry.id,state,issues:result.issues}));
      const raw=game.snapshot(),s=JSON.parse(raw),b=s.village.buildings.at(-1);
      assert.equal(b.progress,state==='completed'?100:0);
      assert.equal(s.village.scenario.buildings['extra-building'],b.id);
      assert(game.restore(raw));assert.equal(game.snapshot(),raw);
      const accounts=JSON.parse(game.simulation_report()).materials;
      assert(accounts.every(m=>m.difference===0),'Every authored starting item has exactly one owner and opening credit');
      assert.equal(usesLogistics(s.village),true);assert.equal(usesLand(s.village),true);assert.equal(usesUtilities(s.village),true);
    }
  }
  for(const appearance of catalog.buildings.find(b=>b.id==='home').appearances){
    const d=structuredClone(templates[1]);
    d.start.buildings.push({id:'custom-home',kind:'home',x:10,y:10,state:'completed',recipe:appearance.startsWith('adobe-')?'adobe':'standard',appearance});
    const result=load(game,d);assert(result.ok,JSON.stringify(result));
    const s=snapshot(game),house=s.village.buildings.at(-1);
    assert.equal(s.village.economy.projects.find(p=>p.building===house.id).appearance,catalog.buildings.find(b=>b.id==='home').appearances.indexOf(appearance));
    assert(JSON.parse(game.building_work_quote(house.id)).salvage.every(n=>n===0),'Gifted property cannot generate paid-material refunds');
  }
  const d=structuredClone(templates[0]);
  d.rules.logistics=false;d.rules.land=false;d.rules.utilities=false;
  assert(load(game,d).ok);
  const v=snapshot(game).village;
  assert.equal(usesLogistics(v),false);assert.equal(usesLand(v),false);assert.equal(usesUtilities(v),false);
  assert.equal(game.place('garden',10,10),'ok');assert.equal(snapshot(game).village.buildings.at(-1).progress,100,'Authored rule profile is authoritative in Rust and UI');
  const before=game.snapshot(),invalid=structuredClone(d);
  invalid.start.buildings[1].x=invalid.start.buildings[0].x;
  const rejected=load(game,invalid);assert.equal(rejected.ok,false);
  assert(rejected.issues.some(i=>i.entity==='starting-warehouse'&&i.at?.length===2));
  assert.equal(game.snapshot(),before);
  const planning=sandboxPlanningScene();
  assert.equal(planning.village.scenario.definition.id,'sandbox-planning');
  assert(planning.village.buildings.some(b=>b.kind==='workshop'&&b.progress===0));
  assert(game.restore(JSON.stringify(planning)));
  for(let n=0;n<80;n++)game.tick(.25);
  assert(game.restore(game.snapshot()));
  console.log(`PASS: native scenario compilation across ${catalog.buildings.length} buildings in both initial states, every home appearance, ownership/conservation, read-only validation, atomic errors, rule agreement, exact saves, and the authored planning scene.`);
}finally{game.free();}
