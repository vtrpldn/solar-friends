// Native activity cadence review with a partial authored body provider.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const clip=process.argv[2];assert(['cook','water','tend','feed'].includes(clip),'Choose an activity');
const row=['cook','water','tend','feed'].indexOf(clip),revision=clip==='cook'?'v2':'v1';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex');
const paths={standing:root+'/breathe-candidate-v1.png',work:root+`/activity-${clip}-candidate-${revision}.png`},sources={};
for(const [key,path]of Object.entries(paths)){const b=await readFile(path);sources[key]={path,sha256:hash(b),data:b.toString('base64')};}
const registrations={standing:JSON.parse(await readFile(root+'/breathe-registration-v1.json')),work:JSON.parse(await readFile(root+`/activity-${clip}-registration-${revision}.json`))};
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/work-motion`);
 const result=await page.evaluate(async({sources,registrations,clip,row})=>{
  const {prepareContactAtlasFrames}=await import('/character-contact-atlas.js');
  const {advanceResidentAnimation,drawResidentAnimation,presentedPoseLayers,residentClips}=await import('/resident-animation.js');
  const {unlitFilter}=await import('/power.js');
  const frames={},contacts={};
  for(const [key,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();const p=prepareContactAtlasFrames({image,sourceHash:s.sha256},registrations[key]);frames[key]=p.frames;contacts[key]=p.contacts;}
  function selected(sheet,index){if(!Number.isInteger(index))throw Error('Use an authored integer pose');if(sheet==='base'&&index>=8&&index<12)return ['standing',index-8];if(sheet==='activities'&&index>=row*4&&index<row*4+4)return ['work',index-row*4];throw Error('Body pose is unauthored');}
  const provider={animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){const [key,i]=selected(sheet,index);return frames[key][i];},contactForPose(sheet,index){const [key,i]=selected(sheet,index);return contacts[key][i];}};
  let refusals=0;for(const index of [-1,.5,16,17,18,19])for(const method of ['frameForPose','contactForPose']){try{provider[method]('activities',index);}catch{refusals++;}}
  const canvas=document.createElement('canvas');canvas.width=800;canvas.height=360;document.body.replaceChildren(canvas);const ctx=canvas.getContext('2d'),scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  const stream=canvas.captureStream(30),type='video/webm;codecs=vp9',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.start();const beginning=performance.now(),recordings=[],cycleSeconds=residentClips[clip].frames.length/residentClips[clip].fps,activeEnd=.8+cycleSeconds*2,totalMs=(activeEnd+1)*1000;
  try{for(const night of [0,1]){const start=performance.now(),modes=[],seen=new Set();let previous=null,last=start,renderCalls=0;
   while(performance.now()-start<totalMs){const now=performance.now(),seconds=(now-start)/1000,working=seconds>=.8&&seconds<activeEnd;
    const animation=advanceResidentAnimation(previous,{id:1,x:4,y:4,target_x:4,target_y:4,task:working?({cook:'cook',water:'water',tend:'garden',feed:'garden'}[clip]):'stretch',worksiteKind:clip==='feed'?'goat_pasture':undefined},0,(now-last)/1000,'neutral-v1');
    if(animation.mode!==(working?clip:'breathe'))throw Error('Unexpected native work mode');if(animation.mode!==previous?.mode)modes.push({mode:animation.mode,seconds});previous=animation;last=now;
    for(const p of presentedPoseLayers(animation.layers,'keyframes')){if(p.sheet==='activities')seen.add(p.row*4+p.frame);};
    ctx.fillStyle=night?'#233b47':'#93a653';ctx.fillRect(0,0,800,360);ctx.save();ctx.filter=unlitFilter(night);
    for(const [width,x,y]of [[220,250,270],[48,650,325]])drawResidentAnimation(ctx,scratch,provider,{...animation,facing:night?-1:1},x,y,width);
    ctx.restore();ctx.fillStyle='#fff';ctx.font='14px monospace';ctx.fillText(`Broader body / ${night?'mirrored night':'day'} / native ${animation.mode} ${seconds.toFixed(3)}s`,12,24);renderCalls++;await new Promise(requestAnimationFrame);
   }
   recordings.push({night,offsetMs:start-beginning,elapsedMs:performance.now()-start,cycleSeconds,modes,seen:[...seen].sort((a,b)=>a-b),renderCalls});
  }}finally{recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();for(const list of Object.values(frames))for(const f of list)f.width=f.height=0;scratch.width=scratch.height=0;}
  const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {movie:btoa(binary),recordings,refusals};
 },{sources,registrations,clip,row});
 assert.deepEqual(errors,[]);assert.equal(result.refusals,12);for(const r of result.recordings){assert.deepEqual(r.modes.map(m=>m.mode),['breathe',clip,'breathe']);assert.deepEqual(r.seen,[row*4,row*4+1,row*4+2,row*4+3]);}
 const movie=Buffer.from(result.movie,'base64');delete result.movie;await writeFile(root+`/activity-${clip}-motion-${revision}.webm`,movie);
 const inputs={};for(const path of [...Object.values(paths),root+'/breathe-registration-v1.json',root+`/activity-${clip}-registration-${revision}.json`,'scripts/review-broad-activity-motion.mjs','web/character-contact-frame.js','web/character-contact-atlas.js','web/resident-animation.js','web/resident-animation-profiles.js','web/sprite-frames.js','web/power.js'])inputs[path]=hash(await readFile(path));
 await writeFile(root+`/activity-${clip}-motion-${revision}.json`,JSON.stringify({schema:1,scope:'Partial internal provider; native mode/pose selection and ground alignment recording only. No fitted equipment, complete anatomical family, public integration or physical frame pacing claim.',...result,inputs,videoSha256:hash(movie),errors},null,2)+'\n');console.log(JSON.stringify({recordings:result.recordings,refusals:result.refusals,errors}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
