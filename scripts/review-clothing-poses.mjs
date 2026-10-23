// Internal garment prototype: compose before hair with the shared body renderer.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const [name,version]=process.argv.slice(2);assert(/^[a-z0-9-]+$/.test(name??'')&&/^v[1-9][0-9]?$/.test(version??''));
const clip=process.argv.find(arg=>arg.startsWith('--clip='))?.slice(7)??'breathe';assert(['breathe','walk'].includes(clip));
const root='assets/art-direction/character-prototype-v1/'+name;await mkdir(root,{recursive:true});
const collections=process.argv.find(arg=>arg.startsWith('--collections='))?.slice(14).split(',')??[name],sources=[];
for(const collection of collections){
 assert(/^[a-z0-9-]+$/.test(collection));const folder='assets/art-direction/character-prototype-v1/'+collection,intent=JSON.parse(await readFile(folder+'/registration-intent.json','utf8')),source=await readFile(folder+'/candidate-'+version+'.png'),sourceHash=createHash('sha256').update(source).digest('hex');
 for(const [file,hash]of Object.entries(intent.guideHashes))assert.equal(createHash('sha256').update(await readFile(folder+'/'+file)).digest('hex'),hash);
 const audit=JSON.parse(await readFile(folder+'/candidate-'+version+'-audit.json','utf8'));assert(audit.ok);assert.equal(audit.sha256,sourceHash);
 const foregroundBytes=await readFile(folder+'/body-foreground-'+version+'.json').catch(error=>{if(error.code==='ENOENT')return null;throw error;}),foreground=foregroundBytes?JSON.parse(foregroundBytes):null;
 const registrations=intent.poses.map(s=>({reviewSchema:1,part:'short-sleeve-v1',sheet:s.sheet,index:s.index,crop:s.crop,bodyFrameSha256:s.bodyFrameSha256,bounds:[s.bounds[0],s.bounds[1],s.bounds[2]-s.bounds[0],s.bounds[3]-s.bounds[1]],source:{size:1254,sha256:sourceHash,rect:s.tile},...(foreground?{foreground}:{})}));
 await writeFile(folder+'/registrations-'+version+'.json',JSON.stringify(registrations,null,2)+'\n');sources.push({collection,intent,sourceHash,...(foregroundBytes?{foregroundSha256:createHash('sha256').update(foregroundBytes).digest('hex')}:{}),registrations,data:source.toString('base64')});
}
const registrations=sources.flatMap(source=>source.registrations);assert(registrations.length<=9);
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/clothing-review`);
 const result=await page.evaluate(async({sources,video,clip})=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{preparedFrames}=await import('/sprite-frames.js'),{attachmentBinding}=await import('/character-attachments.js'),{createBodyMaterialModel,defaultBodyMaterials}=await import('/character-materials.js'),{composeClothingPose}=await import('/character-clothing.js'),{prepareRegisteredHair}=await import('/character-hair.js'),{extractRegisteredAtlasPart}=await import('/character-atlas-part.js'),{canonical}=await import('/editor/journal.js');
  const {createBodyForegroundLayers}=await import('/character-foreground.js');
  const {drawResidentAnimation,sampleResidentClip,residentClips,advanceResidentAnimation}=await import('/resident-animation.js'),{residentClipTiming}=await import('/resident-animation-profiles.js'),{unlitFilter}=await import('/power.js');
  const files={base:'body-neutral-base.png',idle:'body-neutral-idle-candidate-v2.png',activities:'body-neutral-activities-candidate-v1.png'},frames={},hashes={},load=file=>loadCharacterImageSource('/art/characters/prototype-v1/'+file),read=async file=>(await fetch('/art/characters/prototype-v1/'+file)).json();
  for(const [sheet,file]of Object.entries(files)){const source=await load(file);frames[sheet]=preparedFrames(source.image,{referenceRow:sheet==='base'?2:0});hashes[sheet]=source.sourceHash;}
  const binding=await attachmentBinding(frames,hashes),entries=new Map();
  for(const source of sources){if(canonical(binding)!==canonical(source.intent.body))throw Error('Body differs from frozen garment guide');const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();for(const registration of source.registrations){const key=registration.sheet+':'+registration.index;if(entries.has(key))throw Error('Overlapping garment pose sources');entries.set(key,{image,sourceHash:source.sourceHash,registration});}}
  const registrations=[...entries.values()].map(entry=>entry.registration),materials=createBodyMaterialModel(frames,await read('body-materials-v1.json'),{sourceHashes:hashes});
  const spec=residentClips[clip],indices=[...new Set(spec.frames.map(frame=>spec.row*4+frame))],completeClip=indices.every(index=>entries.has(spec.sheet+':'+index)),retained=new Map();if(video&&!completeClip)throw Error('Record only a complete registered '+clip+' pose set');
  const width=registrations.length*400,board=document.createElement('canvas');board.width=width;board.height=1800;const b=board.getContext('2d');b.fillStyle='#e8dfbf';b.fillRect(0,0,width,1800);
  const details=document.createElement('canvas');details.width=width;details.height=600;const d=details.getContext('2d');d.fillStyle='#e8dfbf';d.fillRect(0,0,width,600);
  const profiles=['short-curls-v1','side-part-v1'].flatMap(hair=>['warm','sunlit','copper'].map(skin=>({hair,skin}))),coverage=[];let outsideChecks=0,refused=0,foregroundChecks=0,cleanupChecks=0,handChecks=0,occlusionChecks=0,occludedBodyPixels=0,edgeBlendPixels=0;
  for(const [row,profile]of profiles.entries()){
   const owner=await read(profile.hair==='side-part-v1'?'hair-sidepart-all-v1-registration.json':'hair-curls-all-v1-registration.json'),painted=materials.provider({...defaultBodyMaterials,skin:profile.skin});
   for(const [column,registration]of registrations.entries()){
    const {sheet,index,crop}=registration,body=frames[sheet][index],appearanceBody=painted.frameForPose(sheet,index),clothing=entries.get(sheet+':'+index),{image}=clothing;
    const dressed=composeClothingPose({body,appearanceBody,binding,...clothing,sheet,index}).frame;
    const a=appearanceBody.getContext('2d').getImageData(0,0,256,256).data,c=dressed.getContext('2d').getImageData(0,0,256,256).data;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(x<crop[0]||x>=crop[0]+crop[2]||y<crop[1]||y>=crop[1]+crop[3])for(let k=0;k<4;k++)if(a[(y*256+x)*4+k]!==c[(y*256+x)*4+k])throw Error('Garment altered pixels outside its fixed crop');outsideChecks++;
    if(sheet==='base'&&index>=8&&index<=11){for(let p=148*256*4;p<a.length;p++)if(a[p]!==c[p])throw Error('Breathing shirt changed hands, shorts or lower-body pixels');handChecks++;}
    // Opaque forearms stay exact; their antialiased edges must instead blend
    // once against cloth behind them. Transparent gaps may gain shirt volume.
    if(sheet==='base'&&index>=0&&index<=3){for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(y>=150||(a[(y*256+x)*4+3]===255&&((y>=125&&x<112)||(y>=128&&x>=190))))for(let k=0;k<4;k++)if(a[(y*256+x)*4+k]!==c[(y*256+x)*4+k])throw Error(`Walking shirt base ${index} changed protected pixel ${x},${y} channel ${k}: ${a[(y*256+x)*4+k]} to ${c[(y*256+x)*4+k]}`);handChecks++;}
    const pose=owner.poses[sheet][index],source=await load(pose.file),part=extractRegisteredAtlasPart({...source,registration:{sha256:pose.partSha256,size:pose.size,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}}),hair=prepareRegisteredHair({image:part.frame,sourceHash:source.sourceHash,registration:{...pose,body:owner.body}});
    const bare=await hair.compose({body,binding,appearanceBody}),full=await hair.compose({body,binding,appearanceBody,clothing});
    b.drawImage(bare,column*400,row*300,200,250);b.drawImage(full,column*400+200,row*300,200,250);b.fillStyle='#44351f';b.font='12px monospace';b.fillText(`${profile.hair} ${profile.skin} ${sheet} ${index}`,column*400+8,row*300+273);b.fillText('tank top                    short sleeves',column*400+8,row*300+290);
    if(row===0){d.drawImage(full,...crop,column*400,0,400,400);for(const facing of [1,-1]){d.save();d.translate(column*400+(facing===1?100:280),550);d.scale(facing,1);d.drawImage(full,-48,-91,96,96);d.restore();}}
    if(row===0){const overlay=document.createElement('canvas');overlay.width=overlay.height=256;overlay.getContext('2d').drawImage(image,...registration.source.rect,...crop);const alpha=overlay.getContext('2d').getImageData(0,0,256,256).data,mask=materials.mask(sheet,index);let oldTop=0,covered=0;
     const collarLeaks=[];for(let p=0;p<mask.labels.length;p++){
      const y=Math.floor(p/256),r=a[p*4],g=a[p*4+1],blue=a[p*4+2];
      if(mask.labels[p]===2&&y<134&&a[p*4+3]>=240){oldTop++;if(alpha[p*4+3]>=240)covered++;}
      if(y>=65&&y<100&&a[p*4+3]>=240&&r>150&&g/r>=.78&&blue/r>=.52&&alpha[p*4+3]<128)collarLeaks.push([p%256,y]);
     }coverage.push({sheet,index,oldTop,covered,coverage:covered/oldTop,collarLeaks});overlay.width=overlay.height=0;
     if(registration.foreground){
      for(const [start,length]of registration.foreground.runs)for(let p=start;p<start+length;p++){
       const front=a[p*4+3]/255,cloth=alpha[p*4+3]/255;
       if(Math.abs(c[p*4+3]-Math.round((front+cloth*(1-front))*255))>1)throw Error('Forearm alpha was applied more than once');
       if(front===1)for(let k=0;k<4;k++)if(a[p*4+k]!==c[p*4+k])throw Error('Garment painted over an opaque foreground body pixel');
       if(front>0&&cloth>0){occludedBodyPixels++;if(front<1&&cloth<1)edgeBlendPixels++;}
       if(Math.floor(p/256)<150&&a[p*4+3]>=240&&[2,3].includes(mask.labels[p]))throw Error('Forearm ownership includes an old shirt or shorts');
      }occlusionChecks++;
      for(const bad of [{...registration.foreground,index:(index+1)%16},{...registration.foreground,runs:[[0,2],[1,2]]}]){try{composeClothingPose({body,appearanceBody,binding,...clothing,registration:{...registration,foreground:bad},sheet,index});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}}
     }
     for(const bad of [{...clothing,sourceHash:'0'.repeat(64)},{...clothing,registration:{...registration,index:(index+1)%16}},{...clothing,registration:{...registration,crop:[0,0,130,140]}},{...clothing,registration:{...registration,source:{...registration.source,rect:[1200,0,418,418]}}}]){try{composeClothingPose({body,appearanceBody,binding,...bad,sheet,index});throw Error('accepted');}catch(error){if(error.message==='accepted')throw error;refused++;}}
     const foregroundMask={schema:2,body:binding,sheet,index,size:256,runs:[[120*256,136*256]]},layers=await createBodyForegroundLayers({body,binding,mask:foregroundMask,sheet,index,appearanceBody,clothing}),combined=document.createElement('canvas');combined.width=combined.height=256;combined.getContext('2d').drawImage(layers.back,0,0);combined.getContext('2d').drawImage(layers.front,0,0);
     const joined=combined.getContext('2d').getImageData(0,0,256,256).data;if(!joined.every((value,i)=>value===c[i]))throw Error('Foreground split changed garment pixels or alpha');foregroundChecks++;
     for(const canvas of [layers.back,layers.front,combined])canvas.width=canvas.height=0;
     const create=document.createElement,created=[];let rejected=false;
     try{document.createElement=function(...args){const element=create.apply(this,args);if(args[0]==='canvas')created.push(element);return element;};try{await hair.compose({body,binding,appearanceBody,clothing:{...clothing,registration:{...registration,bounds:[0,0,1,1]}}});}catch{rejected=true;refused++;}}
     finally{document.createElement=create;}
     if(!rejected||!created.length||created.some(canvas=>canvas.width!==0||canvas.height!==0)||body.width!==256||appearanceBody.width!==256)throw Error('Rejected garment retained owned canvases or damaged a borrowed body');cleanupChecks++;
    }
    if(completeClip&&profile.skin==='warm'){if(!retained.has(profile.hair))retained.set(profile.hair,new Map());retained.get(profile.hair).set(index,full);}
    else full.width=full.height=0;
    for(const owned of [dressed,bare])owned.width=owned.height=0;
   }
  }
  const extra={},recordings=[];let lightingSamples=0,renderedFrames=0,transitionUpdates=0,transitionSamples=0;
  if(completeClip){
   const providers=[...retained.values()].map(poses=>({animationProfile:'neutral-v1',interpolation:'keyframes',frameForPose(sheet,index){if(sheet!==spec.sheet||!poses.has(index))throw Error('Incomplete clothing clip cannot substitute an uncovered pose');return poses.get(index);}})),surface=document.createElement('canvas');surface.width=surface.height=256;
   const lighting=document.createElement('canvas');lighting.width=indices.length*350;lighting.height=1040;const lc=lighting.getContext('2d');
   for(const [hair,provider]of providers.entries())for(const night of [0,1]){const y=(hair*2+night)*260;lc.fillStyle=night?'#263c4b':'#e8dfbf';lc.fillRect(0,y,lighting.width,260);lc.save();lc.filter=unlitFilter(night);
    for(let column=0;column<indices.length;column++)for(const facing of [1,-1])for(const [size,x,py]of [[120,facing===1?75:245,210],[48,facing===1?155:325,220]]){drawResidentAnimation(lc,surface,provider,{layers:[{sheet:spec.sheet,row:spec.row,frame:indices[column]%4,weight:1}],facing,breath:1},column*350+x,y+py,size);lightingSamples++;}
    lc.restore();lc.fillStyle=night?'#f4e9c8':'#483a27';lc.font='12px monospace';for(let column=0;column<indices.length;column++)lc.fillText(`${hair?'side part':'curls'} ${spec.sheet} ${indices[column]} ${night?'night':'day'}`,column*350+8,y+250);
   }
   extra.lighting=lighting.toDataURL('image/png').split(',')[1];
   if([0,1,2,3,8,9,10,11].every(index=>entries.has('base:'+index))){
    const transitions=document.createElement('canvas');transitions.width=1600;transitions.height=960;const tc=transitions.getContext('2d');tc.fillStyle='#e8dfbf';tc.fillRect(0,0,1600,960);
    for(const [hair,provider]of providers.entries())for(const [row,from]of ['walk','breathe'].entries()){
     let previous={mode:from,phase:.4,facing:1,transition:.18,animationProfile:'neutral-v1',x:4,y:4};
     for(let tick=0;tick<=12;tick++){
      const resident={id:1,x:4,y:4,target_x:from==='walk'?4:5,target_y:4,task:'stretch'},animation=advanceResidentAnimation(previous,resident,0,.016,'neutral-v1');
      if([0,4,8,12].includes(tick)){const x=tick/4*400,y=(hair*2+row)*240;drawResidentAnimation(tc,surface,provider,{...animation,facing:hair?-1:1},x+200,y+200,200);tc.fillStyle='#483a27';tc.font='13px monospace';tc.fillText(`${hair?'side part/mirror':'curls'} ${from} -> ${animation.mode} +${tick*16}ms`,x+8,y+226);transitionSamples++;}
      previous=animation;transitionUpdates++;
     }
    }
    extra.transitions=transitions.toDataURL('image/png').split(',')[1];
   }
   if(video){
    const canvas=document.createElement('canvas');canvas.width=500;canvas.height=300;const ctx=canvas.getContext('2d');document.body.replaceChildren(canvas);const stream=canvas.captureStream(30),type=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm',recorder=new MediaRecorder(stream,{mimeType:type}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});recorder.start();const beginning=performance.now(),timing=residentClipTiming('neutral-v1',clip),cycleSeconds=timing?.durations.reduce((sum,n)=>sum+n,0)??spec.frames.length/spec.fps;
    try{for(const night of [0,1]){const start=performance.now(),targetMs=Math.max(3,cycleSeconds*1.1)*1000;let count=0;while(performance.now()-start<targetMs){ctx.fillStyle=night?'#263c4b':'#e8dfbf';ctx.fillRect(0,0,500,300);ctx.save();ctx.filter=unlitFilter(night);for(const [i,provider]of providers.entries())drawResidentAnimation(ctx,surface,provider,{layers:sampleResidentClip(clip,(performance.now()-start)/1000,'neutral-v1'),facing:night?-1:1,breath:1},150+i*200,270,180);ctx.restore();ctx.fillStyle=night?'#f4e9c8':'#483a27';ctx.font='14px monospace';ctx.fillText(`${clip} · ${night?'mirrored night':'day'} · native timing`,12,24);count++;renderedFrames++;await new Promise(requestAnimationFrame);}recordings.push({clip,night,facing:night?-1:1,cycleSeconds,targetMs,offsetMs:start-beginning,elapsedMs:performance.now()-start,renderCalls:count});}}
    finally{recorder.stop();await stopped;for(const track of stream.getTracks())track.stop();}
    const bytes=new Uint8Array(await new Blob(chunks,{type}).arrayBuffer());let binary='';for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));extra.movie=btoa(binary);
   }
   for(const poses of retained.values())for(const frame of poses.values())frame.width=frame.height=0;
  }
  return {profiles,outsideChecks,refused,foregroundChecks,cleanupChecks,handChecks,occlusionChecks,occludedBodyPixels,edgeBlendPixels,coverage,reviewedClip:completeClip?clip:null,lightingSamples,transitionUpdates,transitionSamples,recordings,renderedFrames,...extra,board:board.toDataURL('image/png').split(',')[1],details:details.toDataURL('image/png').split(',')[1]};
 },{sources,video:process.argv.includes('--video'),clip});
 assert.equal(result.outsideChecks,registrations.length*6);assert.equal(result.refused,registrations.length*5+registrations.filter(r=>r.foreground).length*2);assert.equal(result.foregroundChecks,registrations.length);assert.equal(result.cleanupChecks,registrations.length);assert.equal(result.occlusionChecks,registrations.filter(r=>r.foreground).length);
 for(const key of ['board','details']){await writeFile(root+'/review-'+version+'-'+key+'.png',Buffer.from(result[key],'base64'));delete result[key];}
 if(result.lighting){await writeFile(root+'/review-'+version+'-lighting.png',Buffer.from(result.lighting,'base64'));delete result.lighting;}
 if(result.transitions){await writeFile(root+'/review-'+version+'-transitions.png',Buffer.from(result.transitions,'base64'));delete result.transitions;}
 if(result.movie){await writeFile(root+'/review-'+version+'-'+clip+'.webm',Buffer.from(result.movie,'base64'));delete result.movie;}
 await writeFile(root+'/review-'+version+'.json',JSON.stringify({status:'Internal garment prototype; source audits pass, visual findings recorded separately; no public recipe option.',sources:sources.map(({data,intent,...source})=>source),...result},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
