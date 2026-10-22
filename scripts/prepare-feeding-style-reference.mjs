import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const source='web/art/animations/bento-activities.png',bytes=await readFile(source);
const server=await serve(0,{handle:(_req,res,path)=>{if(path!=='/feeding-reference-host')return false;res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Reference preparation</title>');return true;}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/feeding-reference-host`);
 const png=await page.evaluate(async data=>{const {preparedFrames}=await import('/sprite-frames.js');const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=c.height=1254;c.getContext('2d').drawImage(preparedFrames(image,{referenceRow:0})[12],0,0,1254,1254);return c.toDataURL('image/png').split(',')[1];},'data:image/png;base64,'+bytes.toString('base64'));
 const root='assets/art-direction/character-prototype-v1/original-feeding-style-reference';await writeFile(root+'.png',Buffer.from(png,'base64'));await writeFile(root+'.json',JSON.stringify({schema:1,purpose:'Style reference only, not a new sprite or neutral-body placement reference',source,sha256:createHash('sha256').update(bytes).digest('hex'),preparedFrame:12,referenceRow:0,outputSize:1254},null,2)+'\n');
 console.log('Prepared original Bento feeding pose through the shared frame extractor as a style reference.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
