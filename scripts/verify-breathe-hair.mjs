import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');assert.equal(await page.locator('#breathe-hair-review canvas').count(),4);
 for(const seconds of [0,1.205,1.25,2.455,2.5,3.705,3.75,4.955,5]){await page.locator('#breathe-hair-time').fill(String(seconds));for(const canvas of await page.locator('#breathe-hair-review canvas').all())assert.equal(await canvas.getAttribute('data-seconds'),String(seconds));}
 const result=await page.evaluate(async()=>{
  const {drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js'),{breatheHairProvider}=await import('/artwork/character-breathe-hair.js'),{provider,frames,registration}=window.breatheHairReview;
  const denied=[];for(const [sheet,index]of [['base',0],['base',12],['idle',8],['activities',8]]){try{provider.frameForPose(sheet,index);}catch{denied.push(`${sheet}:${index}`);}}try{breatheHairProvider(new Map([[8,frames.get(8)]]));}catch{denied.push('incomplete');}try{breatheHairProvider(new Map([8,9,10,11].map(i=>[i,null])));}catch{denied.push('invalid-frames');}
  const times=[0,1.205,1.25,2.455,2.5,3.705,3.75,4.955],board=document.createElement('canvas');board.width=1536;board.height=1120;const ctx=board.getContext('2d'),surface=document.createElement('canvas');surface.width=surface.height=256;const poseUse=new Set(),sourceHashes={};
  for(const [index,frame]of frames){const data=frame.getContext('2d').getImageData(0,0,256,256).data;sourceHashes[index]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');}
  for(let row=0;row<4;row++){const facing=row<2?1:-1,night=row%2;for(const [column,seconds]of times.entries()){
   const x=column*192,y=row*280;ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(x,y,192,280);const layers=sampleResidentClip('breathe',seconds);layers.forEach(p=>poseUse.add(p.row*4+p.frame));
   ctx.save();ctx.filter=unlitFilter(night);for(const [width,offset]of [[192,205],[48,252]])drawResidentAnimation(ctx,surface,provider,{layers,facing,breath:1},x+96,y+offset,width);ctx.restore();ctx.fillStyle=night?'#f4e9c8':'#51432c';ctx.font='11px monospace';ctx.fillText(`${seconds}s ${facing===1?'R':'L'} ${night?'night':'day'}`,x+8,y+270);
  }}
  // A public control sample is also captured in the complete world scene.
  const input=document.getElementById('breathe-hair-time');input.value='1.205';input.dispatchEvent(new Event('input',{bubbles:true}));const scenes=document.createElement('canvas');scenes.width=1800;scenes.height=840;const sc=scenes.getContext('2d');document.querySelectorAll('#breathe-hair-review canvas').forEach((c,i)=>sc.drawImage(c,i%2*900,Math.floor(i/2)*420));
  return {denied,poseUse:[...poseUse].sort(),sourceHashes,partHashes:Object.fromEntries(Object.entries(registration.poses).map(([i,p])=>[i,p.sha256])),sampleTimes:times,details:board.toDataURL('image/png').split(',')[1],scenes:scenes.toDataURL('image/png').split(',')[1]};
 });
 assert.deepEqual(result.denied,['base:0','base:12','idle:8','activities:8','incomplete','invalid-frames']);assert.deepEqual(result.poseUse,[10,11,8,9]);assert.deepEqual(errors,[]);const root='assets/art-direction/character-prototype-v1/';for(const name of ['details','scenes']){await writeFile(root+`hair-breathe-v1-${name}.png`,Buffer.from(result[name],'base64'));delete result[name];}
 await writeFile(root+'hair-breathe-v1-integration-report.json',JSON.stringify({result:'PASS',scope:'Four-pose prototype only; no complete hairstyle or player integration',...result},null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
