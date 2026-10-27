import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-world-culling';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const g=new Game(),server=await serve(),browser=await chromium.launch({headless:true}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 const helper=(await readFile('web/world-visibility.js','utf8')).replace('  const margin =','  if(globalThis.__testUnculledBuildings)return true;\n  const margin =');
 await page.route('**/world-visibility.js',route=>route.fulfill({contentType:'text/javascript',body:helper}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?performance`);
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('#main-menu').open);
 await page.locator('[data-new-mode=sandbox]').click();
 await page.waitForFunction(()=>!document.querySelector('#main-menu').open);
 await page.locator('#pause').click();
 for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const minutes of [600,1260]){
  const template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property(biome,42));
  const {definition,summary}=mixedBuilderFixture(g,template);definition.start.minutes=minutes;
  assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);const raw=g.snapshot(),captures=[];
  await page.evaluate(raw=>window.solarDev.importSandbox(raw),raw);
  await page.waitForTimeout(400);
  for(const unculled of [true,false,true])captures.push(await page.evaluate(unculled=>{window.__testUnculledBuildings=unculled;window.solarDev.fixedView();return document.querySelector('#world').toDataURL('image/png').split(',')[1];},unculled));
  assert(captures[0]===captures[2],`${biome}/${minutes}: baseline capture is unstable`);
  if(captures[1]!==captures[0]){for(let i=0;i<2;i++)await writeFile(`${output}/${biome}-${minutes}-${i?'culled':'baseline'}-mismatch.png`,Buffer.from(captures[i],'base64'));throw Error(`${biome}/${minutes}: culling changed world PNG; inspect retained captures`);}
  const png=Buffer.from(captures[1],'base64');if(minutes===1260)await writeFile(`${output}/${biome}-night.png`,png);
  results.push({biome,minutes,buildings:summary.buildings,exactWorldPng:true,sha256:createHash('sha256').update(png).digest('hex')});
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify({scope:'Real game fixed-view world canvas: enabled culling versus test-only bypass, three biomes day/night, maximum mixed fixture. Static equality does not establish moving-camera continuity or frame pacing.',results,errors},null,2)+'\n');
 console.log({cases:results.length,errors});
}finally{g.free();await browser.close();await new Promise(resolve=>server.close(resolve));}
