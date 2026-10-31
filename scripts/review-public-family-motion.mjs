import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'assets/art-direction/character-prototype-v1/body-family-relaxed-v1/public-motion-v1',shirt=process.argv.includes('--shirt'),inputs={},sha=bytes=>createHash('sha256').update(bytes).digest('hex');await mkdir(output,{recursive:true});inputs['scripts/review-public-family-motion.mjs']=sha(await readFile('scripts/review-public-family-motion.mjs'));const server=await serve(0,{async handle(_req,_res,path){if(/\.(js|json|png|wasm)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/public-family-motion');
 const result=await page.evaluate(async shirt=>{
  const {FRAME_ANCHOR}=await import('/sprite-frames.js'),{createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{residentClips,sampleResidentClip,advanceResidentAnimation,drawResidentAnimation,presentedPoseLayers}=await import('/resident-animation.js'),{residentClipTiming}=await import('/resident-animation-profiles.js'),{unlitFilter}=await import('/power.js');
  const library=createResidentAppearanceLibrary(),recipes=[];
  for(const hair of ['short-curls-v1','side-part-v1'])for(const equipped of [false,true])recipes.push({...residentPartRecipe({body:'relaxed-v1',hair,hairColour:'silver',materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'},...(equipped?{hat:'straw-v1',facialHair:'short-chestnut-v1'}:{})}),assetVersion:shirt?'resident-parts-v6':'resident-parts-v5'});
  library.setActive(recipes);const providers=await Promise.all(recipes.map(r=>library.prepare(r)));providers.push(await library.prepare({preset:'bento',version:1}));
  const canvas=document.createElement('canvas'),surface=document.createElement('canvas');canvas.width=1000;canvas.height=540;surface.width=surface.height=256;document.body.replaceChildren(canvas);const ctx=canvas.getContext('2d'),segments=[];
  for(const [mode,clip]of Object.entries(residentClips)){const timing=residentClipTiming('neutral-v1',mode),cycle=timing?timing.durations.reduce((a,b)=>a+b,0):clip.fps?clip.frames.length/clip.fps:1;segments.push({mode,kind:'clip',duration:Math.max(.8,cycle+.15)});}
  for(const [mode,clip]of Object.entries(residentClips).filter(([mode])=>mode!=='walk')){const timing=residentClipTiming('neutral-v1',mode),cycle=timing?timing.durations.reduce((a,b)=>a+b,0):clip.fps?clip.frames.length/clip.fps:1;segments.push({mode,kind:'transition',duration:cycle+.65});}
  const stream=canvas.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});let calls=0,checked=0,boundsChecked=0;
  try{
   recorder.start();const beginning=performance.now();
   for(const segment of segments){const start=performance.now();let previous=null,prior=0;const targetPoses=new Set();segment.offsetMs=start-beginning;
    while(performance.now()-start<segment.duration*1000){const seconds=(performance.now()-start)/1000;let animation;
     if(segment.kind==='transition'){
      const walking=seconds<.25||seconds>segment.duration-.25,r={id:0,x:seconds,y:0,target_x:walking?seconds+1:seconds,target_y:0,task:segment.mode==='breathe'?'idle':segment.mode==='sit'?'rest':segment.mode==='work'?'build':segment.mode==='tend'?'garden':segment.mode==='feed'?'garden':segment.mode,worksiteKind:segment.mode==='feed'?'goat_pasture':null};
      let minutes=0;
      if(segment.mode==='look')r.task='birdwatch';
      if(['breathe','stretch'].includes(segment.mode)){r.task='stretch';minutes=segment.mode==='stretch'?8:0;}
      if(['wave','relax'].includes(segment.mode)){r.task='socialize';minutes=segment.mode==='relax'?24:0;}
      animation=advanceResidentAnimation(previous,r,minutes,Math.max(0,seconds-prior),'neutral-v1');if(animation.mode!==(walking?'walk':segment.mode))throw Error('Task transition did not reach its named activity');previous=animation;prior=seconds;
     }else animation={layers:sampleResidentClip(segment.mode,seconds,'neutral-v1'),facing:1,breath:1};
     if(segment.kind==='transition')for(const pose of presentedPoseLayers(animation.layers,providers[0].interpolation)){const clip=residentClips[segment.mode];if(pose.sheet===clip.sheet&&pose.row===clip.row)targetPoses.add(pose.sheet+':'+(pose.row*4+pose.frame));}
     ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,1000,270);ctx.fillStyle='#263c4b';ctx.fillRect(0,270,1000,270);
     for(const night of [0,1]){ctx.save();ctx.filter=unlitFilter(night);for(const [i,provider]of providers.entries()){
      const layers=i===4&&segment.kind==='clip'?sampleResidentClip(segment.mode,seconds):animation.layers;
      if(i<4){const poses=presentedPoseLayers(layers,provider.interpolation);if(poses.length!==1||poses[0].weight!==1)throw Error('Composed motion lost its whole key pose');for(const pose of poses){const frame=provider.frameForPose(pose.sheet,pose.row*4+pose.frame,pose);if(frame.width!==256||frame.height!==256)throw Error('Motion frame size changed');checked++;}}
      const x=100+i*200,y=200+night*270,width=180;
      for(const pose of presentedPoseLayers(layers,provider.interpolation)){
       const index=pose.row*4+pose.frame,frame=provider.frameForPose(pose.sheet,index,pose),contact=provider.contactForPose?.(pose.sheet,index,pose)??[128,FRAME_ANCHOR*256],origin=provider.frameOriginForPose?.(pose.sheet,index,pose)??[0,0];
       const left=x+(origin[0]-contact[0])*width/256,right=left+frame.width*width/256,top=y+(origin[1]-contact[1])*width/256,bottom=top+frame.height*width/256;
       if(left<i*200||right>(i+1)*200||top<night*270+28||bottom>(night+1)*270)throw Error('Complete resident frame must fit its own review slot without covering another row.');boundsChecked++;
      }
      drawResidentAnimation(ctx,surface,provider,{...animation,layers,facing:night?-1:1},x,y,width);
     }ctx.restore();ctx.fillStyle=night?'#f5e5ba':'#483a27';ctx.font='13px monospace';ctx.fillText(segment.kind+' '+segment.mode+' '+seconds.toFixed(3)+'s | curls / hat+beard / sidepart / hat+beard / Bento',12,22+night*270);}
     calls++;await new Promise(requestAnimationFrame);
    }
    segment.elapsedMs=performance.now()-start;if(segment.kind==='transition'){segment.targetPoseKeys=[...targetPoses];if(targetPoses.size<(segment.mode==='sleep'?1:2))throw Error('Transition did not visibly reach enough painted activity poses.');}
   }
   recorder.stop();await stopped;const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return {segments,calls,checked,boundsChecked,movie:btoa(binary),recipes,scope:'Public native pose loops and production task-state transitions, day/mirrored night, four corrected appearances and Bento. Review harness does not simulate village travel or establish frame-pacing performance.'};
  }finally{if(recorder.state==='recording')recorder.stop();for(const track of stream.getTracks())track.stop();surface.width=surface.height=0;canvas.width=canvas.height=0;}
 },shirt);assert.deepEqual(errors,[]);assert.equal(result.segments.length,25);const bytes=Buffer.from(result.movie,'base64');delete result.movie;result.videoSha256=createHash('sha256').update(bytes).digest('hex');for(const [file,hash]of Object.entries(inputs))assert.equal(sha(await readFile(file)),hash,file+' changed during capture');result.sources=inputs;result.browserErrors=errors;result.shirt=shirt;await writeFile(output+'/motion.webm',bytes);await writeFile(output+'/recording.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({segments:result.segments.length,calls:result.calls,checked:result.checked,boundsChecked:result.boundsChecked,videoSha256:result.videoSha256}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
