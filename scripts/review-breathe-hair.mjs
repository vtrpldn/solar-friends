import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';import {serve} from './serve.mjs';
const pose=process.argv[2]??'atlas';if(!['atlas','9','10','11'].includes(pose))throw Error('Choose atlas, 9, 10 or 11');
const root='assets/art-direction/character-prototype-v1/',guide=JSON.parse(await readFile(root+'hair-breathe-guide.json','utf8')),server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async({pose,guide})=>{
  const hair=new Image();hair.src=pose==='atlas'?'/art/characters/prototype-v1/hair-curls-breathe-rejected-v1.png':`/art/characters/prototype-v1/hair-curls-base-${pose}-candidate-v1.png`;await hair.decode();
  const raw=document.createElement('canvas');raw.width=hair.width;raw.height=hair.height;const r=raw.getContext('2d');r.drawImage(hair,0,0);const p=r.getImageData(0,0,raw.width,raw.height).data;
  const board=document.createElement('canvas');board.width=1024;board.height=pose==='atlas'?560:360;const ctx=board.getContext('2d');ctx.fillStyle='#eadfbd';ctx.fillRect(0,0,board.width,board.height);const reports=[];
  const count=pose==='atlas'?4:1;for(let cell=0;cell<count;cell++){
   const index=pose==='atlas'?cell+8:Number(pose),sourceSize=pose==='atlas'?627:1254,sx=pose==='atlas'?cell%2*627:0,sy=pose==='atlas'?Math.floor(cell/2)*627:0,body=window.bodyAttachmentReview.frames.base[index],x=pose==='atlas'?cell%4*256:0,y=24;
   const bounds=guide.bounds[index-8].map((n,i)=>pose==='atlas'?n:(n-(i===0?(index-8)%2*627:i===1?Math.floor((index-8)/2)*627:0))*2);let painted=0,inside=0;
   for(let py=sy;py<sy+sourceSize;py++)for(let px=sx;px<sx+sourceSize;px++)if(p[(py*raw.width+px)*4+3]>=32){painted++;const [bx,by,bw,bh]=bounds;if(px>=bx&&px<bx+bw&&py>=by&&py<by+bh)inside++;}
   ctx.fillStyle='#51432c';ctx.font='14px sans-serif';ctx.fillText(`Base ${index} · no fitting`,x+12,18);ctx.drawImage(body,x,y);ctx.drawImage(hair,sx,sy,sourceSize,sourceSize,x,y,256,256);
   if(pose==='atlas')ctx.drawImage(body,x,304);else{
    // Both source-bound key poses and their real animation crossfade.
    const {drawResidentAnimation}=await import('/resident-animation.js'),frame=document.createElement('canvas');frame.width=frame.height=256;const fc=frame.getContext('2d');fc.drawImage(body,0,0);fc.drawImage(hair,0,0,256,256);
    const surface=document.createElement('canvas');surface.width=surface.height=256;const first=window.singleHairReview.frame;
    for(const [column,blend]of [0,.5,1].entries()){drawResidentAnimation(ctx,surface,{frameForPose:(_,i)=>i===8?first:frame},{layers:[{sheet:'base',row:2,frame:0,weight:1-blend},{sheet:'base',row:2,frame:index-8,weight:blend}],facing:1,breath:1},384+column*256,268,256);ctx.fillStyle='#51432c';ctx.fillText(`8 → ${index} · blend ${blend}`,280+column*256,300);}
   }
   reports.push({index,painted,coverage:inside/painted});
  }
  return {actualSize:[hair.width,hair.height],sizeMatches:hair.width===1254&&hair.height===1254,reports,board:board.toDataURL('image/png').split(',')[1]};
 },{pose,guide});
 await writeFile(root+`hair-breathe-${pose}-v1-composition.png`,Buffer.from(result.board,'base64'));delete result.board;await writeFile(root+`hair-breathe-${pose}-v1-report.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
