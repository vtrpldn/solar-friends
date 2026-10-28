// Candidate material review only; no public family or artwork edits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const revision=process.argv.includes('--original')?'v1':'v2';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(root+'/'+p));
const ownership=await read('body-ownership-v1.json'),binding=await read('body-binding-v1.json'),registration=await read(`body-material-regions-${revision}.json`),sourceMap=await read('body-sources-v1.json'),sources={};
for(const [id,s]of Object.entries(sourceMap)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={sourceHash:s.sha256,data:bytes.toString('base64')};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/broad-material-review`);
 const result=await page.evaluate(async({ownership,binding,registration,sources})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js');
  const {createFamilyBodyMaterialModel,defaultBodyMaterials}=await import('/character-materials.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const family=await prepareBodyFamily({ownership,sources:loaded});if(JSON.stringify(family.binding)!==JSON.stringify(binding))throw Error('Prepared body binding changed');
  const model=await createFamilyBodyMaterialModel(family,registration,{maxFrames:8});
  const recipes=[{skin:'warm',shirt:'cream',shorts:'umber',shoes:'brown'},{skin:'sunlit',shirt:'indigo',shorts:'sage',shoes:'graphite'},{skin:'copper',shirt:'terracotta',shorts:'cream',shoes:'graphite'},{skin:'warm',shirt:'teal',shorts:'sage',shoes:'brown'}];
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  const boards=[];let alphaComparisons=0;
  try{for(const sheet of ['base','idle','activities']){
   const board=document.createElement('canvas');board.width=1536;board.height=2048;const c=board.getContext('2d');c.fillStyle='#e3d8b6';c.fillRect(0,0,board.width,board.height);
   for(let pose=0;pose<16;pose++)for(let variant=0;variant<recipes.length;variant++){
    const provider=model.provider(recipes[variant]);const frame=provider.frameForPose(sheet,pose),a=frame.getContext('2d').getImageData(0,0,256,256).data,b=family.frames[sheet][pose].getContext('2d').getImageData(0,0,256,256).data;
    for(let p=3;p<a.length;p+=4)if(a[p]!==b[p])throw Error('Palette changed silhouette');alphaComparisons++;
    for(const facing of [1,-1]){const col=variant*2+(facing===1?0:1);drawResidentAnimation(c,scratch,{...provider,interpolation:'keyframes'},{layers:[{sheet,row:Math.floor(pose/4),frame:pose%4,weight:1}],facing,breath:1},col*192+96,pose*128+112,108);c.fillStyle='#483a27';c.font='11px monospace';c.fillText(`${sheet}:${pose} p${variant} f${facing}`,col*192+4,pose*128+125);}
   }
   boards.push({sheet,pixels:board.toDataURL('image/png').split(',')[1]});board.width=board.height=0;
  }return {boards,recipes,alphaComparisons,renderedViews:384};}finally{model.clear();family.dispose();scratch.width=scratch.height=0;}
 },{ownership,binding,registration,sources});
 assert.deepEqual(errors,[]);assert.equal(result.alphaComparisons,192);
 for(const b of result.boards){b.path=root+`/material-palette-facing-${b.sheet}-v1.png`;await writeFile(b.path,Buffer.from(b.pixels,'base64'));delete b.pixels;b.sha256=hash(await readFile(b.path));}
 const inputs={};for(const path of [root+'/body-binding-v1.json',root+'/body-material-regions-v2.json','scripts/review-broad-palettes.mjs','web/character-materials.js','web/resident-animation.js'])inputs[path]=hash(await readFile(path));
 await writeFile(root+'/material-palette-facing-review-v1.json',JSON.stringify({schema:1,status:'Visual review pending; internal body only',why:'Inspect contrasting palettes and both facings through the actual resident painter',...result,inputs,errors},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
