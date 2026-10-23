// Decode actual recorded pixels around both sides of each native mode change.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',movie=root+'/review-v1-transitions.webm',report=JSON.parse(await readFile(root+'/review-v1.json','utf8')),run=promisify(execFile),temp=await mkdtemp(join(tmpdir(),'solar-body-family-motion-'));let browser;
try{
 const videoSha256=createHash('sha256').update(await readFile(movie)).digest('hex');assert.equal(videoSha256,report.videoSha256);
 const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);assert.equal(metadata.streams[0].width,600);assert.equal(metadata.streams[0].height,320);assert(Number(metadata.streams[0].nb_read_frames)>0);assert.equal(report.recordings.length,4);
 const samples=[];for(const recording of report.recordings)for(const seconds of [.025,.48,.56,.64,.74,1.06,1.15,1.2]){
  assert(seconds*1000<recording.elapsedMs);const path=join(temp,samples.length+'.png'),at=recording.offsetMs/1000+seconds;assert(at<Number(metadata.format.duration),'Requested sample exceeds encoded duration');await run('ffmpeg',['-v','error','-threads','1','-ss',at.toFixed(6),'-i',movie,'-frames:v','1','-y',path]);samples.push({other:recording.other,night:recording.night,facing:recording.facing,seconds,requestedVideoSeconds:at,data:(await readFile(path)).toString('base64')});
 }
 assert.equal(samples.length,32);browser=await chromium.launch({headless:true});const page=await browser.newPage();const png=await page.evaluate(async samples=>{
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=2080;const ctx=canvas.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,canvas.width,canvas.height);for(const [i,sample]of samples.entries()){const image=new Image();image.src='data:image/png;base64,'+sample.data;await image.decode();const x=i%4*400,y=Math.floor(i/4)*260;ctx.drawImage(image,x,y,400,400*image.naturalHeight/image.naturalWidth);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`walk/${sample.other} ${sample.night?'mirror/night':'day'} +${sample.seconds.toFixed(3)}s`,x+8,y+244);}return canvas.toDataURL('image/png').split(',')[1];
 },samples);
 await writeFile(root+'/motion-v1-transitions.png',Buffer.from(png,'base64'));await writeFile(root+'/motion-v1.json',JSON.stringify({scope:'32 independently decoded samples around walk/breathe/work changes, day and mirrored night. Requested recording times are not exact native pose or decoder frame identities; no frame-pacing verdict.',videoSha256,metadata,samples:samples.map(({data,...sample})=>sample)},null,2)+'\n');console.log('Prepared 32 decoded native transition samples.');
}finally{await browser?.close();await rm(temp,{recursive:true,force:true});}
