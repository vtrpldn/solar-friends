import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/building-checks-boards',inputs={},sha=b=>createHash('sha256').update(b).digest('hex');await mkdir(output,{recursive:true});
inputs['scripts/review-building-checks-boards.mjs']=sha(await readFile('scripts/review-building-checks-boards.mjs'));
const server=await serve(0,{async handle(_req,_res,path){if(/\.(js|png|html|css)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork/checks.html`);await page.waitForFunction(()=>!document.querySelector('#export').disabled,{},{timeout:120000});
 const report={scope:'Exact live-check canvases, tiled without rescaling artwork at native game scale. Plain ground plus footprint and original resident reference. Not regional terrain, road, motion or all crop/construction/animal states.',inputs,boards:[]};
 for(let start=0;start<81;start+=9){
  const {png,entries}=await page.evaluate(start=>{
   const figures=[...document.querySelectorAll('#houses figure')].slice(start,start+9),board=document.createElement('canvas');board.width=960;board.height=810;const ctx=board.getContext('2d');ctx.fillStyle='#efe3bc';ctx.fillRect(0,0,960,810);
   const entries=figures.map((figure,i)=>{const source=figure.querySelector('canvas'),x=i%3*320,y=Math.floor(i/3)*270;ctx.drawImage(source,x,y,320,240);ctx.fillStyle='#483a27';ctx.font='13px sans-serif';ctx.fillText(figure.textContent,x+5,y+258,310);return {key:figure.dataset.building,state:figure.dataset.lighting};});const png=board.toDataURL().split(',')[1];board.width=board.height=0;return {png,entries};
  },start);
  assert.equal(entries.length,9);const bytes=Buffer.from(png,'base64'),file=`buildings-${start/9+1}.png`;await writeFile(`${output}/${file}`,bytes);report.boards.push({file,sha256:sha(bytes),entries});
 }
 assert.deepEqual(errors,[]);for(const [path,hash]of Object.entries(inputs))assert.equal(sha(await readFile(path)),hash,path);
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');console.log('PASS nine source-bound boards covering all 81 live building/state previews. Individual visual inspection remains required.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
