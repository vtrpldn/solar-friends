import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),definition=JSON.parse(await readFile(root+'/composed-family-draft-v5.json')),sources={},subject='feeding',baseIndex=12;
for(const [id,s]of Object.entries(definition.sources)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={data:bytes.toString('base64'),sourceHash:s.sha256};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/cooking-motion`);
 const result=await page.evaluate(async({definition,sources,baseIndex,subject})=>{
  const {prepareComposedResidentFamily}=await import('/character-composed-family.js'),{advanceResidentAnimation,drawResidentAnimation,presentedPoseLayers}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');
  const decode=async map=>{const out={};for(const [id,s]of Object.entries(map)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();out[id]={image,sourceHash:s.sourceHash};}return out;};
  const loaded=await decode(sources),subjects=[];
  const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=760;document.body.replaceChildren(canvas);const ctx=canvas.getContext('2d'),scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  try{
   for(const hair of ['side-part-v1','short-curls-v1']){
    const bundle=await prepareComposedResidentFamily({definition,sources:loaded,recipe:{schema:2,family:definition.id,hair,hairColour:'silver',hat:'straw-v1',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}}});subjects.push({hair,bundle});
   }
   const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();let previous=null,frames=0,last=performance.now();const start=last,seen=new Set(),changes=[],seenSteps=new Set(),phaseEvents=[],rawSamples=[],sampled=new Set();let lastStep=null;
   try{while(performance.now()-start<10200){const now=performance.now(),seconds=(now-start)/1000,task=seconds<.8||seconds>=9?'stretch':'garden',animation=advanceResidentAnimation(previous,{id:1,x:0,y:0,target_x:0,target_y:0,task,worksiteKind:baseIndex===12?'goat_pasture':undefined},0,(now-last)/1000,'neutral-v1');last=now;
    for(const layer of animation.layers)if(layer.weight>0)seen.add(`${layer.sheet}:${layer.row*4+layer.frame}`);
    for(const p of presentedPoseLayers(animation.layers,'keyframes'))if(p.sheet==='activities'){const step=`${p.sheet}:${p.row*4+p.frame}:${p.sequenceIndex}`;seenSteps.add(step);if(step!==lastStep){phaseEvents.push({step,seconds});lastStep=step;}}
    if(animation.mode!==previous?.mode)changes.push({mode:animation.mode,seconds});previous=animation;
    ctx.fillStyle='#e3d8b6';ctx.fillRect(0,0,1100,760);
    for(const [row,subject]of subjects.entries())for(const [facing,x,night]of [[1,250,0],[-1,800,1]]){
     const provider={...subject.bundle.provider,interpolation:'keyframes'};
     ctx.save();ctx.fillStyle=night?'#233b47':'#93a653';ctx.fillRect(x-245,row*370+35,490,325);ctx.filter=unlitFilter(night);for(const [width,dx,y]of [[230,0,300],[48,190,345]])drawResidentAnimation(ctx,scratch,provider,{...animation,facing},x+dx,row*370+y,width);ctx.restore();
    }
    ctx.fillStyle='#483a27';ctx.font='15px monospace';ctx.fillText(`Composed ${'integrated feeding returns'} / ${animation.mode} / ${seconds.toFixed(3)}s / side-part above, curls below`,10,22);for(const step of ['activities:13:1','activities:14:2','activities:14:4','activities:13:5'])if(!sampled.has(step)&&lastStep===step&&seconds-phaseEvents.at(-1).seconds>=.16){sampled.add(step);rawSamples.push({step,seconds,data:canvas.toDataURL('image/png').split(',')[1]});}frames++;await new Promise(requestAnimationFrame);
   }}finally{recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());}
   const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {movie:btoa(binary),frames,changes,rawSamples,seenSteps:[...seenSteps],phaseEvents,seen:[...seen]};
  }finally{for(const s of subjects){s.bundle.dispose();}canvas.width=canvas.height=scratch.width=scratch.height=0;}
 },{definition,sources,baseIndex,subject});
 assert.deepEqual(result.changes.map(c=>c.mode),['breathe','feed','breathe']);for(let i=0;i<4;i++)assert(result.seen.includes(`activities:${i+baseIndex}`));
 for(const step of ['activities:13:1','activities:14:2','activities:14:4','activities:13:5'])assert(result.seenSteps.includes(step));
 assert.equal(result.rawSamples.length,4);for(const sample of result.rawSamples){const bytes=Buffer.from(sample.data,'base64');delete sample.data;sample.path=`${root}/feeding-return-raw-${sample.step.replaceAll(':','-')}-v5.png`;sample.sha256=hash(bytes);await writeFile(sample.path,bytes);}
 const movie=Buffer.from(result.movie,'base64');delete result.movie;await writeFile(`${root}/feeding-return-motion-v5.webm`,movie);
 const inputs={};for(const p of ['scripts/review-integrated-feeding-motion.mjs','web/character-equipment-appearance.js','web/character-equipment-atlas.js',`${root}/composed-family-draft-v5.json`,'web/character-composed-family.js','web/character-equipped-family.js'])inputs[p]=hash(await readFile(p));
 await writeFile(`${root}/feeding-return-motion-v5.json`,JSON.stringify({status:'Recorded; decode and visual review pending',...result,videoSha256:hash(movie),inputs},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
