import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/sleep-body-study-v2',registration=JSON.parse(await readFile(root+'/registration-v1.json','utf8')),data=(await readFile(root+'/candidate-v1.png')).toString('base64');
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/sleep-material-review`);
 const result=await page.evaluate(async({registration,data})=>{
  const {prepareContactBodyFrame}=await import('/character-contact-frame.js');const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const {frame}=prepareContactBodyFrame({image,sourceHash:registration.source.sha256},registration);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');ctx.fillStyle='#e4dec8';ctx.fillRect(0,0,1024,1024);ctx.drawImage(frame,0,0,1024,1024);ctx.strokeStyle='#3b656d88';ctx.fillStyle='#203b3a';ctx.font='12px monospace';for(let n=0;n<=256;n+=16){ctx.beginPath();ctx.moveTo(n*4,0);ctx.lineTo(n*4,1024);ctx.moveTo(0,n*4);ctx.lineTo(1024,n*4);ctx.stroke();ctx.fillText(String(n),n*4+3,14);ctx.fillText(String(n),3,n*4-3);}
  const png=canvas.toDataURL('image/png').split(',')[1];frame.width=frame.height=0;return png;
 },{registration,data});await writeFile(root+'/material-guide-v1.png',Buffer.from(result,'base64'));console.log('Prepared native sleeping-body coordinate guide.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
