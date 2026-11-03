import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/resident-audit-parity',headed=process.argv.includes('--headed'),baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11)??'55b7768';
const files=['web/character-parts.js','web/character-hair.js','web/character-clothing.js','web/character-atlas-part.js'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});let browser;const results={},inputs={};
try{
 browser=await chromium.launch({headless:!headed});const cdp=await browser.newBrowserCDPSession(),gpu=(await cdp.send('SystemInfo.getInfo')).gpu;await cdp.detach();
 for(const mode of ['baseline','current']){
  const overrides=new Map(mode==='baseline'?files.map(file=>['/'+file.slice(4),execFileSync('git',['show',baseline+':'+file])]):[]);inputs[mode]={};
  const server=await serve(0,{async handle(_req,res,path){if(path==='/audit-parity'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Resident audit parity</title>');return true;}if(overrides.has(path)){const bytes=overrides.get(path);inputs[mode]['web'+path]=sha(bytes);res.writeHead(200,{'Content-Type':'text/javascript'}).end(bytes);return true;}if(/\.(js|json|png|wasm)$/.test(path))inputs[mode]['web'+path]=sha(await readFile('web'+path));return false;}});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/audit-parity`);
   results[mode]=await page.evaluate(async()=>{
    const {prepareBundledSleepResidentFamily,prepareBundledSleepShirtResidentFamily}=await import('/character-sleep-family-bundle.js');const frames=[];
    for(const [wardrobe,prepare]of [['sleeveless',prepareBundledSleepResidentFamily],['shirt',prepareBundledSleepShirtResidentFamily]]){
     const library=await prepare({maxEntries:1,maxConcurrent:1,maxQueued:1});
     try{for(const [variant,recipe]of [{hair:'curls',hairColour:'espresso',materials:{skin:'warm',shirt:'teal',shorts:'sage',shoes:'graphite'},hat:'none',facialHair:'none'},{hair:'sidepart',hairColour:'silver',materials:{skin:'copper',shirt:'cream',shorts:'umber',shoes:'brown'},hat:'straw-v1',facialHair:'short-chestnut-v1'}].entries()){
      const lease=await library.acquire(recipe);try{
       for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++)for(const sequenceIndex of sheet==='activities'&&[13,14].includes(index)?[0,5]:[0]){
        const provider=lease.provider,pose={sequenceIndex},frame=provider.frameForPose(sheet,index,pose),pixels=frame.getContext('2d').getImageData(0,0,frame.width,frame.height).data;
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))].map(n=>n.toString(16).padStart(2,'0')).join('');
        frames.push({wardrobe,variant,sheet,index,sequenceIndex,width:frame.width,height:frame.height,hash,contact:provider.contactForPose?.(sheet,index,pose),shadow:provider.shadowForPose?.(sheet,index,pose)});
       }
      }finally{lease.release();}
     }}finally{await library.dispose();}
    }
    return frames;
   });
   assert.deepEqual(errors,[]);assert.equal(results[mode].length,200);console.log(mode+': 200 complete pose/return rasters recorded.');
  }finally{await page.close();await new Promise(resolve=>server.close(resolve));}
 }
 assert.deepEqual(results.current,results.baseline,'Audit optimization changed delivered pixels or contact/shadow metadata');
 for(const [file,hash]of Object.entries(inputs.current))assert.equal(sha(await readFile(file)),hash,file);
 for(const [file,hash]of Object.entries(inputs.baseline))if(!files.includes(file))assert.equal(sha(await readFile(file)),hash,file);
 await writeFile(output+'/report.json',JSON.stringify({passed:true,headed,browserVersion:browser.version(),gpu,baseline,inputs,frames:results.current,comparisons:200,scriptSha256:sha(await readFile('scripts/verify-resident-audit-parity.mjs')),scope:'Exact before/after RGBA and contact/shadow metadata for two complete v5/v6 looks each, all 48 poses and two feeding-return variants. Not every material combination, visual approval, or all browser backends.'},null,2)+'\n');console.log('PASS: 200 actual resident rasters and contact/shadow records match the pre-optimization runtime exactly.');
}finally{await browser?.close();}
