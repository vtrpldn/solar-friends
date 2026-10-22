import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'artifacts/equipped-appearance';await mkdir(output,{recursive:true});const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {prototypeAppearanceRecipe}=await import('/character-appearance-recipe.js'),{residentClips}=await import('/resident-animation.js'),{registeredEquipmentFrame}=await import('/character-equipment.js'),{createEquippedAppearanceReview}=await import('/artwork/character-equipped-model.js');
  const appearance=window.composedAppearanceReview.model,materials=window.bodyMaterialsReview.model,frames=window.bodyAttachmentReview.frames,binding=window.bodyAttachmentReview.binding,reviews={cook:window.cookingEquipmentReview,water:window.equipmentPoseReview,tend:window.tendingEquipmentReview,feed:window.feedingEquipmentReview},model=window.equippedAppearanceReview.model;
  const pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data,equal=(a,b)=>a.every((v,i)=>v===b[i]);
  const recipes=[prototypeAppearanceRecipe(),prototypeAppearanceRecipe({skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}),prototypeAppearanceRecipe({skin:'sunlit',shirt:'indigo',shorts:'umber',shoes:'brown'})];
  const board=document.createElement('canvas');board.width=1024;board.height=6*160;const ctx=board.getContext('2d');ctx.fillStyle='#e3e5cd';ctx.fillRect(0,0,board.width,board.height);let n=0;const checked=[];
  for(const [r,recipe]of recipes.entries())for(const clip of Object.keys(residentClips)){
   const provider=await model.provider(clip,recipe),hair=await appearance.provider(clip,recipe),spec=residentClips[clip];
   for(const frame of clip==='sleep'?[3]:[0,1,2,3]){
    const index=spec.row*4+frame,actual=provider.frameForPose(spec.sheet,index),pose=reviews[clip]?.poses.get(index);
    if(pose){
     const expected=await registeredEquipmentFrame({body:frames[spec.sheet][index],binding,appearanceBody:materials.provider(recipe.materials).frameForPose(spec.sheet,index),appearanceFrame:hair.frameForPose(spec.sheet,index),equipment:pose.equipment,registration:pose.registration,sheet:spec.sheet,index});
     if(!equal(pixels(actual),pixels(expected)))throw Error('Appearance/equipment integration differs: '+clip+index);
     if(r===1&&!equal(pixels(actual),pixels(pose.frame)))throw Error('Fixed-palette review changed: '+clip+index);
     if(clip==='feed'&&[13,14].includes(index)){
      const recovery=provider.frameForPose(spec.sheet,index,{sequenceIndex:5});if(equal(pixels(actual),pixels(recovery)))throw Error('Return path regained grain');
      if(r===1&&!equal(pixels(recovery),pixels(pose.recoveryFrame)))throw Error('Recovery composition differs');
     }
     ctx.drawImage(actual,n%8*128,Math.floor(n/8)*160,128,128);ctx.fillStyle='#304435';ctx.font='12px sans-serif';ctx.fillText('Palette '+r+' · '+clip+' '+index,n%8*128+4,Math.floor(n/8)*160+148);n++;
    }else if(actual!==hair.frameForPose(spec.sheet,index))throw Error('Non-equipment animation changed');
    checked.push({recipe:r,clip,sheet:spec.sheet,index,equipment:!!pose});
   }
  }
  const recipe=recipes[1];model.clear();const [a,b]=await Promise.all([model.provider('feed',recipe),model.provider('feed',recipe)]);if(a!==b)throw Error('Concurrent appearance work was duplicated');
  const before=model.cacheInfo();if(before.entries!==1||before.frames!==6||before.pending)throw Error('Wrong activity cache accounting');
  const bounded=createEquippedAppearanceReview({appearance,materials,frames,binding,reviews,maxClips:1});await bounded.provider('feed',recipe);await bounded.provider('cook',recipe);if(bounded.cacheInfo().entries!==1||bounded.cacheInfo().rgbaBytes>6*256*256*4)throw Error('Equipment cache exceeds its bound');bounded.clear();if(bounded.cacheInfo().entries)throw Error('Equipment cache did not clear');
  const denied=[];for(const [clip,recipe]of [['unknown',recipes[0]],['feed',{...recipes[0],assetVersion:'future'}],['cook',{...recipes[0],body:'stretched'}]]){try{await model.provider(clip,recipe);}catch{denied.push(clip);}}if(denied.length!==3)throw Error('Unsupported appearance accepted');
  try{createEquippedAppearanceReview({appearance,materials,frames,binding,reviews:{...reviews,feed:{poses:new Map()}}});throw Error('Missing activity accepted');}catch(e){if(e.message==='Missing activity accepted')throw e;}
  window.equippedReviewBoard=board;return {checked,denied,cache:before,equipmentSources:Object.fromEntries(Object.entries(reviews).map(([clip,review])=>[clip,[...review.poses].map(([index,p])=>({index,source:p.registration.source,parts:p.registration.parts?.map(part=>({id:part.id,file:part.file,source:part.source}))}))]))};
 });
 assert.equal(result.checked.length,147);assert.equal(result.checked.filter(p=>p.equipment).length,48);
 const wait=()=>page.waitForFunction(()=>document.querySelector('#equipped-appearance-review').dataset.ready==='true');
 for(const [key,value]of Object.entries({skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}))await page.selectOption('#equipped-appearance-'+key,value);await wait();
 for(const clip of await page.locator('#equipped-appearance-clip option').evaluateAll(nodes=>nodes.map(n=>n.value))){await page.selectOption('#equipped-appearance-clip',clip);await wait();}
 await page.selectOption('#equipped-appearance-clip','feed');await wait();await page.fill('#equipped-appearance-time','2.5');await wait();
 const play=page.locator('#equipped-appearance-play');await play.click();await page.waitForFunction(()=>Number(document.querySelector('#equipped-appearance-time').value)>.1);await play.click();const paused=await page.locator('#equipped-appearance-time').inputValue();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('#equipped-appearance-time').inputValue(),paused);
 await play.click();await page.selectOption('#equipped-appearance-clip','sleep');await wait();assert.equal(await play.getAttribute('aria-pressed'),'false');assert(await play.isDisabled());
 await page.selectOption('#equipped-appearance-clip','feed');await wait();
 await page.evaluate(()=>{const canvas=document.querySelector('#equipped-appearance-review .body-review-scenes canvas'),stream=canvas.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1200000}),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.equippedRecording={stream,recorder,chunks};recorder.start();document.querySelector('#equipped-appearance-play').click();});
 await page.waitForFunction(()=>document.querySelector('#equipped-appearance-play').getAttribute('aria-pressed')==='false'&&Number(document.querySelector('#equipped-appearance-time').value)===3&&document.querySelector('#equipped-appearance-review').dataset.ready==='true');
 const recording=await page.evaluate(async()=>{const {stream,recorder,chunks}=window.equippedRecording;stream.getVideoTracks()[0].requestFrame();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(track=>track.stop());const blob=new Blob(chunks,{type:'video/webm'}),bytes=new Uint8Array(await blob.arrayBuffer()),video=document.createElement('video'),url=URL.createObjectURL(blob);video.src=url;video.muted=true;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});const board=document.createElement('canvas');board.width=1800;board.height=4*166;const ctx=board.getContext('2d');ctx.fillStyle='#e3e5cd';ctx.fillRect(0,0,board.width,board.height);for(let i=0;i<=12;i++){const seconds=i===12?3.25:i*.25+.02;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Equipped recording seek timed out')),10000);video.onseeked=()=>{clearTimeout(timeout);resolve();};video.currentTime=seconds;});const x=i%6*300,y=Math.floor(i/6)*166;ctx.drawImage(video,x,y,300,140);ctx.fillStyle='#304435';ctx.font='12px sans-serif';ctx.fillText(i===12?'Final recorded frame':seconds.toFixed(2)+' recorded seconds',x+5,y+157);}URL.revokeObjectURL(url);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {video:btoa(binary),board:board.toDataURL('image/png').split(',')[1]};});
 await writeFile(output+'/equipped-feed-playback.webm',Buffer.from(recording.video,'base64'));await writeFile(output+'/equipped-feed-playback-frames.png',Buffer.from(recording.board,'base64'));await page.fill('#equipped-appearance-time','2.5');await wait();
 const portraitChecks=await page.evaluate(async()=>{
  const {paintPreparedResidentPortrait}=await import('/resident-portrait.js'),{unlitFilter}=await import('/power.js');
  const section=document.querySelector('#equipped-appearance-review'),recipe=JSON.parse(section.dataset.recipe),provider=await window.equippedAppearanceReview.model.provider('breathe',recipe),portraits=[...section.querySelectorAll('.composed-appearance-portrait')];
  for(const [i,portrait]of portraits.entries()){const expected=document.createElement('canvas');expected.width=128;expected.height=152;paintPreparedResidentPortrait(expected,provider.frameForPose('base',8),{filter:unlitFilter(i%2)});const actual=portrait.getContext('2d').getImageData(0,0,128,152).data,want=expected.getContext('2d').getImageData(0,0,128,152).data;if(!actual.every((v,p)=>v===want[p]))throw Error('Portrait uses another recipe');}return portraits.length;
 });assert.equal(portraitChecks,4);
 await page.locator('#equipped-appearance-review').screenshot({path:output+'/equipped-appearance-scenes.png'});
 const board=await page.evaluate(()=>window.equippedReviewBoard.toDataURL('image/png').split(',')[1]);await writeFile(output+'/equipped-appearance-poses.png',Buffer.from(board,'base64'));assert.deepEqual(errors,[]);const sourceFiles=['web/artwork/character-equipped-model.js','web/artwork/character-body-lab.js','web/artwork/character-composed-review.js','web/character-equipment.js','web/resident-animation.js','scripts/verify-equipped-appearance.mjs','web/pkg/solar_friends_bg.wasm'],sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));await writeFile(output+'/report.json',JSON.stringify({result:'PASS',sourceHashes,scope:'Review-only integrated appearance/equipment, not production artwork approval',portraitChecks,playback:'Public play/pause, change interruption, static sleep refusal and a recorded three-second feeding cycle with 13 decoded samples',...result},null,2)+'\n');console.log('PASS: three recipes across 147 animation pose checks (all 48 atlas poses plus sleep), 48 equipped poses, empty-handed recovery, shared work, bounded cache, refusals and all preview controls.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
