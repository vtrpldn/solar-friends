import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/nature-preview-species';await mkdir(output,{recursive:true});await writeFile(output+'/report.json',JSON.stringify({complete:false,phase:'running'})+'\n');
const server=await serve(0,{handle:(req,res,path)=>{if(path!=='/species-check')return false;res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Natural-object placement verification</title>');return true;}});let browser,results;const cleanup=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/species-check`);results=await page.evaluate(async origin=>{
 const {default:init,Game}=await import(origin+'/pkg/solar_friends.js'),{placeNatureObject}=await import(origin+'/editor/nature.js');await init();const g=new Game(),catalog=JSON.parse(g.scenario_catalog()).nature,worker=new Worker(origin+'/group-preview-worker.js',{type:'module'}),cases=[];let serial=0;
 const check=(definition,proposal,x,y)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native species preview timed out')),10000);worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.onmessage=({data})=>{clearTimeout(timer);resolve(data);};worker.postMessage({context:{definition,mode:'nature',copy:proposal,ids:[]}});worker.postMessage({serial:++serial,dx:x,dy:y});});
 try{for(const biome of ['mata-atlantica','cerrado','caatinga']){
 const base=JSON.parse(g.scenario_template('sandbox'));base.map=JSON.parse(g.generate_biome_property(biome,42));
 for(const species of catalog)for(const size of [species.min_size,species.max_size])for(const copy of [false,true]){
 const definition=structuredClone(base),source={id:'species-probe',species:species.key,x:20,y:20,size};definition.map.nature=[source];const original=JSON.stringify(definition),proposal={source,objects:definition.map.nature,catalog,copy};
 for(const [name,[x,y]] of [['clear',[24,34]],['camp',definition.map.camp]]){
 let expected=false;try{const candidate=structuredClone(definition);candidate.map.nature=placeNatureObject(candidate,proposal.objects,catalog,source,x,y,size,{copy});expected=JSON.parse(g.validate_scenario(JSON.stringify(candidate))).ok;}catch{}
 const actual=await check(definition,proposal,x,y);if(actual.unavailable||actual.allowed!==expected)throw Error(JSON.stringify({biome,species:species.key,size,copy,name,expected,actual}));if(JSON.stringify(definition)!==original)throw Error('Preview changed source');cases.push({biome,species:species.key,size,copy,site:name,allowed:actual.allowed});
 }
 }
 }return cases;}finally{worker.terminate();g.free();}
 },`http://127.0.0.1:${server.address().port}`);
 assert.equal(results.length,480);assert(results.some(r=>r.allowed));assert(results.some(r=>!r.allowed));
}finally{await closeValidationBrowser(browser,server,{onStage:stage=>cleanup.push(stage)});}
const inputs={};for(const path of ['scripts/verify-nature-preview-species.mjs','web/group-preview-worker.js','web/editor/nature.js','web/pkg/solar_friends_bg.wasm'])inputs[path]=createHash('sha256').update(await readFile(path)).digest('hex');await writeFile(output+'/report.json',JSON.stringify({complete:true,inputs,cleanup,cases:results,scope:'Real browser native worker agrees with independent shared placement plus native validation for 20 catalog species, min/max size, move/copy, clear/camp sites and all three biome profiles. Source immutability. Not public pointer interaction, every seed/surface, rendering or worker performance.'},null,2)+'\n');console.log('PASS 480 species/biome/size/move-copy native preview checks and cleanup.');
