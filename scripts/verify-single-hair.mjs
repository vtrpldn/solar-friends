import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 assert.equal(await page.locator('#single-hair-review canvas').count(),4);
 const result=await page.evaluate(async()=>{
  const {singleHairFrame}=await import('/artwork/character-single-hair.js'),{drawResidentAnimation}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');
  const {frame,registration,sourceHash}=window.singleHairReview,{binding,frames}=window.bodyAttachmentReview,body=frames.base[8],image=new Image();image.src='/art/characters/prototype-v1/hair-curls-single-candidate-v3.png';await image.decode();
  const data=c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data),before=data(body),refused=[];
  for(const [name,overrides]of [['hash',{sourceHash:'0'.repeat(64)}],['binding',{binding:{...binding,normalization:2}}],['pose',{registration:{...registration,index:9}}],['size',{registration:{...registration,size:256}}]]){try{await singleHairFrame({body,binding,registration,image,sourceHash,...overrides});}catch{refused.push(name);}}
  const changed=document.createElement('canvas');changed.width=changed.height=256;changed.getContext('2d').drawImage(body,0,0);changed.getContext('2d').clearRect(0,0,256,256);
  try{await singleHairFrame({body:changed,binding,registration,image,sourceHash});}catch{refused.push('pixels');}
  const board=document.createElement('canvas');board.width=1024;board.height=360;const ctx=board.getContext('2d'),surface=document.createElement('canvas');surface.width=surface.height=256;
  const provider={frameForPose:(sheet,index)=>{if(sheet!=='base'||index!==8)throw Error('Unsupported pose');return frame;}};
  for(const [column,{facing,night}]of [{facing:1,night:0},{facing:-1,night:0},{facing:1,night:1},{facing:-1,night:1}].entries()){
   const x=column*256;ctx.fillStyle=night?'#263c4b':'#dfe6c9';ctx.fillRect(x,0,256,360);ctx.save();ctx.filter=unlitFilter(night);for(const [width,y]of [[256,250],[48,320]])drawResidentAnimation(ctx,surface,provider,{layers:[{sheet:'base',row:2,frame:0,weight:1}],facing,breath:1},x+128,y,width);ctx.restore();ctx.fillStyle=night?'#f4e9c8':'#51432c';ctx.font='13px sans-serif';ctx.fillText(`${facing===1?'Right':'Left'} · ${night?'night':'day'} · 256/48`,x+12,350);
  }
  const scenes=document.createElement('canvas');scenes.width=1800;scenes.height=840;const sc=scenes.getContext('2d');document.querySelectorAll('#single-hair-review canvas').forEach((c,i)=>sc.drawImage(c,i%2*900,Math.floor(i/2)*420));
  return {refused,bodyUnchanged:JSON.stringify(before)===JSON.stringify(data(body)),sourceHash,scenes:scenes.toDataURL('image/png').split(',')[1],details:board.toDataURL('image/png').split(',')[1]};
 });
 assert.deepEqual(result.refused,['hash','binding','pose','size','pixels']);assert(result.bodyUnchanged);assert.deepEqual(errors,[]);
 const root='assets/art-direction/character-prototype-v1/';for(const name of ['scenes','details']){await writeFile(root+`hair-single-v3-${name}.png`,Buffer.from(result[name],'base64'));delete result[name];}
 await writeFile(root+'hair-single-v3-integration-report.json',JSON.stringify({result:'PASS',scope:'One static pose only; no complete hair set or gameplay approval',...result},null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
