import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1/work-tool-v1',movie=root+'/cycle-motion-v1.webm',report=JSON.parse(await readFile(root+'/cycle-motion-v1.json')),run=promisify(execFile),temp=await mkdtemp(join(tmpdir(),'solar-public-motion-'));let browser;
try{
 const sha=createHash('sha256').update(await readFile(movie)).digest('hex');assert.equal(sha,report.movieSha256);const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);assert.equal(metadata.streams[0].width,1000);assert.equal(metadata.streams[0].height,540);assert(Number(metadata.streams[0].nb_read_frames)>0);assert.equal(report.segments.length,2);
 const samples=[];for(const [segment,record]of report.segments.entries())for(const seconds of segment===0?Array.from({length:16},(_,i)=>.025+i*.05):[.85,.95,1,1.05,1.1,1.2,1.3,1.4,2.8,2.95,3,3.05,3.1,3.2,3.3,3.5]){const at=record.offsetMs/1000+seconds;assert(seconds*1000<record.elapsedMs);assert(at<Number(metadata.format.duration));const path=join(temp,samples.length+'.png');await run('ffmpeg',['-v','error','-threads','1','-ss',at.toFixed(6),'-i',movie,'-frames:v','1','-y',path]);samples.push({segment,mode:record.kind,kind:record.kind,fraction:seconds,requestedVideoSeconds:at,data:(await readFile(path)).toString('base64')});}

 browser=await chromium.launch({headless:true});const page=await browser.newPage(),boards=[];
 for(let start=0;start<2;start++){const selection=samples.filter(s=>s.segment===start),png=await page.evaluate(async samples=>{const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=4*300;const ctx=canvas.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,2000,1200);for(const [i,sample]of samples.entries()){const image=new Image();image.src='data:image/png;base64,'+sample.data;await image.decode();const x=i%4*500,y=Math.floor(i/4)*300;ctx.drawImage(image,x,y,500,270);ctx.fillStyle='#483a27';ctx.font='14px monospace';ctx.fillText(sample.kind+' '+sample.mode+' '+sample.fraction+' @'+sample.requestedVideoSeconds.toFixed(3)+'s',x+8,y+290);}return canvas.toDataURL('image/png').split(',')[1];},selection);const bytes=Buffer.from(png,'base64'),file='cycle-filmstrip-'+(start+1)+'.png';await writeFile(root+'/'+file,bytes);boards.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(root+'/cycle-decoded-v1.json',JSON.stringify({scope:'32 independently decoded samples of internal full work loops and walk/work transitions, day and mirrored night in each sample. Requested times are not exact decoded/native frame identities; no pacing or simulated-travel acceptance.',videoSha256:sha,metadata,boards,samples:samples.map(({data,...sample})=>sample)},null,2)+'\n');console.log(JSON.stringify({samples:samples.length,boards:boards.length,encodedFrames:Number(metadata.streams[0].nb_read_frames),duration:Number(metadata.format.duration)}));
}finally{await browser?.close();await rm(temp,{recursive:true,force:true});}
