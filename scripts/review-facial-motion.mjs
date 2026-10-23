// Extract review samples from the encoded world recording, not a second render.
// Captions name requested recording times; encoder timestamps are not asserted
// to be exact native pose boundaries or frame-pacing measurements.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const run=promisify(execFile),folder='assets/art-direction/character-prototype-v1/short-beard-complete-jaw-corrected-v1/world',movie=folder+'/clips.webm',report=JSON.parse(await readFile(folder+'/report.json','utf8')),temp=await mkdtemp(join(tmpdir(),'solar-facial-motion-'));let browser;
try{
 const samples=[];
 for(const clip of ['look','work'])for(const night of [0,1]){
  const recording=report.recordings.find(r=>r.clip===clip&&r.night===night);assert(recording&&recording.elapsedMs>=recording.cycleSeconds*1000);
  for(const seconds of clip==='look'?[.7,1.95,3.2,4.45,5.3]:[.25,.45,.65,.85,1.05]){
   assert(seconds*1000<recording.elapsedMs);const at=(recording.offsetMs/1000+seconds).toFixed(6),path=join(temp,`${samples.length}.png`);
   await run('ffmpeg',['-v','error','-threads','1','-ss',at,'-i',movie,'-frames:v','1','-y',path]);
   samples.push({clip,night,facing:recording.facing,seconds,videoSeconds:Number(at),data:(await readFile(path)).toString('base64')});
  }
 }
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const image=await page.evaluate(async samples=>{
  const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const [i,s]of samples.entries()){
   const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();const x=i%5*400,y=Math.floor(i/5)*300;
   // Preserve the body/face pixels from the encoded movie. Nearest-neighbour
   // enlargement is for inspection only and never becomes an artwork source.
   ctx.imageSmoothingEnabled=false;ctx.drawImage(image,440,285,190,120,x+10,y+10,380,240);
   ctx.fillStyle='#483a27';ctx.font='13px monospace';ctx.fillText(`${s.clip} ${s.night?'night/mirrored':'day'} +${s.seconds.toFixed(2)}s`,x+8,y+274);
  }
  return canvas.toDataURL('image/png').split(',')[1];
 },samples);
 await writeFile(folder+'/motion-look-work.png',Buffer.from(image,'base64'));
 await writeFile(folder+'/motion-samples.json',JSON.stringify({status:'Encoded recording samples prepared for visual review; not an automated animation verdict.',videoSha256:createHash('sha256').update(await readFile(movie)).digest('hex'),scope:'Looking and work changes only, both facings/day-night. Requested sample times, not exact decoder/native pose equivalence.',samples:samples.map(({data,...s})=>s)},null,2)+'\n');console.log('Prepared '+samples.length+' samples from the encoded world recording.');
}finally{await browser?.close();await rm(temp,{recursive:true,force:true});}
