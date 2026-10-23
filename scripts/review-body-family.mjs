// Internal source-family review; never installs a recipe or changes saved people.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',ownership=JSON.parse(await readFile(root+'/ownership-v1.json','utf8')),files=JSON.parse(await readFile(root+'/source-files-v1.json','utf8')),sources={},video=process.argv.includes('--video');
for(const [id,file]of Object.entries(files)){const bytes=await readFile(file),sourceHash=createHash('sha256').update(bytes).digest('hex');assert.equal(sourceHash,ownership.sources[id].sha256);sources[id]={sourceHash,data:bytes.toString('base64')};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/body-family-review`);
 const result=await page.evaluate(async({ownership,sources,video})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{drawResidentAnimation,advanceResidentAnimation}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');
  const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const family=await prepareBodyFamily({ownership,sources:loaded}),provider={frameForPose:family.frameForPose,animationProfile:'neutral-v1',interpolation:'keyframes'},surface=document.createElement('canvas');surface.width=surface.height=256;
  const board=document.createElement('canvas');board.width=2048;board.height=1536;const b=board.getContext('2d');b.fillStyle='#e8dfbf';b.fillRect(0,0,board.width,board.height);let n=0;
  for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++,n++){const x=n%8*256,y=Math.floor(n/8)*256;b.drawImage(family.frameForPose(sheet,index),x,y-8);b.fillStyle='#483a27';b.font='11px monospace';b.fillText(`${sheet}:${index} ← ${ownership.poses[sheet][index].source}`,x+8,y+250);}
  const transitions=document.createElement('canvas');transitions.width=1600;transitions.height=1920;const tc=transitions.getContext('2d');let updates=0,samples=0;
  try{
   for(const [group,[from,to]]of [['walk','breathe'],['breathe','walk'],['walk','work'],['work','walk']].entries())for(const night of [0,1]){
    const row=group*2+night;tc.fillStyle=night?'#263c4b':'#e8dfbf';tc.fillRect(0,row*240,1600,240);let previous={mode:from,phase:.4,facing:1,transition:.18,animationProfile:'neutral-v1',x:4,y:4};
    for(let tick=0;tick<=12;tick++){
     const resident={id:1,x:4,y:4,target_x:to==='walk'?5:4,target_y:4,task:to==='work'?'build':'stretch'},animation=advanceResidentAnimation(previous,resident,0,.016,'neutral-v1');
     if(animation.mode!==to)throw Error('Unexpected native transition mode');
     if([0,4,8,12].includes(tick)){const x=tick/4*400,y=row*240;tc.save();tc.filter=unlitFilter(night);drawResidentAnimation(tc,surface,provider,{...animation,facing:night?-1:1},x+200,y+200,200);tc.restore();tc.fillStyle=night?'#f5e5ba':'#483a27';tc.font='12px monospace';tc.fillText(`${from} → ${to} +${tick*16}ms ${night?'mirror/night':'day'}`,x+8,y+226);samples++;}previous=animation;updates++;
    }
   }
   let movie=null,renderCalls=0;const recordings=[];
   if(video){
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=320;const ctx=canvas.getContext('2d');document.body.replaceChildren(canvas);ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,600,320);drawResidentAnimation(ctx,surface,provider,advanceResidentAnimation(null,{id:1,x:4,y:4,target_x:5,target_y:4,task:'stretch'},0,0,'neutral-v1'),300,290,240);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const stream=canvas.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.start();stream.getVideoTracks()[0].requestFrame();const beginning=performance.now();
    try{for(const night of [0,1])for(const other of ['breathe','work']){
     const start=performance.now();let previous=null,last=start,count=0;
     while(performance.now()-start<1600){const now=performance.now(),elapsed=(now-start)/1000,walking=elapsed<.55||elapsed>=1.05,resident={id:1,x:4,y:4,target_x:walking?5:4,target_y:4,task:other==='work'?'build':'stretch'},animation=advanceResidentAnimation(previous,resident,0,(now-last)/1000,'neutral-v1');last=now;previous=animation;
      ctx.fillStyle=night?'#263c4b':'#e8dfbf';ctx.fillRect(0,0,600,320);ctx.save();ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,surface,provider,{...animation,facing:night?-1:1},300,290,240);ctx.restore();ctx.fillStyle=night?'#f5e5ba':'#483a27';ctx.font='14px monospace';ctx.fillText(`walk → ${other} → walk · ${night?'mirror/night':'day'} · ${animation.mode} · ${elapsed.toFixed(3)}s`,12,24);count++;renderCalls++;await new Promise(requestAnimationFrame);
     }recordings.push({other,night,facing:night?-1:1,offsetMs:start-beginning,elapsedMs:performance.now()-start,renderCalls:count});
    }}finally{recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();}
    const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));movie=btoa(binary);
   }
   return {scope:'Internal complete multi-source body and native walk/breathe/work transitions only. No public recipes, clothing/equipment, travel cadence or frame-pacing acceptance.',binding:family.binding,updates,samples,recordings,renderCalls,movie,board:board.toDataURL('image/png').split(',')[1],transitions:transitions.toDataURL('image/png').split(',')[1]};
  }finally{family.dispose();}
 },{ownership,sources,video});
 assert.deepEqual(errors,[]);assert.equal(result.updates,104);assert.equal(result.samples,32);const label=video?'v1':'v1-static';for(const key of ['board','transitions']){await writeFile(root+'/review-'+label+'-'+key+'.png',Buffer.from(result[key],'base64'));delete result[key];}if(result.movie){const bytes=Buffer.from(result.movie,'base64');result.videoSha256=createHash('sha256').update(bytes).digest('hex');await writeFile(root+'/review-'+label+'-transitions.webm',bytes);}delete result.movie;assert.deepEqual(result.binding,JSON.parse(await readFile(root+'/binding-v2.json','utf8')));delete result.binding;await writeFile(root+'/review-'+label+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
