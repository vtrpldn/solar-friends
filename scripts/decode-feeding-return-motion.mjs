// Decode recorded evidence only, without changing any source artwork.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',run=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),movie=`${root}/feeding-return-motion-v5.webm`,recording=JSON.parse(await readFile(`${root}/feeding-return-motion-v5.json`)),temp=await mkdtemp(join(tmpdir(),'solar-feeding-phase-'));let browser;
try{
 assert.equal(hash(await readFile(movie)),recording.videoSha256);
 const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);
 assert.equal(metadata.streams[0].width,1100);assert.equal(metadata.streams[0].height,760);assert(Number(metadata.streams[0].nb_read_frames)>100);assert(Number(metadata.format.duration)>=10);
 const samples=[];
 for(const step of ['activities:13:1','activities:14:2','activities:14:4','activities:13:5']){
  const event=recording.phaseEvents.find(e=>e.step===step);assert(event);const seconds=event.seconds+.16,path=join(temp,samples.length+'.png');await run('ffmpeg',['-v','error','-threads','1','-ss',seconds.toFixed(6),'-i',movie,'-frames:v','1','-y',path]);samples.push({step,requestedSeconds:seconds,data:(await readFile(path)).toString('base64')});
 }
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 const boards=await page.evaluate(async samples=>{
  const full=document.createElement('canvas'),detail=document.createElement('canvas');full.width=1100;full.height=800;detail.width=1000;detail.height=880;
  const a=full.getContext('2d'),b=detail.getContext('2d');a.fillStyle=b.fillStyle='#e3d8b6';a.fillRect(0,0,full.width,full.height);b.fillRect(0,0,detail.width,detail.height);
  for(const [i,s]of samples.entries()){
   const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();a.drawImage(image,i%2*550,Math.floor(i/2)*400,550,380);a.fillStyle='#483a27';a.font='13px monospace';a.fillText(s.step,i%2*550+8,Math.floor(i/2)*400+395);
   for(const [row,[x,y,label]]of [[295,165,'side-part day'],[675,165,'side-part mirrored night'],[295,535,'curls day'],[675,535,'curls mirrored night']].entries()){b.drawImage(image,x,y,90,85,i*250+8,row*220+5,234,180);b.fillStyle='#483a27';b.font='12px monospace';b.fillText(label,i*250+5,row*220+202);b.fillText(s.step,i*250+5,row*220+216);}
  }
  return {full:full.toDataURL('image/png').split(',')[1],detail:detail.toDataURL('image/png').split(',')[1]};
 },samples);
 const raw=[];for(const s of recording.rawSamples??[]){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);raw.push({...s,data:bytes.toString('base64')});}assert.equal(raw.length,4);const rawDetail=await page.evaluate(async samples=>{const c=document.createElement('canvas');c.width=1000;c.height=880;const ctx=c.getContext('2d');ctx.fillStyle='#e3d8b6';ctx.fillRect(0,0,c.width,c.height);for(const [i,s]of samples.entries()){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();for(const [row,[x,y,label]]of [[295,165,'side-part day'],[675,165,'side-part mirrored night'],[295,535,'curls day'],[675,535,'curls mirrored night']].entries()){ctx.drawImage(image,x,y,90,85,i*250+8,row*220+5,234,180);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(label,i*250+5,row*220+202);ctx.fillText(s.step,i*250+5,row*220+216);}}return c.toDataURL('image/png').split(',')[1];},raw);boards.rawDetail=rawDetail;
 const outputs={};for(const [key,data]of Object.entries(boards)){const path=`${root}/feeding-return-decoded-${key}-v5.png`;await writeFile(path,Buffer.from(data,'base64'));outputs[path]=hash(await readFile(path));}
 await writeFile(`${root}/feeding-return-decoded-v5.json`,JSON.stringify({status:'Decoded phase evidence; visual review pending',videoSha256:recording.videoSha256,recordingSha256:hash(await readFile(`${root}/feeding-return-motion-v5.json`)),decoderSha256:hash(await readFile('scripts/decode-feeding-return-motion.mjs')),metadata,rawSamples:raw.map(({data,...s})=>s),samples:samples.map(({data,...s})=>s),outputs,scope:'Four independently decoded frames requested0.16seconds after observed native phase changes, with full views and magnified hand regions. Labels describe recording trace, not independently recovered exact decoder pose identity. Not exhaustive frame pacing or full biome/public acceptance.'},null,2)+'\n');
 console.log(JSON.stringify({frames:metadata.streams[0].nb_read_frames,duration:metadata.format.duration,samples:samples.map(({data,...s})=>s)}));
}finally{await browser?.close();await rm(temp,{recursive:true,force:true});}
