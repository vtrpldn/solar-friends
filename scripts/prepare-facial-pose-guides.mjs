// Shared art-reference surface: no generated paint is edited or fitted here.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';import {serve} from './serve.mjs';
const familyName=process.argv.find(arg=>arg.startsWith('--family='))?.slice(9);assert(familyName===undefined||/^[a-z0-9-]+$/.test(familyName));
let familyInput=null;if(familyName){const folder='assets/art-direction/character-prototype-v1/'+familyName,ownership=JSON.parse(await readFile(folder+'/ownership-v1.json')),files=JSON.parse(await readFile(folder+'/source-files-v1.json')),sources={};for(const [id,file]of Object.entries(files)){const bytes=await readFile(file),sourceHash=createHash('sha256').update(bytes).digest('hex');assert.equal(sourceHash,ownership.sources[id].sha256);sources[id]={sourceHash,data:bytes.toString('base64')};}familyInput={ownership,sources};}
if(process.argv.includes('--freeze'))assert(familyInput,'Frozen facial guides require a source-bound family.');
const name=process.argv[2];assert(/^[a-z0-9-]+$/.test(name??''));
const root='assets/art-direction/character-prototype-v1/'+name;await mkdir(root,{recursive:true});
const priorIntent=await readFile(root+'/registration-intent.json','utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(process.argv.includes('--freeze'))assert(priorIntent===null,'Use a new collection for changed frozen facial geometry');
const specs=JSON.parse(await readFile(root+'/specs.json','utf8'));assert(Array.isArray(specs)&&specs.length>0&&specs.length<=9);
const keys=new Set();for(const s of specs){assert(['base','idle','activities'].includes(s.sheet)&&Number.isInteger(s.index)&&s.index>=0&&s.index<16);assert(s.key===s.sheet+'-'+s.index&&!keys.has(s.key));keys.add(s.key);for(const [rect,size]of [[s.referenceCrop,256],[s.tile,1254],...(s.crop?[[s.crop,256]]:[])])assert(Array.isArray(rect)&&rect.length===4&&Array.from(rect).every(Number.isFinite)&&rect[0]>=0&&rect[1]>=0&&rect[2]>0&&rect[2]===rect[3]&&rect[0]+rect[2]<=size&&rect[1]+rect[3]<=size);assert(s.tile.every(Number.isSafeInteger));if(s.path)assert(typeof s.path==='string'&&s.path.length<4096&&s.crop);}
for(let i=0;i<specs.length;i++)for(let j=0;j<i;j++){const a=specs[i].tile,b=specs[j].tile;assert(a[0]+a[2]<=b[0]||b[0]+b[2]<=a[0]||a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1],'Atlas tiles overlap');}
if(process.argv.includes('--freeze'))assert(specs.every(spec=>spec.path),'Freeze requires every authored facial silhouette.');
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/facial-guides`);
 const result=await page.evaluate(async({specs,familyInput})=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');
  let family=null,provider;if(familyInput){const {prepareBodyFamily}=await import('/character-body-family.js'),sources={};for(const [id,v]of Object.entries(familyInput.sources)){const image=new Image();image.src='data:image/png;base64,'+v.data;await image.decode();sources[id]={image,sourceHash:v.sourceHash};}family=await prepareBodyFamily({ownership:familyInput.ownership,sources});provider=family;}else{const library=createResidentPartLibrary();provider=await library.prepare(residentPartRecipe({hair:'side-part-v1'}));}const frames=[];
  const board=document.createElement('canvas');board.width=1600;board.height=Math.ceil(specs.length/4)*400;const b=board.getContext('2d');b.fillStyle='#e8dfbf';b.fillRect(0,0,board.width,board.height);
  const jaw=document.createElement('canvas'),faces=document.createElement('canvas');jaw.width=jaw.height=faces.width=faces.height=1254;
  for(const [i,spec]of specs.entries()){
   const body=provider.frameForPose(spec.sheet,spec.index),crop=spec.referenceCrop,canvas=document.createElement('canvas');canvas.width=canvas.height=1254;const ctx=canvas.getContext('2d');ctx.drawImage(body,...crop,0,0,1254,1254);const face=canvas.toDataURL('image/png').split(',')[1];ctx.strokeStyle='#42e6af88';ctx.fillStyle='#152d25';ctx.font='18px monospace';for(let n=0;n<=crop[2];n+=5){const p=n/crop[2]*1254;ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,1254);ctx.moveTo(0,p);ctx.lineTo(1254,p);ctx.stroke();ctx.fillText(String(crop[0]+n),p+2,22);ctx.fillText(String(crop[1]+n),2,p+22);}b.drawImage(canvas,i%4*400,Math.floor(i/4)*400,400,400);b.font='16px monospace';b.fillStyle='#483a27';b.fillText(spec.key,i%4*400+8,Math.floor(i/4)*400+390);frames.push({key:spec.key,face,grid:canvas.toDataURL('image/png').split(',')[1]});
   if(spec.path){const [x,y,w,h]=spec.tile;faces.getContext('2d').drawImage(body,...spec.crop,x,y,w,h);for(const c of [jaw.getContext('2d'),faces.getContext('2d')]){c.save();c.translate(x,y);c.scale(w/spec.crop[2],h/spec.crop[3]);c.translate(-spec.crop[0],-spec.crop[1]);c.fillStyle='#20d46c';c.fill(new Path2D(spec.path));c.restore();}}
  }
  const guides=[];for(const spec of specs)if(spec.path){const [x,y,w,h]=spec.tile,pixels=jaw.getContext('2d').getImageData(x,y,w,h).data,bounds=[w,h,0,0];let painted=0;for(let p=0;p<w*h;p++)if(pixels[p*4+3]>=32){const px=p%w,py=Math.floor(p/w);bounds[0]=Math.min(bounds[0],px);bounds[1]=Math.min(bounds[1],py);bounds[2]=Math.max(bounds[2],px+1);bounds[3]=Math.max(bounds[3],py+1);painted++;}if(!painted||bounds[0]<=0||bounds[1]<=0||bounds[2]>=w||bounds[3]>=h)throw Error('A facial guide is empty or leaves its source cell.');guides.push({key:spec.key,painted,bounds});}const binding=family?structuredClone(family.binding):null;family?.dispose();return {...(binding?{binding}:{}),frames,guides,board:board.toDataURL('image/png').split(',')[1],...(specs.every(s=>s.path)?{jaw:jaw.toDataURL('image/png').split(',')[1],faces:faces.toDataURL('image/png').split(',')[1]}:{})};
 },{specs,familyInput});
 const outputs={};for(const frame of result.frames)for(const key of ['face','grid']){outputs[frame.key+'-'+key+'.png']=Buffer.from(frame[key],'base64');delete frame[key];}
 for(const key of ['board','jaw','faces'])if(result[key]){outputs[key+'.png']=Buffer.from(result[key],'base64');delete result[key];}
 outputs['references.json']=Buffer.from(JSON.stringify(result,null,2)+'\n');
 const hashes={'specs.json':createHash('sha256').update(await readFile(root+'/specs.json')).digest('hex'),...Object.fromEntries(Object.entries(outputs).map(([file,bytes])=>[file,createHash('sha256').update(bytes).digest('hex')]))};
 if(priorIntent){const frozen=JSON.parse(priorIntent);assert.deepEqual(result.binding,frozen.body,'Frozen facial body changed');assert.deepEqual(hashes,frozen.guideHashes,'Frozen facial geometry changed');for(const [file,bytes]of Object.entries(outputs))assert((await readFile(root+'/'+file)).equals(bytes),'Frozen facial guide changed: '+file);}
 else for(const [file,bytes]of Object.entries(outputs))await writeFile(root+'/'+file,bytes);
 if(process.argv.includes('--freeze')){
  assert(result.binding&&result.guides.length===specs.length,'Freeze complete body-bound facial geometry');
  const margin=24,poses=specs.map(spec=>{const guide=result.guides.find(g=>g.key===spec.key),[l,t,r,b]=guide.bounds;return {...spec,bounds:[Math.max(0,l-margin),Math.max(0,t-margin),Math.min(spec.tile[2],r+margin),Math.min(spec.tile[3],b+margin)],bodyFrameSha256:result.binding.frames[spec.sheet][spec.index]};});
  await writeFile(root+'/registration-intent.json',JSON.stringify({schema:1,status:'Body-bound face geometry frozen before paint generation',part:'short-beard',body:result.binding,guideHashes:hashes,rules:{sourceSize:[1254,1254],alphaThreshold:32,minimumBoundedPaint:.98,minimumGuideCoverage:.90,paintAreaRatio:[.85,1.15],undeclaredPaint:0,paintEditingAllowed:false},poses},null,2)+'\n',{flag:'wx'});
 }

}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
