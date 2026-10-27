import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-weather-cache';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const mainSource=await readFile('web/main.js','utf8');
const g=new Game(),server=await serve(0,{handle:async(_req,res,path)=>{if(path!=='/main.js')return false;res.writeHead(200,{'Content-Type':'text/javascript'}).end(mainSource+'\nwindow.__testPaintFrame=()=>render();\n');return true;}}),browser=await chromium.launch({headless:true}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.argv.find(a=>a.startsWith('--dpr='))?.split('=')[1]??1),reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 const helper=(await readFile('web/weather.js','utf8')).replace('export function weatherSites(buildings) {','export function weatherSites(buildings) {\n if(globalThis.__testUncachedWeather)return sites.filter(p=>!buildings.some(b=>occupies(b,p.x,p.y)));').replace('export function weatherConditions(environment, minutes) {','export function weatherConditions(environment, minutes) {\n if(globalThis.__testWeatherView)return globalThis.__testWeatherView;');
 await page.route('**/weather.js',route=>route.fulfill({contentType:'text/javascript',body:helper}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?performance`);
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('#main-menu').open);
 await page.locator('[data-new-mode=sandbox]').click();
 await page.waitForFunction(()=>!document.querySelector('#main-menu').open);
 await page.locator('#pause').click();
 for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const minutes of [600,1260]){
  const template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property(biome,42));
  const {definition,summary}=mixedBuilderFixture(g,template);definition.start.minutes=minutes;
  assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);const raw=g.snapshot();
  await page.evaluate(({raw,minutes})=>{window.__testWeatherView=minutes===600?{rain:.8,wet:1,clouds:.9,label:'rain'}:{rain:0,wet:.5,clouds:.2,label:'after-rain'};return window.solarDev.importSandbox(raw);},{raw,minutes});
  await page.waitForTimeout(400);
  for(const camera of ['fixed','panned-zoomed']){
   if(camera==='panned-zoomed'){await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(950,560,{steps:8});await page.mouse.up();}
   const captures=[];
  for(const unculled of [true,false,true])captures.push(await page.evaluate(({unculled,fixed})=>{window.__testUncachedWeather=unculled;if(fixed)window.solarDev.fixedView();else window.__testPaintFrame();return document.querySelector('#world').toDataURL('image/png').split(',')[1];},{unculled,fixed:camera==='fixed'}));
  assert(captures[0]===captures[2],`${biome}/${minutes}/${camera}: baseline capture is unstable`);
  if(captures[1]!==captures[0]){for(let i=0;i<2;i++)await writeFile(`${output}/${biome}-${minutes}-${camera}-${i?'cached':'baseline'}-mismatch.png`,Buffer.from(captures[i],'base64'));throw Error(`${biome}/${minutes}/${camera}: weather cache changed world PNG; inspect retained captures`);}
  const png=Buffer.from(captures[1],'base64');if(minutes===1260&&camera==='fixed')await writeFile(`${output}/${biome}-night.png`,png);
  results.push({biome,minutes,camera,buildings:summary.buildings,exactWorldPng:true,sha256:createHash('sha256').update(png).digest('hex')});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify({sourceHashes:Object.fromEntries(await Promise.all(['web/main.js','web/weather.js'].map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')]))),deviceScaleFactor:await page.evaluate(()=>devicePixelRatio),scope:'Real game fixed and input-panned/zoomed world canvas: cached weather-site selection versus original exclusion scan under forced rain/wet visual conditions, three biomes day/night, maximum mixed fixture. Static equality does not establish moving-camera continuity or frame pacing.',results,errors},null,2)+'\n');
 console.log({cases:results.length,errors});
}finally{g.free();await browser.close();await new Promise(resolve=>server.close(resolve));}
