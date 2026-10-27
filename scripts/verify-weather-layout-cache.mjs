import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import {weatherSites} from '../web/weather.js';
import {occupies} from '../web/building-footprints.js';
const output=process.argv[2]??'/tmp/solar-weather-layout-cache';await mkdir(output,{recursive:true});
const allSites=weatherSites([]),kinds=['home','shed','garden','warehouse','streetlight','greenhouse','solar_farm','square','orchard','goat_pasture','source_timber','hydro','eco_toilet','wetland','biodigester','banana_treatment','apiary','coop','compost','kitchen','well','grove'];
const brute=buildings=>allSites.filter(p=>!buildings.some(b=>occupies(b,p.x,p.y)));
let cases=0;
function check(buildings){const expected=brute(buildings);assert.deepEqual(weatherSites(buildings),expected);assert.deepEqual(weatherSites(buildings.map(b=>({...b,progress:37,arbitrary:'snapshot metadata'}))),expected);const returned=weatherSites(buildings);returned.reverse();returned.pop();assert.deepEqual(weatherSites(buildings),expected,'Mutating a returned array must not change the cache');cases++;}
let random=42;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/2**32;};
for(let seed=0;seed<80;seed++){
 const buildings=Array.from({length:seed%4===0?256:Math.floor(next()*90)},(_,i)=>({kind:kinds[(seed+i)%kinds.length],x:Math.floor(next()*64),y:Math.floor(next()*64)}));
 check(buildings);
 if(buildings.length){buildings[0].x+=1;check(buildings);buildings[0].y-=.5;check(buildings);buildings[0].kind=buildings[0].kind==='shed'?'streetlight':'shed';check(buildings);buildings.reverse();check(buildings);buildings.pop();check(buildings);}
 buildings.push({kind:'garden',x:allSites[0].x+.5,y:allSites[0].y+.5});check(buildings);
 buildings.length=0;check(buildings);
}
const buildings=Array.from({length:256},(_,i)=>({kind:kinds[i%kinds.length],x:2+i%20*3,y:2+Math.floor(i/20)*3}));
assert.deepEqual(weatherSites(buildings),brute(buildings));for(let i=0;i<5;i++){weatherSites(buildings);brute(buildings);}
const timings={cached:[],uncached:[]};for(let round=0;round<20;round++)for(const name of round%2?['uncached','cached']:['cached','uncached']){const start=performance.now();const result=name==='cached'?weatherSites(buildings):brute(buildings);timings[name].push(performance.now()-start);assert.equal(result.length,brute(buildings).length);}
const rebuilt=structuredClone(buildings);rebuilt[0].x++;const rebuildStart=performance.now();const changed=weatherSites(rebuilt),rebuildMs=performance.now()-rebuildStart;assert.deepEqual(changed,brute(rebuilt));
const summary=a=>{const sorted=[...a].sort((a,b)=>a-b);return {meanMs:a.reduce((s,x)=>s+x,0)/a.length,medianMs:sorted[Math.floor(a.length/2)],p95Ms:sorted.at(-1)};};
const report={scope:'Exact original foundation exclusion over deterministic seeded sites and changing layouts. Alternating local Node timings cover stable 256-building layout; not browser throughput acceptance.',machine:{platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model},sites:allSites.length,cases,buildings:256,timings,summary:{cached:summary(timings.cached),uncached:summary(timings.uncached)},rebuildMs,limits:['Layout changes still run the original complete exclusion scan.','One cached layout only; returned arrays remain independent.','No camera, simulation, total memory/storage or frame-pacing acceptance.']};await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log({cases,sites:allSites.length,...report.summary,rebuildMs});
