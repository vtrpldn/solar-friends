import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import init,{Game} from '../web/pkg/solar_friends.js';
import {mixedBuilderFixture} from './mixed-builder-fixture.mjs';
const output=process.argv[2]??'/tmp/solar-world-light-tiles';await mkdir(output,{recursive:true});
await init({module_or_path:await readFile(new URL('../web/pkg/solar_friends_bg.wasm',import.meta.url))});
const mainSource=await readFile('web/main.js','utf8');
const g=new Game(),server=await serve(0,{handle:async(_req,res,path)=>{if(path!=='/main.js')return false;res.writeHead(200,{'Content-Type':'text/javascript'}).end(mainSource+'\nwindow.__testPaintFrame=()=>render();\n');return true;}}),browser=await chromium.launch({headless:true}),errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:Number(process.argv.find(a=>a.startsWith('--dpr='))?.split('=')[1]??1),reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 const helper=(await readFile('web/night-lighting.js','utf8')).replace('  const transform = ctx.getTransform();','  if(globalThis.__testFullDepthLight){fullDepthLight(ctx,layer,width,height);return;}\n  const transform = ctx.getTransform();');
 await page.route('**/night-lighting.js',route=>route.fulfill({contentType:'text/javascript',body:helper}));
 await page.goto(`http://127.0.0.1:${server.address().port}/?performance`);
 await page.waitForFunction(()=>window.solarDev&&document.querySelector('#main-menu').open);
 await page.locator('[data-new-mode=sandbox]').click();
 await page.waitForFunction(()=>!document.querySelector('#main-menu').open);
 await page.locator('#pause').click();
 const synthetic=await page.evaluate(async()=>{
  const {compositeDepthLight}=await import('/night-lighting.js'),cases=[];
  for(const ratio of [1,2,3,1.25])for(const empty of [false,true]){
   const width=385,height=261,make=()=>{const c=document.createElement('canvas');c.width=Math.floor(width*ratio);c.height=Math.floor(height*ratio);c.getContext('2d').scale(ratio,ratio);return c;},light=make(),lc=light.getContext('2d'),baseline=make(),actual=make();
   const rects=empty?[]:[{left:-10,top:-8,right:55,bottom:65},{left:120,top:120,right:135,bottom:140},{left:127,top:127,right:260,bottom:260},{left:370,top:245,right:410,bottom:300}];
   for(const [i,r]of rects.entries()){lc.fillStyle=['#ffbc4390','#ffed9980','#bb660055','#ffeebb60'][i];lc.fillRect(r.left,r.top,r.right-r.left,r.bottom-r.top);}
   lc.globalCompositeOperation='destination-out';lc.beginPath();lc.arc(150,150,20,0,Math.PI*2);lc.fill();
   for(const c of [baseline,actual]){const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,width,height);g.addColorStop(0,'#1a395a');g.addColorStop(1,'#987c41');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
   const bc=baseline.getContext('2d');bc.globalCompositeOperation='screen';bc.drawImage(light,0,0,light.width,light.height,0,0,width,height);
   window.__testFullDepthLight=false;compositeDepthLight(actual.getContext('2d'),light,rects,width,height);
   const a=bc.getImageData(0,0,baseline.width,baseline.height).data,b=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data;let changed=0;for(let i=0;i<a.length;i++)changed+=a[i]!==b[i];cases.push({ratio,empty,rgbaValues:a.length,changed});
  }return cases;
 });
 assert(synthetic.every(c=>c.changed===0),JSON.stringify(synthetic));
 for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const minutes of [600,1260]){
  const template=JSON.parse(g.scenario_template('sandbox'));template.map=JSON.parse(g.generate_biome_property(biome,42));
  const {definition,summary}=mixedBuilderFixture(g,template);definition.start.minutes=minutes;
  assert(JSON.parse(g.load_scenario(JSON.stringify(definition))).ok);const raw=g.snapshot();
  await page.evaluate(raw=>window.solarDev.importSandbox(raw),raw);
  await page.waitForTimeout(400);
  for(const camera of ['fixed','panned-zoomed']){
   if(camera==='panned-zoomed'){await page.locator('#zoom-in').click();await page.locator('#zoom-in').click();await page.mouse.move(720,450);await page.mouse.down();await page.mouse.move(950,560,{steps:8});await page.mouse.up();}
   const captures=[];
  for(const unculled of [true,false,true])captures.push(await page.evaluate(({unculled,fixed})=>{window.__testFullDepthLight=unculled;if(fixed)window.solarDev.fixedView();else window.__testPaintFrame();return document.querySelector('#world').toDataURL('image/png').split(',')[1];},{unculled,fixed:camera==='fixed'}));
  assert(captures[0]===captures[2],`${biome}/${minutes}/${camera}: baseline capture is unstable`);
  if(captures[1]!==captures[0]){for(let i=0;i<2;i++)await writeFile(`${output}/${biome}-${minutes}-${camera}-${i?'tiled':'baseline'}-mismatch.png`,Buffer.from(captures[i],'base64'));throw Error(`${biome}/${minutes}/${camera}: tiled light blend changed world PNG; inspect retained captures`);}
  const png=Buffer.from(captures[1],'base64');if(minutes===1260&&camera==='fixed')await writeFile(`${output}/${biome}-night.png`,png);
  results.push({biome,minutes,camera,buildings:summary.buildings,exactWorldPng:true,sha256:createHash('sha256').update(png).digest('hex')});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify({deviceScaleFactor:await page.evaluate(()=>devicePixelRatio),synthetic,scope:'Real game fixed and input-panned/zoomed world canvas: tiled depth-light blend versus test-only full-screen blend, three biomes day/night, maximum mixed fixture. Static equality does not establish moving-camera continuity or frame pacing.',results,errors},null,2)+'\n');
 console.log({cases:results.length,errors});
}finally{g.free();await browser.close();await new Promise(resolve=>server.close(resolve));}
