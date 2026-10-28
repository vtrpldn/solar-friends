// Candidate material review only; no public family or artwork edits.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const revision=process.argv.includes('--hands')?'v2':'v1';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(root+'/'+p));
const ownership=await read('body-ownership-v1.json'),binding=await read('body-binding-v1.json'),registration=await read(`body-material-regions-${revision}.json`),rig=await read(`attachment-rig-draft-${revision}.json`),sourceMap=await read('body-sources-v1.json'),sources={};
for(const [id,s]of Object.entries(sourceMap)){const bytes=await readFile(s.path);assert.equal(hash(bytes),s.sha256);sources[id]={sourceHash:s.sha256,data:bytes.toString('base64')};}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/broad-material-review`);
 const result=await page.evaluate(async({ownership,binding,registration,sources,rig,revision})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js');
  const {createFamilyBodyMaterialModel,defaultBodyMaterials}=await import('/character-materials.js');
  const {drawResidentAnimation}=await import('/resident-animation.js');
  const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}
  const family=await prepareBodyFamily({ownership,sources:loaded});if(JSON.stringify(family.binding)!==JSON.stringify(binding))throw Error('Prepared body binding changed');
  const {validateAttachmentRig}=await import('/character-attachments.js');validateAttachmentRig(rig,family.binding);
  const boards=[];
  try{for(const sheet of ['base','idle','activities']){
   const board=document.createElement('canvas');board.width=1024;board.height=1120;const c=board.getContext('2d');c.fillStyle='#e3d8b6';c.fillRect(0,0,1024,1120);
   for(let pose=0;pose<16;pose++){const x=pose%4*256,y=Math.floor(pose/4)*280;c.drawImage(family.frameForPose(sheet,pose),x,y);for(const [socket,color]of [['head','#d72657'],['neck','#007c91'],...(revision==='v2'?[['nearHand','#b51d9b'],['farHand','#147a22']]:[])]){const point=rig.poses[sheet][pose][socket];if(point.visibility!=='visible')continue;const [px,py]=point.position;c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(x+px,y+py,5,0,Math.PI*2);c.moveTo(x+px-8,y+py);c.lineTo(x+px+8,y+py);c.stroke();}c.fillStyle='#483a27';c.font='14px monospace';c.fillText(`${sheet}:${pose} head / neck`,x+4,y+274);}
   boards.push({sheet,pixels:board.toDataURL('image/png').split(',')[1]});board.width=board.height=0;
  }return {boards};}finally{family.dispose();}
 },{ownership,binding,registration,sources,rig,revision});
 assert.deepEqual(errors,[]);
 for(const b of result.boards){b.path=root+`/attachment-landmark-${b.sheet}-${revision}.png`;await writeFile(b.path,Buffer.from(b.pixels,'base64'));delete b.pixels;b.sha256=hash(await readFile(b.path));}
 console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
