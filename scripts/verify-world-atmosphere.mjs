import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-world-atmosphere';await mkdir(output,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex'),previous=execFileSync('git',['show','9b1cd94:web/main.js'],{encoding:'utf8'}),start=previous.indexOf('  const hour = (state.village.minutes % 1440) / 60;'),end=previous.indexOf('  if (darkness > 0) {',start);assert(start>0&&end>start);const baseline=previous.slice(start,end);
const source=await readFile('web/world-atmosphere.js','utf8'),routed=source.replace('export function paintWorldAtmosphere(','function candidate(')+`\nexport function paintWorldAtmosphere(ctx,options){if(globalThis.__baselineAtmosphere){const {minutes,darkness,width,height,lightLayer}=options,state={village:{minutes}};${baseline}}else candidate(ctx,options);}`;
const server=await serve(0);let browser;await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game();
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/world-atmosphere.js',r=>r.fulfill({contentType:'text/javascript',body:routed}));await page.goto(`http://127.0.0.1:${server.address().port}/?performance`);await page.waitForFunction(()=>window.solarDev&&document.querySelector('#main-menu').open);
 const synthetic=await page.evaluate(async baseline=>{
  const {paintWorldAtmosphere}=await import('/world-atmosphere.js'),{nightAmount}=await import('/building-art.js'),old=new Function('ctx','state','darkness','width','height','lightLayer',baseline);let comparisons=0;
  for(const dpr of [1,2])for(const alpha of [1,.7])for(const emission of [false,true])for(let minutes=0;minutes<=1440;minutes+=15){
   const make=()=>{const c=document.createElement('canvas');c.width=96*dpr;c.height=64*dpr;return c;},a=make(),b=make(),lights=make(),l=lights.getContext('2d');if(emission){l.fillStyle='#e9c879';l.fillRect(20,10,25,30);}
   for(const canvas of [a,b]){const c=canvas.getContext('2d');c.fillStyle='#78974e';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#ae6937';c.fillRect(5,8,31,17);c.setTransform(dpr,0,0,dpr,0,0);c.globalAlpha=alpha;}
   old(a.getContext('2d'),{village:{minutes}},nightAmount(minutes),96,64,lights);globalThis.__baselineAtmosphere=false;paintWorldAtmosphere(b.getContext('2d'),{minutes,darkness:nightAmount(minutes),width:96,height:64,lightLayer:lights});
   const aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data,bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data;if(aa.some((v,i)=>v!==bb[i]))throw Error('Shading differs at '+JSON.stringify({minutes,dpr,alpha,emission}));
   a.width=a.height=b.width=b.height=lights.width=lights.height=0;comparisons++;
  }return comparisons;
 },baseline);assert.equal(synthetic,776);
 await page.locator('[data-new-mode=sandbox]').click();await page.waitForFunction(()=>!document.querySelector('#main-menu').open);await page.locator('#pause').click();const worlds=[];
 for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const minutes of [600,1080,1260]){
  const template=JSON.parse(game.scenario_template('sandbox'));template.map=JSON.parse(game.generate_biome_property(biome,42));const {definition,summary}=mixedBuilderFixture(game,template);definition.start.minutes=minutes;assert(JSON.parse(game.load_scenario(JSON.stringify(definition))).ok);
  await page.evaluate(raw=>window.solarDev.importSandbox(raw),game.snapshot());await page.waitForFunction(({biome,minutes})=>{const s=window.solarDev.snapshot();return s.village.scenario?.definition.map.biome.id===biome&&s.village.minutes===minutes&&s.village.buildings.length===256&&s.residents.length===12;},{biome,minutes});
  const captures=[];for(const before of [true,false,true])captures.push(await page.evaluate(before=>{window.__baselineAtmosphere=before;window.solarDev.fixedView();return document.querySelector('#world').toDataURL('image/png').split(',')[1];},before));
  assert.equal(captures[0],captures[2],biome+' baseline must be stable');assert.equal(captures[1],captures[0],biome+' actual world shading changed');const bytes=Buffer.from(captures[1],'base64');if(minutes===1260)await writeFile(`${output}/${biome}-night.png`,bytes);worlds.push({biome,minutes,buildings:summary.buildings,residents:summary.population,exactWorldPng:true,sha256:sha(bytes)});
 }
 assert.deepEqual(errors,[]);const inputs={};for(const p of ['web/main.js','web/world-atmosphere.js','web/night-lighting.js','web/world-renderer.js','scripts/verify-world-atmosphere.mjs'])inputs[p]=sha(await readFile(p));await writeFile(output+'/report.json',JSON.stringify({baselineCommit:'9b1cd94',baselineSha256:sha(baseline),inputs,syntheticComparisons:synthetic,worlds,browserErrors:errors,scope:'Exact static before/after pixels for extracted final atmosphere shading. Real game maximum mixed fixtures across three biomes, day/twilight/night. Not visual art acceptance, animation continuity or performance.'},null,2)+'\n');console.log('PASS 776 shading comparisons and nine byte-exact actual game worlds across three biomes at day, dusk and night.');
}finally{game.free();await browser?.close();await new Promise(resolve=>server.close(resolve));}
