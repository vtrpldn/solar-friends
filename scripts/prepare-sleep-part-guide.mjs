// Render-only registration guide. Never writes or edits the generated body source.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/sleep-body-study-v2',out=root+'/parts-v1';await mkdir(out,{recursive:true});const registration=JSON.parse(await readFile(root+'/registration-v1.json','utf8')),data=(await readFile(root+'/candidate-v1.png')).toString('base64'),server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/sleep-part-guide`);
 const png=await page.evaluate(async({registration,data})=>{const {prepareContactBodyFrame}=await import('/character-contact-frame.js');const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const {frame}=prepareContactBodyFrame({image,sourceHash:registration.source.sha256},registration),guide=document.createElement('canvas');guide.width=guide.height=1254;guide.getContext('2d').drawImage(frame,0,0,1254,1254);const png=guide.toDataURL('image/png').split(',')[1];frame.width=frame.height=0;guide.width=guide.height=0;return png;},{registration,data});
 const bytes=Buffer.from(png,'base64');await writeFile(out+'/body-registration-guide-v1.png',bytes);await writeFile(out+'/guide-v1.json',JSON.stringify({status:'Derived runtime-registration guide only; not new or edited source paint',bodySourceSha256:registration.source.sha256,registration,guideSha256:createHash('sha256').update(bytes).digest('hex'),method:'Use prepareContactBodyFrame to render the immutable source, then display the native frame at 1254 square for fixed-coordinate part authoring. Parts must preserve these whole-frame coordinates.'},null,2)+'\n');console.log('Prepared fixed-coordinate body guide for sleeping parts.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
