// Authored scalp geometry only; original body sprites are never transformed locally.
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/',common=JSON.parse(await readFile(root+'hair-cook-silhouette-guide.json','utf8')).guides[0].path;
const definitions={water:[{index:5,path:common,translation:[14,15]},{index:6,path:common,translation:[30,35]},{index:7,path:'M706 319 C682 300 674 269 681 239 C688 197 715 169 758 153 C803 139 850 149 885 169 C921 192 945 224 952 254 C958 273 956 291 949 303 C945 286 937 271 925 266 C912 277 899 280 885 273 C867 287 848 291 832 285 C815 297 799 301 783 295 C764 300 751 312 746 328 C735 316 720 314 706 319 Z',translation:[0,0]}],tend:[{index:8,path:common,translation:[30,285]},{index:9,path:common,translation:[30,320]},{index:10,path:common,translation:[70,330]}]},clip=process.argv[2];
if(!Object.hasOwn(definitions,clip))throw Error('Choose an authored activity guide group.');const guides=definitions[clip],server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(guides=>({body:window.bodyAttachmentReview.binding,guides:guides.map(guide=>{const c=document.createElement('canvas');c.width=c.height=1254;const ctx=c.getContext('2d');ctx.drawImage(window.bodyAttachmentReview.frames.activities[guide.index],0,0,1254,1254);ctx.save();ctx.translate(...guide.translation);ctx.fillStyle='#23a44d66';ctx.strokeStyle='#168738';ctx.lineWidth=4;ctx.fill(new Path2D(guide.path));ctx.stroke(new Path2D(guide.path));ctx.restore();return {...guide,data:c.toDataURL('image/png').split(',')[1]};})}),guides);
 for(const {index,data}of result.guides)await writeFile(root+`hair-activities-${index}-silhouette-guide.png`,Buffer.from(data,'base64'));await writeFile(root+`hair-${clip}-silhouette-guide.json`,JSON.stringify({schema:1,size:1254,purpose:'Scalp geometry only, not finished sprite pixels',guides,body:result.body},null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
