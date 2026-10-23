// Decoder samples for visual review, never artwork-source modifications.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const run=promisify(execFile),folder='assets/art-direction/character-prototype-v1/short-sleeve-breathe-complete-v1',movie=folder+'/review-v1-breathe.webm',report=JSON.parse(await readFile(folder+'/review-v1.json','utf8')),temp=await mkdtemp(join(tmpdir(),'solar-clothing-motion-'));let browser;
try{
 const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout),samples=[];
 assert.equal(metadata.streams[0].width,500);assert.equal(metadata.streams[0].height,300);assert(Number(metadata.streams[0].nb_read_frames)>0);
 for(const recording of report.recordings){assert(recording.elapsedMs>=recording.cycleSeconds*1000);
  for(const seconds of [.25,1.9,2.02,2.12,2.4,3.65,4.6,5.1]){
   assert(seconds*1000<recording.elapsedMs);const at=recording.offsetMs/1000+seconds,path=join(temp,samples.length+'.png');
   await run('ffmpeg',['-v','error','-threads','1','-ss',at.toFixed(6),'-i',movie,'-frames:v','1','-y',path]);samples.push({night:recording.night,facing:recording.facing,seconds,requestedVideoSeconds:at,data:(await readFile(path)).toString('base64')});
  }
 }
 assert.equal(samples.length,16);browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const image=await page.evaluate(async samples=>{
  const c=document.createElement('canvas');c.width=1600;c.height=1120;const ctx=c.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,c.width,c.height);
  for(const [i,sample]of samples.entries()){const image=new Image();image.src='data:image/png;base64,'+sample.data;await image.decode();const x=i%4*400,y=Math.floor(i/4)*280;ctx.drawImage(image,x,y,400,240);ctx.fillStyle='#483a27';ctx.font='13px monospace';ctx.fillText(`${sample.night?'mirrored night':'day'} · requested +${sample.seconds.toFixed(2)}s`,x+8,y+265);}
  return c.toDataURL('image/png').split(',')[1];
 },samples);
 await writeFile(folder+'/motion-breathe.png',Buffer.from(image,'base64'));
 await writeFile(folder+'/motion-samples.json',JSON.stringify({scope:'Encoded breathing-loop review samples for both hairstyles, day and mirrored night; requested recording times are not exact native/decoder pose identities or frame-pacing evidence.',videoSha256:createHash('sha256').update(await readFile(movie)).digest('hex'),metadata,samples:samples.map(({data,...s})=>s)},null,2)+'\n');console.log('Prepared 16 encoded breathing-loop samples and independent video metadata.');
}finally{await browser?.close();await rm(temp,{recursive:true,force:true});}
