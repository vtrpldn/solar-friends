// Candidate material review only; no public family or artwork edits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const revision='v2',margins=process.argv.includes('--margins');
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(root+'/'+p));
const ownership=await read('body-ownership-v1.json'),binding=await read('body-binding-v1.json'),registration=await read(`body-material-regions-${revision}.json`),rig=await read(`attachment-rig-draft-${revision}.json`),sourceMap=await read('body-sources-v1.json'),sources={};
for(const [id,s]of Object.entries(sourceMap)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={sourceHash:s.sha256,data:bytes.toString('base64')};}
const hatRegistration=JSON.parse(await readFile('web/art/characters/prototype-v1/straw-hat-breathe-v1-registration.json'));const hatSource=hatRegistration.source;const hatBytes=await readFile('web/art/characters/prototype-v1/'+hatSource.file);assert.equal(hash(hatBytes),hatSource.sha256);const hatData=hatBytes.toString('base64');
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/broad-material-review`);
 const result=await page.evaluate(async({ownership,binding,registration,sources,rig,revision,hatData,hatRegistration,margins})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js');
  const {createFamilyBodyMaterialModel,defaultBodyMaterials}=await import('/character-materials.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const family=await prepareBodyFamily({ownership,sources:loaded});if(JSON.stringify(family.binding)!==JSON.stringify(binding))throw Error('Prepared body binding changed');
  const {validateAttachmentRig}=await import('/character-attachments.js');validateAttachmentRig(rig,family.binding);
  const hatImage=new Image();hatImage.src='data:image/png;base64,'+hatData;await hatImage.decode();const hat=document.createElement('canvas');hat.width=hat.height=256;hat.getContext('2d').drawImage(hatImage,0,0,256,256);const pixels=hat.getContext('2d').getImageData(0,0,256,256).data;
  const boards=[],fits=[];
  try{for(const sheet of ['base','idle','activities']){
   const board=document.createElement('canvas');board.width=1024;board.height=1280;const c=board.getContext('2d');c.fillStyle='#e3d8b6';c.fillRect(0,0,1024,1280);
   for(let pose=0;pose<16;pose++){const x=pose%4*256,y=Math.floor(pose/4)*320;const target=rig.poses[sheet][pose].head.position,offset=target.map((n,i)=>Math.round(n-hatRegistration.anchorHead[i]));let clipped=0,total=0;for(let p=0;p<65536;p++)if(pixels[p*4+3]){total++;const px=p%256+offset[0],py=Math.floor(p/256)+offset[1];if(px<(margins?-32:0)||py<(margins?-64:0)||px>=(margins?288:256)||py>=256)clipped++;}fits.push({sheet,pose,offset,clipped,total,kind:sheet==='base'&&pose===15?'not-worn':'unaccepted-fit'});c.save();c.beginPath();c.rect(x,y,256,256);c.clip();if(margins){const composite=document.createElement('canvas');composite.width=composite.height=320;const cc=composite.getContext('2d');cc.drawImage(family.frameForPose(sheet,pose),32,64);if(!(sheet==='base'&&pose===15))cc.drawImage(hat,32+offset[0],64+offset[1]);const scratch=document.createElement('canvas');scratch.width=scratch.height=256;drawResidentAnimation(c,scratch,{frameForPose:()=>composite,contactForPose:()=>family.contactForPose(sheet,pose),frameOriginForPose:()=>[-32,-64]}, {layers:[{sheet,row:Math.floor(pose/4),frame:pose%4,weight:1}],facing:1,breath:1},x+128,y+256,210);composite.width=composite.height=scratch.width=scratch.height=0;}else{c.drawImage(family.frameForPose(sheet,pose),x,y);if(!(sheet==='base'&&pose===15))c.drawImage(hat,x+offset[0],y+offset[1]);}c.restore();c.fillStyle='#483a27';c.font='13px monospace';c.fillText(`${sheet}:${pose} clipped ${clipped}px`,x+4,y+285);}
   boards.push({sheet,pixels:board.toDataURL('image/png').split(',')[1]});board.width=board.height=0;
  }return {boards,fits};}finally{family.dispose();hat.width=hat.height=0;}
 },{ownership,binding,registration,sources,rig,revision,hatData,hatRegistration,margins});
 assert.deepEqual(errors,[]);
 for(const b of result.boards){b.path=root+`/hat-fit-diagnostic-${b.sheet}-${margins?'v2':'v1'}.png`;await writeFile(b.path,Buffer.from(b.pixels,'base64'));delete b.pixels;b.sha256=hash(await readFile(b.path));}
 await writeFile(root+`/hat-fit-diagnostic-${margins?'v2':'v1'}.json`,JSON.stringify({status:'Unaccepted rigid-reuse diagnostic',why:'Determine whether existing painted hat fits the broader body without clipping or warping',...result,hatSource,bodyFrameIdentity:binding.frames,rigSha256:hash(await readFile(root+'/attachment-rig-draft-v2.json'))},null,2)+'\n');console.log(JSON.stringify({clippedWornPoses:result.fits.filter(f=>f.kind!=='not-worn'&&f.clipped>0).length}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
