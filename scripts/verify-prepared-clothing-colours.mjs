import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {familyWalkClothingFixture} from './family-walk-clothing-fixture.mjs';
import {tintClothingPixels} from '../web/character-clothing-colour.js';
const input={width:4,height:1,data:new Uint8ClampedArray([238,218,180,255,119,109,90,128,250,245,240,1,7,8,9,0])},original=input.data.slice();
for(const colour of ['cream','teal','terracotta','indigo']){
 const result=tintClothingPixels(input,colour);assert.notEqual(result.data,input.data);assert.deepEqual(input.data,original);
 for(let p=0;p<4;p++)assert.equal(result.data[p*4+3],original[p*4+3]);assert.deepEqual(result.data.slice(12),original.slice(12));
 if(colour==='cream')assert.deepEqual(result.data,original);
 else for(let c=0;c<3;c++)assert(Math.abs(result.data[c]/2-result.data[4+c])<=1);
}
for(const colour of ['reference','constructor','',null,{},'pink'])assert.throws(()=>tintClothingPixels(input,colour));
for(const bad of [{...input,width:0},{...input,width:1255},{...input,data:new Uint8Array(16)},{...input,height:2}])assert.throws(()=>tintClothingPixels(bad));
const fixture=await familyWalkClothingFixture(),server=await serve(0,{handle(req,res,path){if(!fixture.served.has(path))return false;res.writeHead(200,{'Content-Type':'image/png'}).end(fixture.served.get(path));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/clothing-colour-verification`);
 const result=await page.evaluate(async data=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{prepareClothingColourSource}=await import('/character-clothing-colour.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{composeClothingPose}=await import('/character-clothing.js');
  const check=(v,m)=>{if(!v)throw Error(m);},sources={};for(const id of Object.keys(data.ownership.sources))sources[id]=await loadCharacterImageSource('/family-source/body-'+id);const family=await prepareBodyFamily({ownership:data.ownership,sources}),pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data;
  const board=document.createElement('canvas');board.width=1024;board.height=1024;const ctx=board.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,1024,1024);let compositions=0,alphaChecks=0,refused=0;
  try{for(const garment of data.garments){const source=await loadCharacterImageSource('/family-source/'+garment.file),r=garment.registration,body=family.frames.base[r.index],args={body,binding:family.binding,...source,registration:r,sheet:'base',index:r.index},baseline=composeClothingPose(args).frame,base=pixels(baseline).slice(),original=pixels(body).slice();
   try{for(const [column,colour]of ['cream','teal','terracotta','indigo'].entries()){
    const colourSource=await prepareClothingColourSource({...source,colour});let frame;
    try{frame=composeClothingPose({...args,colourSource}).frame;const rgba=pixels(frame);let changed=0;
     for(let p=0;p<65536;p++){check(rgba[p*4+3]===base[p*4+3],`Final alpha differs pose ${r.index} colour ${colour} pixel ${p}: ${base[p*4+3]} / ${rgba[p*4+3]}`);alphaChecks++;if(colour==='cream')for(let c=0;c<4;c++)check(rgba[p*4+c]===base[p*4+c],'Cream output differs');if(rgba[p*4]!==base[p*4])changed++;}
     for(const [start,length]of r.foreground?.runs??[])for(let p=start;p<start+length;p++)if(original[p*4+3]===255)for(let c=0;c<4;c++)check(rgba[p*4+c]===original[p*4+c],'Foreground skin changed');
     check(colour==='cream'||changed>500,'Colour not applied');ctx.drawImage(frame,column*256,r.index*256);ctx.fillStyle='#483a27';ctx.font='13px monospace';ctx.fillText(`${r.index}: ${colour}`,column*256+8,r.index*256+20);compositions++;
     let denied=false;try{composeClothingPose({...args,colourSource:{colour}});}catch{denied=true;}check(denied,'Forged colour source accepted');refused++;
    }finally{if(frame)frame.width=frame.height=0;colourSource.dispose();colourSource.dispose();}
    let denied=false;try{composeClothingPose({...args,colourSource});}catch{denied=true;}check(denied,'Disposed colour source accepted');refused++;
   }}finally{baseline.width=baseline.height=0;}
  }return {compositions,alphaChecks,refused,board:board.toDataURL('image/png').split(',')[1]};
  }finally{board.width=board.height=0;family.dispose();}
 },fixture.data);assert.deepEqual(errors,[]);assert.equal(result.compositions,16);assert.equal(result.refused,32);const {writeFile}=await import('node:fs/promises');const output='assets/art-direction/character-prototype-v1/short-sleeve-relaxed-walk-complete-v1';await writeFile(output+'/colours-v1.png',Buffer.from(result.board,'base64'));delete result.board;result.scope='Decoded-image colour path; four raw-body walking poses, no hair, one skin palette. Full matching-body colour, edges, lighting and player review remain open.';result.inputs=fixture.hashes;const {fileSha256}=await import('./family-walk-clothing-fixture.mjs');result.rendererSha256={};for(const file of ['web/character-clothing.js','web/character-clothing-colour.js'])result.rendererSha256[file]=await fileSha256(file);await writeFile(output+'/colours-v1.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
