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
  const model=await createFamilyBodyMaterialModel(family,registration,{maxFrames:8}),plain=model.provider(),diagnostic=model.provider(defaultBodyMaterials,{diagnostic:true}),palette={skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'},colored=model.provider(palette),counts={},boards=[],focus=[],shoeSkinCandidates=[];let preservedDefaults=0,alphaProofs=0,isolatedMaterialProofs=0,maskCopyProofs=0;
  const scratch=document.createElement('canvas');scratch.width=scratch.height=256;
  try{for(const sheet of ['base','idle','activities']){
   const board=document.createElement('canvas');board.width=1536;board.height=1280;const b=board.getContext('2d');b.fillStyle='#e3d8b6';b.fillRect(0,0,1536,1280);counts[sheet]=[];
   for(let index=0;index<16;index++){
    if(plain.frameForPose(sheet,index)!==family.frameForPose(sheet,index))throw Error('Default material changed body pixels');preservedDefaults++;
    const mask=model.mask(sheet,index);counts[sheet].push(mask.counts);if(mask.counts[1]<50||mask.counts[2]<50||mask.counts[3]<20)throw Error('Missing material coverage '+sheet+':'+index);
    const before=mask.labels[0];mask.labels[0]=4;if(model.mask(sheet,index).labels[0]!==before)throw Error('Caller mutated owned material mask');maskCopyProofs++;
    const pixels=family.frames[sheet][index].getContext('2d').getImageData(0,0,256,256).data;
    if(sheet==='activities'&&index>=8&&index<=11){const rows=[];for(let y=0;y<256;y++){const xs=[];for(let x=0;x<256;x++){const p=y*256+x,o=p*4,[r,g,b,a]=pixels.subarray(o,o+4);if(mask.labels[p]===4&&a>=200&&r>170&&g/r<.72&&b/r<.49&&b/Math.max(1,g)<.65)xs.push(x);}if(xs.length)rows.push({y,min:Math.min(...xs),max:Math.max(...xs)});}shoeSkinCandidates.push({sheet,index,rows});}
    const changed=colored.frameForPose(sheet,index).getContext('2d').getImageData(0,0,256,256).data;
    for(let p=0;p<65536;p++)if(changed[p*4+3]!==pixels[p*4+3])throw Error('Material tint changed silhouette alpha');alphaProofs++;
    for(const [material,id,color]of [['skin',1,'sunlit'],['shirt',2,'indigo'],['shorts',3,'umber'],['shoes',4,'graphite']]){
     const result=model.provider({...defaultBodyMaterials,[material]:color}).frameForPose(sheet,index).getContext('2d').getImageData(0,0,256,256).data;
     const labels=model.mask(sheet,index).labels;for(let p=0;p<labels.length;p++)if(labels[p]!==id)for(let channel=0;channel<4;channel++)if(result[p*4+channel]!==pixels[p*4+channel])throw Error('Material tint escaped its measured region');isolatedMaterialProofs++;
    }
    const x=index%4*384,y=Math.floor(index/4)*320,animation={layers:[{sheet,row:Math.floor(index/4),frame:index%4,weight:1}],facing:1,breath:1};
    for(const [provider,dx]of [[diagnostic,96],[colored,285]])drawResidentAnimation(b,scratch,{...provider,interpolation:'keyframes'},animation,x+dx,y+230,170);
    b.fillStyle='#483a27';b.font='14px monospace';b.fillText(`${sheet}:${index} mask / palette`,x+8,y+310);
    if((sheet==='activities'&&index>=8&&index<=11)||(sheet==='base'&&index===15)){const close=document.createElement('canvas');close.width=1536;close.height=560;const c=close.getContext('2d');c.fillStyle='#e3d8b6';c.fillRect(0,0,1536,560);for(const [provider,col]of [[family,0],[diagnostic,1],[colored,2]]){c.drawImage(provider.frameForPose(sheet,index),col*512,0,512,512);c.fillStyle='#483a27';c.font='18px monospace';c.fillText(`${sheet}:${index} ${['source','mask','palette'][col]}`,col*512+12,540);}focus.push({sheet,index,pixels:close.toDataURL('image/png').split(',')[1]});close.width=close.height=0;}
   }
   boards.push({sheet,pixels:board.toDataURL('image/png').split(',')[1]});board.width=board.height=0;
  }
  const semanticProbes=[['activities',11,162,205,1,'forearm above hidden boot'],['activities',10,65,182,4,'rear boot collar'],['activities',10,173,201,4,'front boot collar'],['activities',11,64,184,4,'rear boot collar'],['activities',9,154,209,1,'hand over boot'],['activities',9,165,226,1,'hand fingertip'],['activities',11,187,216,1,'extended hand'],['activities',11,199,225,1,'extended fingertip'],['activities',11,80,150,2,'back vest'],['base',15,110,160,2,'sleep vest'],['base',15,174,127,3,'sleep upper shorts'],['base',15,153,178,3,'sleep lower shorts'],['base',15,220,164,1,'bare sleep foot']];
  for(const [sheet,index,x,y,label,note]of semanticProbes)if(model.mask(sheet,index).labels[y*256+x]!==label)throw Error('Incorrect authored semantic material probe: '+note);
  const wrong=structuredClone(registration);wrong.body.frames.base[0]='0'.repeat(64);let staleBindingRefused=false;try{await createFamilyBodyMaterialModel(family,wrong);}catch{staleBindingRefused=true;}if(!staleBindingRefused)throw Error('Stale material binding accepted');
  const cache=model.cacheInfo();if(cache.entries>8)throw Error('Material cache exceeded selected bound');model.clear();if(model.cacheInfo().entries!==0)throw Error('Material cache did not clear');
  return {counts,boards,focus,shoeSkinCandidates,semanticProbes,preservedDefaults,alphaProofs,isolatedMaterialProofs,maskCopyProofs,staleBindingRefused,cache};
  }finally{model.clear();family.dispose();scratch.width=scratch.height=0;}
 },{ownership,binding,registration,sources});
 assert.deepEqual(errors,[]);assert.equal(result.preservedDefaults,48);assert.equal(result.isolatedMaterialProofs,192);
 for(const b of result.boards){b.path=root+`/material-${b.sheet}-draft-${revision}.png`;await writeFile(b.path,Buffer.from(b.pixels,'base64'));delete b.pixels;}
 for(const f of result.focus){f.path=root+`/material-focus-${f.sheet}-${f.index}-${revision}.png`;await writeFile(f.path,Buffer.from(f.pixels,'base64'));delete f.pixels;}
 const inputs={};for(const path of [root+'/body-ownership-v1.json',root+'/body-binding-v1.json',root+`/body-material-regions-${revision}.json`,root+`/material-source-regions-${revision}.json`,'scripts/author-broad-material-regions.mjs','scripts/review-broad-materials.mjs','web/character-materials.js','web/character-body-family.js','web/resident-animation.js'])inputs[path]=hash(await readFile(path));
 await writeFile(root+`/material-review-draft-${revision}.json`,JSON.stringify({schema:1,status:'Diagnostic candidate; visual review pending; no public availability',why:'Review per-pose material separation on the complete exact broader body',...result,inputs,errors},null,2)+'\n');console.log(JSON.stringify({...result,counts:'48 pose counts recorded',boards:result.boards.map(b=>b.path)}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
