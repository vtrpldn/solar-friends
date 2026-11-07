import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'artifacts/world-backdrop-browser';await mkdir(output,{recursive:true});
const main=await readFile('web/main.js','utf8'),module=await readFile('web/world-backdrop.js'),baseline=execFileSync('git',['show','7f91902:web/world-renderer.js'],{encoding:'utf8'});
const marker='worldBackdrop.paint(groundLayer,origin,scale,groundKey);';assert(main.includes(marker));
const hooked="import {paintWorldGround as frozenPaintGround} from './frozen-world-renderer.js';\n"+main.replace(marker,'if(globalThis.__testDirectGround)frozenPaintGround(ctx,groundLayer,origin,scale);else '+marker)+'\nwindow.__testBackdropRender=()=>render();window.__testBackdropClear=()=>worldBackdrop.clear();';
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const author=new Game();
const server=await serve(0,{handle(_req,res,path){
 if(path==='/main.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(hooked);return true;}
 if(path==='/frozen-world-renderer.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(baseline);return true;}
 return false;
}});let browser;const results=[],errors=[];
try{
 browser=await chromium.launch({headless:true});
 for(const dpr of [1,2]){
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:dpr,reducedMotion:'reduce'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.solarDev);await page.locator('[data-new-mode="sandbox"]').click();await page.locator('#main-menu').waitFor({state:'hidden'});await page.locator('#pause').click();
  for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const minutes of [600,1260]){
   const template=JSON.parse(author.scenario_template('sandbox'));template.map=JSON.parse(author.generate_biome_property(biome,42));const {definition}=mixedBuilderFixture(author,template,{population:5,custom:false});definition.start.minutes=minutes;
   assert(JSON.parse(author.load_scenario(JSON.stringify(definition))).ok);await page.evaluate(raw=>window.solarDev.importSandbox(raw),author.snapshot());await page.evaluate(()=>window.solarDev.fixedView());
   for(const view of ['center','fractional-pan','moving-pan','zoom']){
    await page.evaluate(()=>window.solarDev.fixedView());
    if(view==='fractional-pan'||view==='moving-pan'){
     await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(927.5,471.25);
     if(view==='fractional-pan')await page.mouse.up();
    }
    if(view==='zoom'){await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();}
    const result=await page.evaluate(async()=>{
     const canvas=document.querySelector('#world'),hash=async()=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
     const before=JSON.stringify(window.solarDev.snapshot());window.__testDirectGround=true;window.__testBackdropRender();const direct=await hash();
     window.__testDirectGround=false;window.__testBackdropRender();const warm=await hash();window.__testBackdropClear();window.__testBackdropRender();const cold=await hash();window.__testBackdropRender();const hit=await hash(),info=window.solarDev.groundBackdrop();
     if(before!==JSON.stringify(window.solarDev.snapshot()))throw Error('Backdrop rendering changed the village');
     return {direct,warm,cold,hit,info,width:canvas.width,height:canvas.height};
    });
    assert.equal(result.warm,result.direct,`${biome}/${minutes}/${dpr}/${view}: existing raster after invalidation`);assert.equal(result.cold,result.direct,`${biome}/${minutes}/${dpr}/${view}: cold raster`);assert.equal(result.hit,result.direct,`${biome}/${minutes}/${dpr}/${view}: cached raster`);
    assert(result.info.hits>0);
    assert.equal(result.info.bytes,result.width*result.height*4);
    if(view==='moving-pan')await page.mouse.up();
    results.push({biome,minutes,dpr,view,...result});
    if(dpr===1&&view==='center')await page.locator('#world').screenshot({path:`${output}/${biome}-${minutes}.png`});
   }
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.equal(results.length,48);
 await writeFile(output+'/report.json',JSON.stringify({completed:true,baselineCommit:'7f91902',mainSha256:createHash('sha256').update(main).digest('hex'),moduleSha256:createHash('sha256').update(module).digest('hex'),browser:browser.version(),results,scope:'Complete game-canvas RGBA hashes, frozen direct ground versus cold/cached production backdrop, 256 buildings and five founding friends, three biomes, day/night, DPR 1/2 and camera motion, settled views and zoom changes; native snapshots unchanged. Not a hardware/GPU memory acceptance gate.'},null,2)+'\n');console.log('PASS: 48 complete game frames match frozen direct rendering on cold and cached draws; exact native states and bounded viewport storage.');
}finally{author.free();await browser?.close();await new Promise(resolve=>server.close(resolve));}
