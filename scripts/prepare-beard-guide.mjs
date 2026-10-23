// Authored placement guide only; never modifies generated accessory pixels.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/short-beard-v1';await mkdir(root,{recursive:true});
const source=await readFile('assets/art-direction/character-prototype-v1/straw-hat-prototype-v1/body-guide.png');
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();const guide=await page.evaluate(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1254;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.fillStyle='#20e76dcc';ctx.strokeStyle='#166f3f';ctx.lineWidth=2;const path=new Path2D('M594 295 L609 307 Q649 333 713 337 Q747 334 765 313 L774 288 L771 326 Q760 350 716 358 Q641 355 603 326 Z M688 296 Q708 289 726 294 L750 294 L749 302 L723 302 Q706 299 687 304 Z');ctx.fill(path);ctx.stroke(path);return canvas.toDataURL('image/png').split(',')[1];},source.toString('base64'));await writeFile(root+'/silhouette-guide.png',Buffer.from(guide,'base64'));}finally{await browser.close();}
