import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {serve} from './serve.mjs';
const output='artifacts/isometric';await mkdir(output,{recursive:true});
const server=await serve(),base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[],screenshots=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/artwork/projection.html');
 await page.waitForFunction(()=>document.querySelector('#status')?.dataset.drift);
 assert.equal(await page.locator('figure').count(),27);
 assert(Number.isFinite(Number(await page.locator('#status').getAttribute('data-drift'))));
 await page.locator('#guides').uncheck();
 for(const lighting of ['day','night']){
  await page.locator('#light').selectOption(lighting);
  for(let group=0;group<3;group++){
   await page.evaluate(group=>{[...document.querySelectorAll('figure')].forEach((el,j)=>el.style.display=j>=group*9&&j<(group+1)*9?'block':'none');},group);
   const file=`${output}/${lighting}-${group}.png`;await page.locator('#buildings').screenshot({path:file});screenshots.push(file);
  }
 }
 await page.evaluate(()=>document.querySelectorAll('figure').forEach(el=>el.style.display=''));
 await page.locator('#light').selectOption('day');await page.locator('#guides').check();
 await page.getByRole('button',{name:'Inspect Community shed',exact:true}).click();
 await page.locator('#focus').screenshot({path:`${output}/shed-structure.png`});screenshots.push(`${output}/shed-structure.png`);await page.locator('#focus-close').click();
 await page.getByRole('button',{name:'Inspect Greenhouse',exact:true}).click();await page.locator('#focus').screenshot({path:`${output}/greenhouse-structure.png`});await page.locator('#focus-close').click();
 const occlusion=await page.evaluate(async()=>{
  const {paintDepthLight}=await import('/night-lighting.js');const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');
  paintDepthLight(c,()=>{},()=>{c.fillStyle='#ffbd62';c.fillRect(0,0,64,64);});
  paintDepthLight(c,()=>{c.fillStyle='#333';c.fillRect(16,16,32,32);});
  const data=c.getImageData(0,0,64,64).data;return {behind:data[(32*64+32)*4+3],outside:data[(8*64+8)*4+3]};
 });
 assert.equal(occlusion.behind,0,'A foreground silhouette must fully block a rear light');assert.equal(occlusion.outside,255,'Unoccluded light must remain visible');
 for(const mode of ['artwork-preview','night-preview']){
  await page.goto(base+'/?'+mode);await page.waitForFunction(()=>window.solarDevReloadReady);
  assert.equal((await page.evaluate(()=>window.solarDev.snapshot())).village.buildings.length,27);
  await page.screenshot({path:`${output}/${mode}-game.png`});screenshots.push(`${output}/${mode}-game.png`);
 }
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/browser-review.json`,JSON.stringify({variants:27,views:54,status:'captures-only-not-visual-approval',occlusion,errors,screenshots},null,2));
 console.log('PASS: captured all 54 renderer views, exercised enlarged guides and planted day/night previews, checked light occlusion; no browser errors. Visual quality is not certified by this test.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
