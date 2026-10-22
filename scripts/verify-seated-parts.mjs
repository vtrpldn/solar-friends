import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 assert.equal(await page.locator('#sit-hair-review canvas').count(),4);
 for(const mode of ['sit','sleep']){await page.locator('#sit-hair-mode').selectOption(mode);for(const seconds of [0,.625,1.25,1.875,2.5,3.125,3.75,4.375,5]){await page.locator('#sit-hair-time').fill(String(seconds));for(const canvas of await page.locator('#sit-hair-review canvas').all())assert.equal(await canvas.getAttribute('data-seconds'),String(seconds));}}
 const result=await page.evaluate(async()=>{
  const {extractRegisteredAtlasPart}=await import('/character-atlas-part.js'),{drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js'),{hairClipProvider}=await import('/artwork/character-hair-clip.js');
  const review=window.sitHairReview,{frames,appearanceFrames,activityParts,provider}=review,body=window.bodyAttachmentReview.frames.base;
  const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data,equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]),digest=async c=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels(c)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const before=await Promise.all([12,13,14,15].map(i=>digest(body[i]))),checks=[];
  for(const i of [12,13,14,15]){
   const appearance=appearanceFrames.get(i),seat=activityParts.get(i),expected=document.createElement('canvas');expected.width=expected.height=256;const ec=expected.getContext('2d');ec.drawImage(seat.frame,0,0,256,256);ec.drawImage(appearance,0,0);
   if(!equal(pixels(expected),pixels(frames.get(i))))throw Error('Activity must be behind unchanged appearance at uniform whole-frame scale.');
   if(!equal(pixels(appearance).slice(96*256*4),pixels(body[i]).slice(96*256*4)))throw Error(`Appearance ${i} changed original body below head.`);
   const sp=pixels(seat.frame);if(sp.slice(0,600*1254*4).some(Boolean))throw Error('Hair leaked into stool layer.');
   checks.push({index:i,hairCoverage:Number(appearance.dataset.partCoverage),seatCoverage:seat.audit.coverage,bodySha256:before[i-12]});
  }
  // The public toggle changes activity equipment only; appearance remains identical.
  const toggle=document.getElementById('sit-activity-visible');toggle.click();for(const i of [12,13,14,15])if(provider.frameForPose('base',i)!==appearanceFrames.get(i))throw Error('Activity toggle changed appearance identity.');toggle.click();for(const i of [12,13,14,15])if(provider.frameForPose('base',i)!==frames.get(i))throw Error('Activity toggle did not restore equipment.');
  const denied=[];for(const [sheet,index]of [['base',8],['idle',12],['activities',12]])try{provider.frameForPose(sheet,index);}catch{denied.push(`${sheet}:${index}`);}try{hairClipProvider(new Map([[12,frames.get(12)]]),'sit');}catch{denied.push('incomplete');}
  const pose=review.registration.poses[13],image=new Image();image.src='/art/characters/prototype-v1/'+pose.file;await image.decode();const registration={bounds:pose.bounds,sha256:pose.sha256,size:pose.size,sourceRect:pose.sourceRect};
  for(const [name,change]of [['wrong-hash',{sha256:'0'.repeat(64)}],['wrong-size',{size:1024}],['fit-rectangle',{sourceRect:[1,0,1253,600]}],['outside-part',{bounds:[0,601,20,20]}],['loose-threshold',{minimumCoverage:0}],['empty-region',{bounds:[0,0,10,10]}]]){try{extractRegisteredAtlasPart({image,sourceHash:pose.sha256,registration:{...registration,...change}});}catch{denied.push(name);}}
  const hair=extractRegisteredAtlasPart({image,sourceHash:pose.sha256,registration});if(pixels(hair.frame).slice(600*1254*4).some(Boolean))throw Error('Stool leaked into hair layer.');
  const fullPose=review.registration.poses[12],fullImage=new Image();fullImage.src='/art/characters/prototype-v1/'+fullPose.file;await fullImage.decode();const fullPart=extractRegisteredAtlasPart({image:fullImage,sourceHash:fullPose.sha256,registration:{bounds:fullPose.bounds,size:1254,sha256:fullPose.sha256,sourceRect:[0,0,1254,1254]}});if(fullPart.frame!==fullImage)throw Error('Whole-frame assets must avoid an extra fractional-alpha canvas round trip.');
  // Source atlas coordinates are copied exactly, not normalized per part.
  const original=document.createElement('canvas');original.width=original.height=1254;original.getContext('2d').drawImage(image,0,0);if(!equal(pixels(original).slice(0,600*1254*4),pixels(hair.frame).slice(0,600*1254*4)))throw Error('Part extraction moved or changed pixels.');
  const board=document.createElement('canvas');board.width=1728;board.height=1120;const ctx=board.getContext('2d'),surface=document.createElement('canvas');surface.width=surface.height=256;const used=new Set(),times=[0,1.205,1.25,2.455,2.5,3.705,3.75,4.955,5];
  for(let row=0;row<4;row++)for(const [column,seconds]of times.entries()){const facing=row<2?1:-1,night=row%2,x=column*192,y=row*280,mode=column===8?'sleep':'sit',layers=sampleResidentClip(mode,seconds);layers.forEach(p=>used.add(p.row*4+p.frame));ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(x,y,192,280);ctx.save();ctx.filter=unlitFilter(night);for(const [width,offset]of [[192,205],[48,252]])drawResidentAnimation(ctx,surface,provider,{layers,facing,breath:1},x+96,y+offset,width);ctx.restore();ctx.fillStyle=night?'#f4e9c8':'#51432c';ctx.font='11px monospace';ctx.fillText(`${mode} ${seconds}s ${facing} ${night?'night':'day'}`,x+4,y+270);}
  document.getElementById('sit-hair-mode').value='sit';const input=document.getElementById('sit-hair-time');input.value='.625';input.dispatchEvent(new Event('input',{bubbles:true}));const scenes=document.createElement('canvas');scenes.width=1800;scenes.height=840;document.querySelectorAll('#sit-hair-review canvas').forEach((c,i)=>scenes.getContext('2d').drawImage(c,i%2*900,Math.floor(i/2)*420));
  const after=await Promise.all([12,13,14,15].map(i=>digest(body[i])));if(!equal(before,after))throw Error('Original bodies mutated.');
  return {checks,denied,used:[...used].sort((a,b)=>a-b),details:board.toDataURL('image/png').split(',')[1],scenes:scenes.toDataURL('image/png').split(',')[1]};
 });
 assert.deepEqual(result.used,[12,13,14,15]);assert.deepEqual(result.denied,['base:8','idle:12','activities:12','incomplete','wrong-hash','wrong-size','fit-rectangle','outside-part','loose-threshold','empty-region']);assert.equal(result.checks.length,4);assert.ok(result.checks.every(p=>p.hairCoverage>=.98&&p.seatCoverage>=.98));assert.deepEqual(errors,[]);
 const root='assets/art-direction/character-prototype-v1/';for(const name of ['details','scenes']){await writeFile(root+`hair-sit-v1-${name}.png`,Buffer.from(result[name],'base64'));delete result[name];}await writeFile(root+'hair-sit-v1-integration-report.json',JSON.stringify({result:'PASS',scope:'Prototype only; equipment, temporal and full character review remain open',...result},null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
