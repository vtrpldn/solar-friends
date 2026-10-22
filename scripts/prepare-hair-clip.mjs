// Whole prepared-frame references; pose coordinates remain owned by the body.
import {writeFile} from 'node:fs/promises';import {chromium} from 'playwright';import {serve} from './serve.mjs';
const clips={walk:['base',0],work:['base',1],sit:['base',3],look:['idle',0],stretch:['idle',1],wave:['idle',2],relax:['idle',3],cook:['activities',0],water:['activities',1],tend:['activities',2],feed:['activities',3]};
const clip=process.argv[2];if(!Object.hasOwn(clips,clip))throw Error('Choose a supported four-pose clip.');
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async({sheet,row})=>{
  const {frames,binding}=window.bodyAttachmentReview,rig=await(await fetch('/art/characters/prototype-v1/body-attachments-draft.json')).json(),c=document.createElement('canvas');c.width=c.height=1254;const ctx=c.getContext('2d'),poses=[];
  for(let index=row*4;index<row*4+4;index++){ctx.clearRect(0,0,1254,1254);ctx.drawImage(frames[sheet][index],0,0,1254,1254);const [hx,hy]=rig.poses[sheet][index].head.position,scale=1254/256;poses.push({index,head:[hx*scale,hy*scale],bounds:[(hx-34)*scale,(hy-39)*scale,68*scale,60*scale],body:c.toDataURL('image/png').split(',')[1]});}return {binding,poses};
 },{sheet:clips[clip][0],row:clips[clip][1]});
 const root='assets/art-direction/character-prototype-v1/',poses=[];for(const pose of result.poses){const {body,...geometry}=pose;await writeFile(root+`hair-${clips[clip][0]}-${pose.index}-body.png`,Buffer.from(body,'base64'));poses.push(geometry);}
 await writeFile(root+`hair-${clip}-guide.json`,JSON.stringify({schema:1,size:1254,sheet:clips[clip][0],poses,body:result.binding},null,2)+'\n');console.log(`Prepared ${clip}: four unchanged whole-frame references.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
