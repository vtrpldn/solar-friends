// Analytical guides only: this script never edits generated garment paint.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const name=process.argv[2];assert(/^[a-z0-9-]+$/.test(name??''));
const root='assets/art-direction/character-prototype-v1/'+name;await mkdir(root,{recursive:true});
if(process.argv.includes('--freeze')){
 const existing=await readFile(root+'/registration-intent.json').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 assert(existing===null,'A frozen collection must use a new name for revised geometry');
}
const specs=JSON.parse(await readFile(root+'/specs.json','utf8')),keys=new Set();assert(Array.isArray(specs)&&specs.length>0&&specs.length<=9);
for(const s of specs){assert(['base','idle','activities'].includes(s.sheet)&&Number.isInteger(s.index)&&s.index>=0&&s.index<16);assert(s.key===s.sheet+'-'+s.index&&!keys.has(s.key));keys.add(s.key);for(const [rect,size]of [[s.crop,256],[s.tile,1254]])assert(Array.isArray(rect)&&rect.length===4&&rect.every(Number.isSafeInteger)&&rect[0]>=0&&rect[1]>=0&&rect[2]>0&&rect[2]===rect[3]&&rect[0]+rect[2]<=size&&rect[1]+rect[3]<=size);if(s.path)assert(typeof s.path==='string'&&s.path.length<8192);}
for(let i=0;i<specs.length;i++)for(let j=0;j<i;j++){const a=specs[i].tile,b=specs[j].tile;assert(a[0]+a[2]<=b[0]||b[0]+b[2]<=a[0]||a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1],'Guide cells overlap');}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/clothing-guides`);
 const result=await page.evaluate(async specs=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{preparedFrames}=await import('/sprite-frames.js'),{attachmentBinding}=await import('/character-attachments.js');
  const files={base:'body-neutral-base.png',idle:'body-neutral-idle-candidate-v2.png',activities:'body-neutral-activities-candidate-v1.png'},frames={},hashes={};
  for(const [sheet,file]of Object.entries(files)){const source=await loadCharacterImageSource('/art/characters/prototype-v1/'+file);frames[sheet]=preparedFrames(source.image,{referenceRow:sheet==='base'?2:0});hashes[sheet]=source.sourceHash;}
  const binding=await attachmentBinding(frames,hashes),make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},atlas=make(1254,1254),mask=make(1254,1254),context=make(1254,1254),board=make(1600,Math.ceil(specs.length/4)*640),b=board.getContext('2d'),guides=[],grids={},rowSpans=[];
  b.fillStyle='#e8dfbf';b.fillRect(0,0,board.width,board.height);
  for(const [i,s]of specs.entries()){
   const body=frames[s.sheet][s.index],grid=make(650,650),g=grid.getContext('2d'),[cx,cy,cw,ch]=s.crop,[x,y,w,h]=s.tile;
   const pixels=body.getContext('2d').getImageData(0,0,256,256).data;
   rowSpans.push({key:s.key,rows:[72,75,78,82,86,90,95,100,105,110,115,120,125,130,135,140,145].map(y=>{let left=256,right=-1,creamLeft=256,creamRight=-1;for(let x=0;x<256;x++){const p=(y*256+x)*4,r=pixels[p],green=pixels[p+1],blue=pixels[p+2];if(pixels[p+3]<128)continue;left=Math.min(left,x);right=Math.max(right,x);if(r>130&&green/r>=.78&&blue/r>=.52&&(r-blue)/Math.max(1,r)<.48){creamLeft=Math.min(creamLeft,x);creamRight=Math.max(creamRight,x);}}return {y,body:[left,right],cream:creamRight<0?null:[creamLeft,creamRight]};})});
   g.drawImage(body,...s.crop,0,0,650,650);g.strokeStyle='#15936088';g.fillStyle='#132d22';g.font='12px monospace';
   for(let n=0;n<=cw;n+=5){const p=n/cw*650;g.beginPath();g.moveTo(p,0);g.lineTo(p,650);g.moveTo(0,p);g.lineTo(650,p);g.stroke();g.fillText(String(cx+n),p+1,12);g.fillText(String(cy+n),1,p+12);}
   grids[s.key+'-grid']=grid.toDataURL('image/png').split(',')[1];
   b.drawImage(grid,i%4*400,Math.floor(i/4)*640,400,400);b.drawImage(body,i%4*400+70,Math.floor(i/4)*640+400,220,220);b.fillStyle='#3d3021';b.fillText(s.key,i%4*400+8,Math.floor(i/4)*640+632);
   atlas.getContext('2d').drawImage(body,...s.crop,x,y,w,h);context.getContext('2d').drawImage(body,...s.crop,x,y,w,h);
   if(s.path){for(const c of [mask.getContext('2d'),context.getContext('2d')]){c.save();c.translate(x,y);c.scale(w/cw,h/ch);c.translate(-cx,-cy);c.fillStyle='#20d46c';c.fill(new Path2D(s.path));c.restore();}
    const pixels=mask.getContext('2d').getImageData(x,y,w,h).data,bounds=[w,h,0,0];let painted=0;
    for(let p=0;p<w*h;p++)if(pixels[p*4+3]>=32){const px=p%w,py=Math.floor(p/w);bounds[0]=Math.min(bounds[0],px);bounds[1]=Math.min(bounds[1],py);bounds[2]=Math.max(bounds[2],px+1);bounds[3]=Math.max(bounds[3],py+1);painted++;}
    if(!painted||bounds[0]<=0||bounds[1]<=0||bounds[2]>=w||bounds[3]>=h)throw Error('A garment guide is empty or leaves its cell');guides.push({key:s.key,bounds,painted});
   }
  }
  return {binding,guides,rowSpans,images:{...grids,...Object.fromEntries(Object.entries({atlas,mask,context,board}).map(([key,c])=>[key,c.toDataURL('image/png').split(',')[1]]))}};
 },specs);
 for(const [key,data]of Object.entries(result.images))await writeFile(root+'/'+key+'.png',Buffer.from(data,'base64'));delete result.images;
 const sourceHashes={};for(const file of ['specs.json','atlas.png','mask.png','context.png','board.png'])sourceHashes[file]=createHash('sha256').update(await readFile(root+'/'+file)).digest('hex');
 await writeFile(root+'/references.json',JSON.stringify({...result,sourceHashes},null,2)+'\n');
 if(process.argv.includes('--freeze')){
  assert.equal(result.guides.length,specs.length,'Every frozen pose needs an authored silhouette');
  assert(specs.every(s=>s.tile[2]===specs[0].tile[2]),'A frozen collection uses one source scale');
  const margin=Math.round(12*specs[0].tile[2]/418);
  const poses=specs.map(s=>{const guide=result.guides.find(g=>g.key===s.key),[l,t,r,b]=guide.bounds,[,,w,h]=s.tile;return {...s,bounds:[Math.max(0,l-margin),Math.max(0,t-margin),Math.min(w,r+margin),Math.min(h,b+margin)],bodyFrameSha256:result.binding.frames[s.sheet][s.index]};});
  const intent={schema:1,status:'geometry and envelopes frozen before paint generation',part:'short-sleeve-v1',body:result.binding,guideHashes:sourceHashes,rules:{sourceSize:[1254,1254],alphaThreshold:32,minimumBoundedPaint:.98,minimumGuideCoverage:.90,paintAreaRatio:[.85,1.15],undeclaredPaint:0,boundsMarginSourcePixels:margin,paintEditingAllowed:false},poses};
  await writeFile(root+'/registration-intent.json',JSON.stringify(intent,null,2)+'\n',{flag:'wx'});
 }
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
