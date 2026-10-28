import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import init,{Game} from '../web/pkg/solar_friends.js';
import {makeScenario,advanceGame} from '../web/dev/scenarios.js';
import {tripLabel,residentVisible} from '../web/resident-presence.js';
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),fresh=JSON.parse(g.snapshot());
assert(g.restore(await readFile(new URL('../web/artwork/village-preview.json',import.meta.url),'utf8')));
assert(g.restore(JSON.stringify(makeScenario('occupations',fresh,JSON.parse(g.snapshot())))));
const snap=()=>JSON.parse(g.snapshot()),money=snap().village.economy.money,jobs=snap().environment.economy.jobs;
assert.equal(jobs.length,5);assert.equal(new Set(jobs.map(j=>j.title)).size,5);
// A centred 64-cell map has a longer walk to the boundary than the old map.
// Observe the actual departure instead of assuming a fixed 90-minute commute.
let s=snap();
for(let minutes=0;minutes<420&&!s.residents.every(r=>r.trip?.purpose==='work'&&r.trip.phase==='away');minutes++){advanceGame(g,1);s=snap();}
assert(s.residents.every(r=>r.trip?.purpose==='work'&&r.trip.phase==='away'));
assert(s.residents.every(r=>!residentVisible(r,s.village)));
assert(g.fast_forward_ready());
for(const r of s.residents)assert(tripLabel(r,jobs[r.id]).includes(jobs[r.id].title));
for(let id=0;id<5;id++)assert(g.set_resident_job(id,false));
const raw=g.snapshot();assert(g.restore(raw));assert.equal(g.snapshot(),raw);
advanceGame(g,1021-snap().village.minutes%1440);s=snap();
assert.equal(s.village.economy.money,money+jobs.reduce((n,j)=>n+j.income,0));
assert(s.residents.every(r=>r.trip?.phase==='returning'));
assert(s.environment.economy.jobs.every(j=>j.paid_today&&!j.enabled));
advanceGame(g,90);assert.equal(snap().village.economy.money,s.village.economy.money);
const final=g.snapshot();assert(g.restore(final));assert.equal(g.snapshot(),final);g.free();
console.log('PASS: five distinct jobs, simultaneous departures, occupation labels, hidden off-site residents, automatic fast-forward, independent toggles, committed shift payments, and exact reloads.');
