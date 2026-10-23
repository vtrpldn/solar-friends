import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const [collection,version]=process.argv.slice(2);assert(/^[a-z0-9-]+$/.test(collection??''));assert(/^v[1-9][0-9]?$/.test(version??''));
const root='assets/art-direction/character-prototype-v1/'+collection,bytes=await readFile(root+'/candidate-'+version+'.png'),registrations=JSON.parse(await readFile(root+'/registrations-'+version+'.json','utf8')),sha256=createHash('sha256').update(bytes).digest('hex');for(const r of registrations)assert.equal(r.source.sha256,sha256);
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/facial-source-audit`);
 const audit=await page.evaluate(async({data,registrations})=>{
  const {auditCharacterPartRegion}=await import('/character-parts.js'),image=new Image();image.src='data:image/png;base64,'+data;await image.decode();if(image.naturalWidth!==1254||image.naturalHeight!==1254)throw Error('Use the registered source dimensions');const canvas=document.createElement('canvas');canvas.width=canvas.height=1254;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,1254,1254).data;let undeclaredPaint=0;
  for(let y=0;y<1254;y++)for(let x=0;x<1254;x++)if(pixels[(y*1254+x)*4+3]>=32&&!registrations.some(r=>{const [rx,ry,w,h]=r.source.rect;return x>=rx&&x<rx+w&&y>=ry&&y<ry+h;}))undeclaredPaint++;
  return {undeclaredPaint,poses:registrations.map(r=>({sheet:r.sheet,index:r.index,...auditCharacterPartRegion(ctx.getImageData(...r.source.rect),r.bounds)}))};
 },{data:bytes.toString('base64'),registrations});
 const result={sha256,ok:audit.undeclaredPaint===0&&audit.poses.every(p=>p.ok),...audit};await writeFile(`${root}/candidate-${version}-source-audit.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
