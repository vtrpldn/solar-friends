import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const maskFile=process.argv.find(arg=>arg.startsWith('--mask='))?.slice(7)??'mask.png';assert(['mask.png','jaw.png'].includes(maskFile));
const [name,version]=process.argv.slice(2);assert(/^[a-z0-9-]+$/.test(name??'')&&/^v[1-9][0-9]?$/.test(version??''));
const root='assets/art-direction/character-prototype-v1/'+name,intent=JSON.parse(await readFile(root+'/registration-intent.json','utf8'));
assert(Object.hasOwn(intent.guideHashes,maskFile),'The selected silhouette must belong to the frozen guide.');
for(const [file,hash]of Object.entries(intent.guideHashes))assert.equal(createHash('sha256').update(await readFile(root+'/'+file)).digest('hex'),hash,'Frozen guide changed');
const source=await readFile(root+'/candidate-'+version+'.png'),mask=await readFile(root+'/'+maskFile),sha256=createHash('sha256').update(source).digest('hex');
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/clothing-source-audit`);
 const result=await page.evaluate(async({source,mask,intent})=>{
  const load=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();if(image.naturalWidth!==1254||image.naturalHeight!==1254)throw Error('Source size differs from frozen guide');const c=document.createElement('canvas');c.width=c.height=1254;c.getContext('2d').drawImage(image,0,0);return c.getContext('2d').getImageData(0,0,1254,1254).data;};
  const pixels=await load(source),guide=await load(mask),poses=[];let undeclaredPaint=0;
  for(let y=0;y<1254;y++)for(let x=0;x<1254;x++)if(pixels[(y*1254+x)*4+3]>=intent.rules.alphaThreshold&&!intent.poses.some(s=>x>=s.tile[0]&&x<s.tile[0]+s.tile[2]&&y>=s.tile[1]&&y<s.tile[1]+s.tile[3]))undeclaredPaint++;
  for(const pose of intent.poses){const [x,y,w,h]=pose.tile,[l,t,r,b]=pose.bounds;let painted=0,bounded=0,expected=0,intersection=0;
   for(let dy=0;dy<h;dy++)for(let dx=0;dx<w;dx++){const p=((y+dy)*1254+x+dx)*4,has=pixels[p+3]>=intent.rules.alphaThreshold,want=guide[p+3]>=intent.rules.alphaThreshold;if(want)expected++;if(has){painted++;if(dx>=l&&dx<r&&dy>=t&&dy<b)bounded++;if(want)intersection++;}}
   const boundedCoverage=painted?bounded/painted:0,guideCoverage=intersection/expected,areaRatio=painted/expected;
   poses.push({key:pose.key,painted,expected,boundedCoverage,guideCoverage,areaRatio,ok:boundedCoverage>=intent.rules.minimumBoundedPaint&&guideCoverage>=intent.rules.minimumGuideCoverage&&areaRatio>=intent.rules.paintAreaRatio[0]&&areaRatio<=intent.rules.paintAreaRatio[1]});
  }
  return {undeclaredPaint,poses,ok:undeclaredPaint===0&&poses.every(p=>p.ok)};
 },{source:source.toString('base64'),mask:mask.toString('base64'),intent});
 await writeFile(root+'/candidate-'+version+'-audit.json',JSON.stringify({sha256,...result},null,2)+'\n');console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
