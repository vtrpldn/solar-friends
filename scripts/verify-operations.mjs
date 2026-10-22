import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';import {advanceSimulation} from '../web/simulation-speed.js';import {operationScenario,operationGoals} from './operations-fixture.mjs';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});const g=new Game(),copy=new Game();
try{
 const d=operationScenario(g);d.journal={schema:1,introduction:'A working village',completion:'Keep these systems cared for.',chapters:[{id:'systems',title:'Useful buildings',description:'',goals:operationGoals()}],events:[{id:'support',title:'A real meal is under way',when:{kind:'threshold',condition:{kind:'operating',building:'kitchen',state:'underway',count:1}},effect:{kind:'grant_funds',cents:100}}]};const loaded=JSON.parse(g.load_scenario(JSON.stringify(d)));assert(loaded.ok,JSON.stringify(loaded));const report=()=>JSON.parse(g.scenario_journal());
 const initial=g.snapshot(),start=JSON.parse(initial).village;assert(start.production.accounting.outputs.every(n=>n===0));assert.equal(start.circular.waste_treated,0);assert.equal(report().chapters[0].goals[1].condition.value,0);assert.equal(report().chapters[0].goals[4].condition.value,1);assert.equal(report().chapters[0].goals[5].condition.value,1);g.tick(0);g.scenario_journal();assert.equal(g.snapshot(),initial);assert(copy.restore(initial));
 for(let i=0;i<1000&&report().finished_at===null;i++){
  const s=JSON.parse(g.snapshot());if(s.village.arrived&&i%15===0){const r=s.residents.find(r=>r.id===2);if(!r.help||r.help.finished!==null)assert.equal(g.request(2,'cook',false),copy.request(2,'cook',false));}
  advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);
  if(i===2){const partial=g.snapshot();assert(copy.restore(partial));assert.equal(copy.snapshot(),partial);}
 }
 assert(report().finished_at!==null,JSON.stringify(report()));assert.equal(g.snapshot(),copy.snapshot());assert(report().chapters[0].goals.every(goal=>goal.status==='complete'));assert.equal(report().events[0].status,'applied');assert.equal(JSON.parse(g.snapshot()).village.economy.money,d.start.funds+100);
 const saved=g.snapshot();assert(copy.restore(saved));assert.equal(copy.snapshot(),saved);for(let i=0;i<20;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(g.snapshot(),copy.snapshot());
 const unchanged=g.snapshot(),bad=structuredClone(d);bad.rules.utilities=false;assert(!JSON.parse(g.load_scenario(JSON.stringify(bad))).ok);assert.equal(g.snapshot(),unchanged);bad.rules.utilities=true;bad.journal.chapters[0].goals[0].condition.state='generating';assert(!JSON.parse(g.load_scenario(JSON.stringify(bad))).ok);assert.equal(g.snapshot(),unchanged);
 console.log('PASS: real supplied/underway production, actual passive treatment, river generation and charged connected night lights, no invented opening output or treated waste, native operation actions, one-shot funding, invalid-rule/type atomicity and exact partial/final 16× continuation.');
}finally{g.free();copy.free();}
