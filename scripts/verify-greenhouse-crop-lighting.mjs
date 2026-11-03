import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {closeValidationBrowser} from './close-validation-browser.mjs';
const output=process.argv[2]??'artifacts/greenhouse-crop-lighting';await mkdir(output,{recursive:true});const baseline=execFileSync('git',['show','308b61d:web/crop-art.js']),sha=data=>createHash('sha256').update(data).digest('hex');
const server=await serve(0,{handle(_req,res,path){if(path==='/crop-art-baseline.js'){res.writeHead(200,{'Content-Type':'text/javascript'}).end(baseline);return true;}if(path==='/crop-lighting-check'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Crop lighting check</title>');return true;}return false;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/crop-lighting-check`);
 const result=await page.evaluate(async()=>{
  const current=await import('/crop-art.js'),before=await import('/crop-art-baseline.js');await Promise.all([current.loadCropArt(),before.loadCropArt()]);let exactDay=0,exactUnpowered=0,exactOutdoor=0,geometry=0,dimming=0;const differences=[];
  const paint=(module,kind,crop,night,light)=>{const canvas=document.createElement('canvas');canvas.width=400;canvas.height=400;module.drawCrops(canvas.getContext('2d'),{kind,crop},200,300,1,night,crop.moisture?1:.3,light);const data=canvas.getContext('2d').getImageData(0,0,400,400).data;canvas.width=canvas.height=0;return data;};
  const equal=(a,b,message)=>{if(a.length!==b.length||a.some((value,i)=>value!==b[i]))throw Error(message);};
  for(const [kind,type]of Object.entries(current.cropTypes))for(const [state,growth,moisture]of [['young',0,1],['maturing',.5,1],['ready',1,1],['dry-stressed',.5,0]]){
   const crop={kind,planted:true,growth:type.minutes*growth,harvests:0,moisture};
   for(const building of ['garden','greenhouse']){
    const day=paint(before,building,crop,0,0),night=paint(before,building,crop,1,0);for(const level of [0,.5,1]){equal(paint(current,building,crop,0,level),day,'Daylight pixels changed');exactDay++;if(building==='garden'){equal(paint(current,building,crop,1,level),night,'Outdoor night pixels changed');exactOutdoor++;}}
    equal(paint(current,building,crop,1,0),night,'Unpowered night pixels changed');exactUnpowered++;
   }
   const dark=paint(current,'greenhouse',crop,1,0),dim=paint(current,'greenhouse',crop,1,.5),lit=paint(current,'greenhouse',crop,1,1);let a=0,b=0,c=0,changed=0;
   for(let p=0;p<dark.length;p+=4){if(dark[p+3]!==dim[p+3]||dark[p+3]!==lit[p+3])throw Error('Light changed crop silhouette');for(let channel=0;channel<3;channel++){a+=dark[p+channel];b+=dim[p+channel];c+=lit[p+channel];if(dark[p+channel]!==lit[p+channel])changed++;}}
   if(!(a<b&&b<c&&changed>0))throw Error('Powered crop did not brighten continuously');geometry++;dimming++;differences.push({kind,state,rgbSum:{unpowered:a,dim:b,powered:c},changedChannels:changed});
  }
  const empty={kind:'lettuce',planted:false,growth:0,harvests:0,moisture:1};equal(paint(current,'greenhouse',empty,1,1),paint(before,'greenhouse',empty,1,0),'Empty soil gained artificial light');
  return {exactDay,exactUnpowered,exactOutdoor,geometry,dimming,emptySoilUnchanged:true,differences};
 });assert.deepEqual(errors,[]);const sources={};for(const path of ['scripts/verify-greenhouse-crop-lighting.mjs','web/crop-art.js','web/world-renderer.js','web/main.js'])sources[path]=sha(await readFile(path));await writeFile(`${output}/report.json`,JSON.stringify({sources,baselineCommit:'308b61d',baselineCropSha256:sha(baseline),result,browserErrors:errors,scope:'Decoded canvas pixels across all six crop types, three growth stages and dry stress: daylight/outdoor/unpowered byte identity, greenhouse alpha identity and monotonic powered brightness. Shared painter scenes and live native power behavior remain separate checks.'},null,2)+'\n');console.log('PASS exact daylight/outdoor/unpowered crop pixels; greenhouse dimming brightens all crop states without changing silhouettes or empty soil.');
}finally{await closeValidationBrowser(browser,server);}
