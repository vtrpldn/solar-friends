// Unchanged whole prepared frames; no independent head or part fitting.
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {frames,binding}=window.bodyAttachmentReview,rig=await(await fetch('/art/characters/prototype-v1/body-attachments-draft.json')).json(),c=document.createElement('canvas');c.width=c.height=1254;const ctx=c.getContext('2d'),bounds=[];
  for(let cell=0;cell<4;cell++){const x=cell%2*627,y=Math.floor(cell/2)*627,index=cell+8;ctx.drawImage(frames.base[index],x,y,627,627);const [hx,hy]=rig.poses.base[index].head.position;bounds.push([x+(hx-34)*627/256,y+(hy-39)*627/256,68*627/256,60*627/256]);}
  const body=c.toDataURL('image/png').split(',')[1];ctx.strokeStyle='#23a44d';ctx.lineWidth=3;bounds.forEach(b=>ctx.strokeRect(...b));const guide=c.toDataURL('image/png').split(',')[1],singles=[];for(const index of [9,10,11]){ctx.clearRect(0,0,1254,1254);ctx.drawImage(frames.base[index],0,0,1254,1254);singles.push({index,body:c.toDataURL('image/png').split(',')[1]});}return {body,guide,bounds,binding,singles};
 });
 const root='assets/art-direction/character-prototype-v1/';for(const key of ['body','guide'])await writeFile(root+`hair-breathe-${key}.png`,Buffer.from(result[key],'base64'));
 for(const pose of result.singles)await writeFile(root+`hair-base-${pose.index}-body.png`,Buffer.from(pose.body,'base64'));
 await writeFile(root+'hair-breathe-guide.json',JSON.stringify({schema:1,size:1254,cellSize:627,sheet:'base',indices:[8,9,10,11],bounds:result.bounds,body:result.binding},null,2)+'\n');console.log('Prepared four whole-frame breathing pose references.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
