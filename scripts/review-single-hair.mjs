// Diagnostic composition uses the whole source frame, never a fitted silhouette.
import {readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/';
const version=process.argv[2]??'v1';
if(!['v1','v2'].includes(version))throw new Error('Expected v1 or v2');
const guide=JSON.parse(await readFile(root+'hair-single-guide.json','utf8'));
const server=await serve();let browser;
try {
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);
 await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async ({guide,version})=>{
  const hair=new Image();hair.src=`/art/characters/prototype-v1/hair-curls-single-candidate-${version}.png`;await hair.decode();
  const raw=document.createElement('canvas');raw.width=hair.width;raw.height=hair.height;
  const r=raw.getContext('2d');r.drawImage(hair,0,0);const p=r.getImageData(0,0,raw.width,raw.height).data;
  let count=0,inside=0;const bounds=[Infinity,Infinity,-1,-1];
  for(let y=0;y<raw.height;y++)for(let x=0;x<raw.width;x++)if(p[(y*raw.width+x)*4+3]>=32){count++;bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);const [gx,gy,gw,gh]=guide.bounds;if(x>=gx&&x<gx+gw&&y>=gy&&y<gy+gh)inside++;}
  const board=document.createElement('canvas');board.width=768;board.height=420;const ctx=board.getContext('2d');ctx.fillStyle='#eadfbd';ctx.fillRect(0,0,768,420);
  for(let i=0;i<2;i++){ctx.drawImage(window.bodyAttachmentReview.frames.base[8],i*384,0,384,384);if(i)ctx.drawImage(hair,384,0,384,384);}
  ctx.fillStyle='#433c2d';ctx.font='16px sans-serif';ctx.fillText('Unchanged body',12,408);ctx.fillText('Whole-frame overlay; no fitting',396,408);
  return {actualSize:[hair.width,hair.height],expectedSize:guide.size,sizeMatches:hair.width===guide.size&&hair.height===guide.size,alphaBounds:bounds,coverage:inside/count,board:board.toDataURL('image/png').split(',')[1]};
 },{guide,version});
 await writeFile(root+`hair-single-${version}-composition.png`,Buffer.from(result.board,'base64'));delete result.board;
 await writeFile(root+`hair-single-${version}-report.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
