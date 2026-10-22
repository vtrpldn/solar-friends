// Scalp geometry guides only; no changes to sprite source pixels.
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const path='M615 282 C590 270 576 244 580 211 C584 165 612 127 654 107 C695 87 742 91 780 107 C817 122 841 151 851 182 C859 202 857 221 851 235 C847 219 839 205 827 199 C816 210 800 214 786 208 C770 221 751 226 734 220 C715 234 699 238 681 232 C661 239 648 255 646 273 L642 284 C633 271 624 269 615 282 Z';
const guides=[{index:0,path,translation:[0,0]},{index:1,path,translation:[-49,0]}],server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(guides=>({body:window.bodyAttachmentReview.binding,guides:guides.map(guide=>{const c=document.createElement('canvas');c.width=c.height=1254;const ctx=c.getContext('2d');ctx.drawImage(window.bodyAttachmentReview.frames.activities[guide.index],0,0,1254,1254);ctx.save();ctx.translate(...guide.translation);ctx.fillStyle='#23a44d66';ctx.strokeStyle='#168738';ctx.lineWidth=4;ctx.fill(new Path2D(guide.path));ctx.stroke(new Path2D(guide.path));ctx.restore();return {...guide,data:c.toDataURL('image/png').split(',')[1]};})}),guides);
 const root='assets/art-direction/character-prototype-v1/';for(const {index,data}of result.guides)await writeFile(root+`hair-activities-${index}-silhouette-guide.png`,Buffer.from(data,'base64'));await writeFile(root+'hair-cook-silhouette-guide.json',JSON.stringify({schema:1,size:1254,purpose:'Scalp geometry only, not finished art',guides,body:result.body},null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
