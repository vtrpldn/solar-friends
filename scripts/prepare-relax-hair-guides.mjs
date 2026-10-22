// Numeric geometry annotations only; original prepared body frames are retained.
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const path='M550 365 C522 351 512 325 515 284 C520 229 545 188 596 170 C646 151 711 162 754 189 C795 214 820 253 820 293 C818 308 815 320 809 327 C806 305 797 288 783 282 C771 294 755 298 738 291 C719 307 701 311 680 306 C660 321 644 326 625 321 C605 326 592 342 588 365 C571 351 561 352 550 365 Z';
const guides=[{index:12,path,translation:[0,0]},{index:13,path,translation:[-14,5]},{index:14,path,translation:[-12,0]}],server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(guides=>({body:window.bodyAttachmentReview.binding,guides:guides.map(guide=>{const c=document.createElement('canvas');c.width=c.height=1254;const ctx=c.getContext('2d');ctx.drawImage(window.bodyAttachmentReview.frames.idle[guide.index],0,0,1254,1254);ctx.save();ctx.translate(...guide.translation);ctx.fillStyle='#23a44d66';ctx.strokeStyle='#168738';ctx.lineWidth=4;ctx.fill(new Path2D(guide.path));ctx.stroke(new Path2D(guide.path));ctx.restore();return {...guide,data:c.toDataURL('image/png').split(',')[1]};})}),guides);
 const root='assets/art-direction/character-prototype-v1/';for(const {index,data}of result.guides)await writeFile(root+`hair-idle-${index}-silhouette-guide.png`,Buffer.from(data,'base64'));await writeFile(root+'hair-relax-silhouette-guide.json',JSON.stringify({schema:1,size:1254,purpose:'Draft scalp geometry only, not finished sprite pixels',guides,body:result.body},null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
