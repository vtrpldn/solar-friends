import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const subject=process.argv.includes('--feed')?'feeding':process.argv.includes('--tend')?'tending':process.argv.includes('--water')?'watering':'cooking',baseIndex={cooking:0,watering:4,tending:8,feeding:12}[subject];
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async n=>JSON.parse(await readFile(`${root}/${n}`));
const definition=await read('composed-family-draft-v2.json'),binding=await read('body-binding-v1.json'),registration=await read(`${subject}-equipment-atlas-draft-v1.json`),masks=await read(`${subject}-hand-masks-draft-v1.json`),sources={};
for(const [id,s]of Object.entries(definition.sources)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={data:bytes.toString('base64'),sourceHash:s.sha256};}
const tools={};
if(baseIndex){const bundle=JSON.parse(await readFile('web/art/characters/relaxed-sleep-v1/bundle-v1.json'));for(const [id,spec]of Object.entries(registration.sources)){const entry=Object.values(bundle.sources).find(s=>s.sha256===spec.sha256);assert(entry,'Equipment source must be in the closed source catalog');const b=await readFile('web'+entry.url);assert.equal(hash(b),spec.sha256);tools[id]={data:b.toString('base64'),sourceHash:hash(b)};}}
else for(const [id,file]of [['pot','cooking-parts-candidate-v1.png'],['spoon','cooking-spoon-angles-candidate-v1.png']]){const b=await readFile(`${root}/${file}`);assert.equal(hash(b),registration.sources[id].sha256);tools[id]={data:b.toString('base64'),sourceHash:hash(b)};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/cooking-motion`);
 const result=await page.evaluate(async({definition,binding,registration,masks,sources,tools,baseIndex,subject})=>{
  const {prepareComposedResidentFamily}=await import('/character-composed-family.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{paintRegisteredEquipmentAtlas}=await import('/character-equipment-atlas.js'),{composeEquipmentAppearance}=await import('/character-equipment-appearance.js'),{advanceResidentAnimation,drawResidentAnimation}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');
  const decode=async map=>{const out={};for(const [id,s]of Object.entries(map)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();out[id]={image,sourceHash:s.sourceHash};}return out;};
  const loaded=await decode(sources),equipmentSources=await decode(tools),body=await prepareBodyFamily({ownership:definition.ownership,sources:Object.fromEntries(Object.entries(definition.bodySources).map(([id,key])=>[id,loaded[key]]))}),subjects=[];
  const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=760;document.body.replaceChildren(canvas);const ctx=canvas.getContext('2d'),scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  try{
   for(const hair of ['side-part-v1','short-curls-v1']){
    const bundle=await prepareComposedResidentFamily({definition,sources:loaded,recipe:{schema:2,family:definition.id,hair,hairColour:'silver',hat:'straw-v1',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}}}),frames=[];subjects.push({hair,bundle,frames});
    for(let i=0;i<4;i++){const index=i+baseIndex,equipment=paintRegisteredEquipmentAtlas({binding,registration,sources:equipmentSources,sheet:'activities',index});try{frames.push(await composeEquipmentAppearance({body:body.frameForPose('activities',index),binding,mask:{schema:1,body:binding,sheet:'activities',index,size:masks.size,polygons:masks.poses[i].polygons},sheet:'activities',index,appearance:bundle.provider.frameForPose('activities',index),origin:bundle.provider.frameOriginForPose('activities',index),equipment}));}finally{equipment.width=equipment.height=0;}}
   }
   const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();let previous=null,frames=0,last=performance.now();const start=last,seen=new Set(),changes=[];
   try{while(performance.now()-start<10200){const now=performance.now(),seconds=(now-start)/1000,task=seconds<.8||seconds>=9?'stretch':baseIndex===0?'cook':baseIndex===4?'water':'garden',animation=advanceResidentAnimation(previous,{id:1,x:0,y:0,target_x:0,target_y:0,task,worksiteKind:baseIndex===12?'goat_pasture':undefined},0,(now-last)/1000,'neutral-v1');last=now;
    for(const layer of animation.layers)if(layer.weight>0)seen.add(`${layer.sheet}:${layer.row*4+layer.frame}`);
    if(animation.mode!==previous?.mode)changes.push({mode:animation.mode,seconds});previous=animation;
    ctx.fillStyle='#e3d8b6';ctx.fillRect(0,0,1100,760);
    for(const [row,subject]of subjects.entries())for(const [facing,x,night]of [[1,250,0],[-1,800,1]]){
     const provider={...subject.bundle.provider,interpolation:'keyframes',frameForPose:(s,i)=>s==='activities'&&i>=baseIndex&&i<baseIndex+4?subject.frames[i-baseIndex].frame:subject.bundle.provider.frameForPose(s,i),frameOriginForPose:(s,i)=>s==='activities'&&i>=baseIndex&&i<baseIndex+4?subject.frames[i-baseIndex].origin:subject.bundle.provider.frameOriginForPose(s,i)};
     ctx.save();ctx.fillStyle=night?'#233b47':'#93a653';ctx.fillRect(x-245,row*370+35,490,325);ctx.filter=unlitFilter(night);for(const [width,dx,y]of [[230,0,300],[48,190,345]])drawResidentAnimation(ctx,scratch,provider,{...animation,facing},x+dx,row*370+y,width);ctx.restore();
    }
    ctx.fillStyle='#483a27';ctx.font='15px monospace';ctx.fillText(`Composed ${['cooking','watering','tending','feeding'][baseIndex/4]} / ${animation.mode} / ${seconds.toFixed(3)}s / side-part above, curls below`,10,22);frames++;await new Promise(requestAnimationFrame);
   }}finally{recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());}
   const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {movie:btoa(binary),frames,changes,seen:[...seen]};
  }finally{for(const s of subjects){for(const f of s.frames)f.frame.width=f.frame.height=0;s.bundle.dispose();}body.dispose();canvas.width=canvas.height=scratch.width=scratch.height=0;}
 },{definition,binding,registration,masks,sources,tools,baseIndex,subject});
 assert.deepEqual(result.changes.map(c=>c.mode),['breathe',['cook','water','tend','feed'][baseIndex/4],'breathe']);for(let i=0;i<4;i++)assert(result.seen.includes(`activities:${i+baseIndex}`));
 const movie=Buffer.from(result.movie,'base64');delete result.movie;await writeFile(`${root}/${subject}-composed-motion-v1.webm`,movie);
 const inputs={};for(const p of ['scripts/review-broad-cooking-motion.mjs','web/character-equipment-appearance.js','web/character-equipment-atlas.js',`${root}/${subject}-equipment-atlas-draft-v1.json`,`${root}/${subject}-hand-masks-draft-v1.json`,`${root}/composed-family-draft-v2.json`])inputs[p]=hash(await readFile(p));
 await writeFile(`${root}/${subject}-composed-motion-v1.json`,JSON.stringify({status:'Recorded; decode and visual review pending',...result,videoSha256:hash(movie),inputs},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
