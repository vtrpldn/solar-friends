import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import init,{Game} from '../web/pkg/solar_friends.js';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/greenhouse-live-lighting';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game(),definition=JSON.parse(game.scenario_template('sandbox'));
definition.start.minutes=1260;definition.start.buildings.push({id:'lit-greenhouse',kind:'greenhouse',x:25,y:25,state:'completed',recipe:'standard',appearance:null,crop:{crop:'lettuce',stage:'mature',next_crop:'lettuce',replant:false,soil_wetness:.8}});
assert(JSON.parse(game.validate_scenario(JSON.stringify(definition))).ok);game.free();
const paths=['web/main.js','web/world-renderer.js','web/crop-art.js','web/power.js','web/pkg/solar_friends_bg.wasm','scripts/verify-greenhouse-live-lighting.mjs'],sources=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
// Observe arguments at the shared painter boundary; keep the real painter body intact.
const renderer=await readFile('web/world-renderer.js','utf8'),signature='export function paintWorldCrops(ctx,building,{project,scale,night=0,health=1,alpha=1,light=0}){';assert(renderer.includes(signature));
const server=await serve(0,{handle:async(req,res,path)=>{if(path!=='/world-renderer.js')return false;res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(renderer.replace(signature,signature+"if(building?.kind==='greenhouse')window.cropLightObservation={id:building.id,night,light};"));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');await page.locator('#creator-import').setInputFiles({name:'lighting.solar-scenario',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(definition))});await page.locator('#creator-library-dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#creator-save-status').textContent.startsWith('Saved'));await page.locator('#creator-test').click();await page.waitForFunction(()=>window.solarDev&&window.cropLightObservation?.night>.9);
 if(await page.locator('#pause').getAttribute('aria-label')==='Pause simulation')await page.locator('#pause').click();
 await page.locator('#open-village').click();await page.locator('[data-panel="power-panel"]').click();
 const observations=[];for(const enabled of [true,false,true]){
  const input=page.locator('[data-power-building]').last();await input.setChecked(enabled);await page.waitForFunction(enabled=>window.cropLightObservation?.light===(enabled?1:0),enabled);observations.push(await page.evaluate(()=>({painter:window.cropLightObservation,power:window.solarDev.snapshot().environment.power})));
 }
 assert.deepEqual(observations.map(o=>o.painter.light),[1,0,1]);assert.deepEqual(errors,[]);await page.screenshot({path:output+'/powered.png'});await writeFile(output+'/report.json',JSON.stringify({sources,passed:true,observations,scope:'Public imported sandbox at night, public Test village and Power checkbox off/on; real main caller and shared crop painter, diagnostic argument observation only. Utilities disabled comfortable Sandbox supply; not a wired-grid or battery depletion test.'},null,2)+'\n');console.log('PASS public night greenhouse power switch sends 1/0/1 illumination through the live crop painter.');
}finally{await closeValidationBrowser(browser,server);}
