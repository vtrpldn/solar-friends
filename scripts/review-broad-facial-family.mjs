import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const revision=process.argv.includes('--refined')?'v2':'v1';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',hash=b=>createHash('sha256').update(b).digest('hex'),read=async n=>JSON.parse(await readFile(`${root}/${n}`));
const definition=await read('composed-family-draft-v2.json'),registration=await read(`facial-family-atlas-draft-${revision}.json`),guides=await read(`facial-family-seeds-${revision}.json`),sources={};
for(const [id,s]of Object.entries(definition.sources)){const b=await readFile(s.path);assert.equal(hash(b),s.sha256);sources[id]={data:b.toString('base64'),sourceHash:s.sha256};}
const bytes=await readFile(`${root}/facial-standing-candidate-v2.png`);assert.equal(hash(bytes),registration.sources.beard.sha256);const source={data:bytes.toString('base64'),sourceHash:hash(bytes)},server=await serve(0);let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/facial-family`);
 const result=await page.evaluate(async({definition,registration,guides,sources,source})=>{
  const {prepareComposedResidentFamily}=await import('/character-composed-family.js'),{paintRegisteredEquipmentAtlas}=await import('/character-equipment-atlas.js'),{drawResidentAnimation}=await import('/resident-animation.js');
  const loaded={};for(const [id,s]of Object.entries(sources)){const image=new Image();image.src='data:image/png;base64,'+s.data;await image.decode();loaded[id]={image,sourceHash:s.sourceHash};}const beard=new Image();beard.src='data:image/png;base64,'+source.data;await beard.decode();
  const bundle=await prepareComposedResidentFamily({definition,sources:loaded,recipe:{schema:2,family:definition.id,hair:'side-part-v1',hairColour:'chestnut',hat:'none',materials:{skin:'warm',shirt:'teal',shorts:'sage',shoes:'graphite'}}}),out={};let count=0;
  try{for(const sheet of ['base','idle','activities']){
   const board=document.createElement('canvas'),heads=document.createElement('canvas'),scratch=document.createElement('canvas');board.width=1024;board.height=1280;heads.width=1024;heads.height=640;scratch.width=scratch.height=256;const ctx=board.getContext('2d'),hc=heads.getContext('2d');ctx.fillStyle=hc.fillStyle='#e3d8b6';ctx.fillRect(0,0,1024,1280);hc.fillRect(0,0,1024,640);
   try{for(let i=0;i<16;i++){
    const x=i%4*256,y=Math.floor(i/4)*320,hy=Math.floor(i/4)*160,guide=guides.guides.find(g=>g.sheet===sheet&&g.index===i);
    if(!guide){for(const [c,yy]of [[ctx,y+140],[hc,hy+80]]){c.fillStyle='#704738';c.font='16px monospace';c.fillText('UNAUTHORED SLEEP',x+10,yy);}continue;}
    const frame=bundle.provider.frameForPose(sheet,i),origin=bundle.provider.frameOriginForPose(sheet,i),overlay=paintRegisteredEquipmentAtlas({binding:registration.body,registration,sources:{beard:{image:beard,sourceHash:source.sourceHash}},sheet,index:i}),composed=document.createElement('canvas');composed.width=frame.width;composed.height=frame.height;
    try{const c=composed.getContext('2d');c.drawImage(frame,0,0);c.drawImage(overlay,-origin[0],-origin[1]);drawResidentAnimation(ctx,scratch,{...bundle.provider,frameForPose:()=>composed,frameOriginForPose:()=>origin},{layers:[{sheet,row:Math.floor(i/4),frame:i%4,weight:1}],facing:1,breath:1},x+128,y+285,230);const [cx,cy,rx,ry]=guide.head,left=cx-rx-7,top=cy-ry-8,w=rx*2+30,h=ry*2+22;for(const [n,image]of [frame,composed].entries())hc.drawImage(image,left-origin[0],top-origin[1],w,h,x+n*128,hy+18,128,128*h/w);ctx.fillStyle=hc.fillStyle='#483a27';ctx.font='13px monospace';hc.font='12px monospace';ctx.fillText(`${sheet}:${i}`,x+6,y+310);hc.fillText(`${sheet}:${i} bare / beard seed`,x+4,hy+14);count++;}finally{overlay.width=overlay.height=composed.width=composed.height=0;}
   }out[sheet]={body:board.toDataURL('image/png').split(',')[1],heads:heads.toDataURL('image/png').split(',')[1]};}finally{board.width=board.height=heads.width=heads.height=scratch.width=scratch.height=0;}
  }return {count,boards:out};}finally{bundle.dispose();}
 },{definition,registration,guides,sources,source});assert.equal(result.count,47);
 const outputs={};for(const [sheet,boards]of Object.entries(result.boards))for(const [kind,data]of Object.entries(boards)){const path=`${root}/facial-family-${sheet}-${kind}-draft-${revision}.png`;await writeFile(path,Buffer.from(data,'base64'));outputs[path]=hash(await readFile(path));}
 const inputs={};for(const p of ['scripts/review-broad-facial-family.mjs','web/character-equipment-atlas.js',`${root}/facial-family-atlas-draft-${revision}.json`,`${root}/facial-family-seeds-${revision}.json`,`${root}/composed-family-draft-v2.json`])inputs[p]=hash(await readFile(p));await writeFile(`${root}/facial-family-draft-${revision}.json`,JSON.stringify({status:'Landmark-seeded fitting proposal; all visual review pending',poses:result.count,missing:guides.missing,inputs,outputs},null,2)+'\n');console.log('Rendered47 initial facial placement proposals; sleeping remains explicitly unauthored.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
