import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {advanceSimulation} from '../web/simulation-speed.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),copy=new Game();
try{
 const d=JSON.parse(g.scenario_template('sandbox'));d.rules.learning=true;d.start.residents[0].experience={background:'newcomer',levels:{growing:2}};
 d.journal={schema:1,introduction:'Friends',completion:'Our story continues.',roles:[{id:'planter',title:'Our planter',binding:{kind:'capability',skill:'growing',minimum_level:1}}],chapters:[{id:'opening',title:'Arrival',description:'',goals:[{id:'later',title:'A later date',description:'',optional:false,condition:{kind:'date',minute:5000}}]}],events:[{id:'hello',title:'Our garden',when:{kind:'start'},speaker:{kind:'role',role:'planter'},effect:{kind:'message',text:'Let us plant together.'}}]};
 assert(JSON.parse(g.load_scenario(JSON.stringify(d))).ok);const report=()=>JSON.parse(g.scenario_journal()),source=d.start.residents[0].id,runtime=report().events[0].speaker.resident;
 assert.equal(report().events[0].speaker.source_resident,source);assert.equal(report().events[0].status,'applied');const original=g.snapshot();g.scenario_journal();g.tick(0);assert.equal(g.snapshot(),original);
 for(let i=0;i<25;i++)advanceSimulation(g,1/60,16);const partial=g.snapshot();assert(copy.restore(partial));assert.equal(copy.snapshot(),partial);
 for(let i=0;i<50;i++){advanceSimulation(g,1/60,16);advanceSimulation(copy,1/60,16);}assert.equal(g.snapshot(),copy.snapshot());assert.equal(report().events[0].speaker.source_resident,source);assert.equal(report().events[0].status,'applied');
 const saved=g.snapshot(),bad=structuredClone(d);bad.start.residents=bad.start.residents.filter(p=>p.id!==source);assert(!JSON.parse(g.load_scenario(JSON.stringify(bad))).ok);assert.equal(g.snapshot(),saved);
 d.start.residents.reverse();assert(JSON.parse(copy.load_scenario(JSON.stringify(d))).ok);assert.equal(JSON.parse(copy.scenario_journal()).events[0].speaker.source_resident,source);
 console.log('PASS: native source/runtime speaker identities, actual capability assignment, read-only report and pause, once-only message, reordered cast, atomic missing-role rejection and exact 16× save continuation.');
}finally{g.free();copy.free();}
