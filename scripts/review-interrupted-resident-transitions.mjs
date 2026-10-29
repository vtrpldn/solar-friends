import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const out=process.argv[2]??'artifacts/interrupted-resident-transitions';await mkdir(out,{recursive:true});
const files=['web/resident-animation.js','web/resident-animation-profiles.js','web/resident-appearance-library.js','web/resident-parts.js','web/character-broad-family-bundle-index.js','web/art/characters/broad-v1/bundle-v1.json','web/art/animations/iara.png','web/art/animations/iara-idle.png','web/art/animations/iara-activities.png','assets/art-direction/character-prototype-v1/body-broad-v1/creator-playtest-memory-v1/fixture.solar-scenario','scripts/review-interrupted-resident-transitions.mjs'],hash=b=>createHash('sha256').update(b).digest('hex'),inputs=Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(await readFile(p))])));
const fixture=JSON.parse(await readFile('assets/art-direction/character-prototype-v1/body-broad-v1/creator-playtest-memory-v1/fixture.solar-scenario'));
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async broad=>{
 const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{advanceResidentAnimation,drawResidentAnimation}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js'),library=createResidentAppearanceLibrary(),looks=[{preset:'iara',version:1},broad];library.setActive(looks);const providers=await Promise.all(looks.map(a=>library.prepare(a))),canvas=document.createElement('canvas'),scratch=document.createElement('canvas');canvas.width=960;canvas.height=800;scratch.width=scratch.height=256;const ctx=canvas.getContext('2d'),r={id:0,x:10,y:10,target_x:10,target_y:10},checks=[];
 const step=(s,task,dt,p)=>advanceResidentAnimation(s,{...r,task,...(task==='idle'?{target_x:11}:{})},0,dt,p.animationProfile);
 const paint=(p,s,x,y,night)=>{ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,scratch,p,{...s,breath:1,facing:night?-1:1},x,y,160);ctx.restore();};
 try{
 ctx.fillStyle='#dde5c6';ctx.fillRect(0,0,960,800);
 for(let i=0;i<2;i++)for(const night of [0,1]){
 const p=providers[i],y=i*400+night*190+185;let s=step(undefined,'idle',.31,p);s=step(s,'build',1/60,p);s=step(s,'build',.06,p);const interrupted=step(s,'cook',0,p),later=step(interrupted,'cook',.09,p),finished=step(later,'cook',.1,p);
 // Compare actual composited pixels in the same native draw context. Breath is
 // fixed to isolate the interrupted pose from the independent idle pulse.
 const pixels=state=>{const c=document.createElement('canvas');c.width=c.height=256;const cctx=c.getContext('2d');drawResidentAnimation(cctx,scratch,p,{...state,breath:1,facing:night?-1:1},128,238,180);return cctx.getImageData(0,0,256,256).data;};
 const before=pixels(s),after=pixels(interrupted);if(before.some((v,n)=>v!==after[n]))throw Error('Interrupted public provider changed rendered pose pixels');checks.push({body:i?'broad-v1':'classic-iara',night,exactPixels:before.length});
 for(const [n,state]of [s,interrupted,later,finished].entries())paint(p,state,120+n*240,y,night);
 ctx.fillStyle='#283e32';ctx.font='13px sans-serif';ctx.fillText(`${i?'Broad + curls':'Classic Iara'} / ${night?'mirrored night':'day'} / before, interrupt, +90ms, settled`,8,y-165);
 }
 const board=canvas.toDataURL().split(',')[1];canvas.width=960;canvas.height=320;
 const stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();const start=performance.now(),states=[undefined,undefined];let last=start;
 while(performance.now()-start<4000){const now=performance.now(),t=(now-start)/1000,dt=(now-last)/1000;last=now;const phase=t%1.4,task=phase<.6?'idle':phase<.66?'build':phase<1.26?'cook':phase<1.32?'sleep':'idle';ctx.fillStyle='#dde5c6';ctx.fillRect(0,0,960,320);for(let i=0;i<2;i++){states[i]=step(states[i],task,dt,providers[i]);paint(providers[i],states[i],240+i*480,290,0);}ctx.fillStyle='#283e32';ctx.fillText(`Public providers: walk → work (60ms) → cook; sleep (60ms) → walk / ${task}`,10,25);await new Promise(requestAnimationFrame);}
 recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {board,movie:btoa(binary),checks,scope:'Two current public providers, fixed breath to isolate pose continuity, enlarged day/mirrored night board and actual native transition recording. Not complete outfit, world, biome or physical-display pacing acceptance.'};
 }finally{await library.dispose();canvas.width=canvas.height=scratch.width=scratch.height=0;}
 },fixture.start.residents[0].appearance);
 assert.deepEqual(errors,[]);await writeFile(out+'/board.png',Buffer.from(result.board,'base64'));const movie=Buffer.from(result.movie,'base64');await writeFile(out+'/transitions.webm',movie);delete result.board;delete result.movie;await writeFile(out+'/report.json',JSON.stringify({...result,inputs,videoSha256:hash(movie)},null,2)+'\n');console.log(JSON.stringify({out,checks:result.checks}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
