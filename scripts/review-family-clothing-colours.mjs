import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {familyWalkClothingFixture,walkClothingOutput as output,fileSha256} from './family-walk-clothing-fixture.mjs';
const breathe=process.argv.includes('--breathe'),{familyBreatheClothingFixture,breatheClothingOutput}=await import('./family-breathe-clothing-fixture.mjs'),fixture=await (breathe?familyBreatheClothingFixture():familyWalkClothingFixture()),destination=breathe?breatheClothingOutput:output;const {mkdir}=await import('node:fs/promises');await mkdir(destination,{recursive:true});const server=await serve(0,{handle(req,res,path){if(!fixture.served.has(path))return false;res.writeHead(200,{'Content-Type':'image/png'}).end(fixture.served.get(path));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/family-clothing-colours`);
 const result=await page.evaluate(async ({data,clip})=>{
  const {prepareFamilyClothingReview}=await import('/artwork/character-family-walk-review.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),cache=new Map(),load=file=>{if(!cache.has(file))cache.set(file,loadCharacterImageSource('/family-source/'+file));return cache.get(file);},images={},check=(v,m)=>{if(!v)throw Error(m);};let compositions=0,alphaChecks=0;
  for(const skin of ['warm','sunlit','copper']){
   const boards=['curls','sidepart'].map(()=>{const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,1024,1024);return c;}),baselines=[[],[]];
   try{for(const [column,shirt]of ['cream','teal','terracotta','indigo'].entries()){
    const model=await prepareFamilyClothingReview({...data,load,clip,materialRecipe:{skin,shirt,shorts:'sage',shoes:'graphite'}});
    try{for(const [style,provider]of model.providers.entries())for(let row=0;row<4;row++){const index=row+(clip==='breathe'?8:0);
     const frame=provider.frameForPose('base',index),rgba=frame.getContext('2d').getImageData(0,0,256,256).data;
     if(column===0)baselines[style][index]=rgba.slice();else for(let p=0;p<65536;p++){check(rgba[p*4+3]===baselines[style][index][p*4+3],`Alpha differs ${skin}/${shirt}/${style}/${index}/${p}`);alphaChecks++;}
     const ctx=boards[style].getContext('2d');ctx.drawImage(frame,column*256,row*256);ctx.fillStyle='#483a27';ctx.font='13px monospace';ctx.fillText(`${skin} / ${shirt} / ${index}`,column*256+6,row*256+18);compositions++;
    }}finally{model.dispose();}
   }
   for(const [i,hair]of ['curls','sidepart'].entries())images[skin+'-'+hair]=boards[i].toDataURL('image/png').split(',')[1];
   }finally{for(const c of boards)c.width=c.height=0;}
  }return {compositions,alphaChecks,images};
 },{data:fixture.data,clip:breathe?'breathe':'walk'});
 assert.deepEqual(errors,[]);assert.equal(result.compositions,96);assert.equal(result.alphaChecks,4718592);for(const [name,png]of Object.entries(result.images))await writeFile(destination+'/matching-colours-v1-'+name+'.png',Buffer.from(png,'base64'));delete result.images;result.scope='Static matching-body shirt colour review, 4 clip poses x 4 colours x 3 skin tones x 2 hairstyles. No accessory, lighting, motion or player acceptance.';result.clip=breathe?'breathe':'walk';result.inputSha256=fixture.hashes;result.rendererSha256={};for(const file of ['web/artwork/character-family-walk-review.js','web/character-clothing-colour.js','web/character-clothing.js'])result.rendererSha256[file]=await fileSha256(file);await writeFile(destination+'/matching-colours-v1.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
