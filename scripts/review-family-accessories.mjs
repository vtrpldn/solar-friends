// Full prepared family composition; frozen old output comparisons are equivalence,
// while retained boards support a separate visual review of changed attachments.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const root='assets/art-direction/character-prototype-v1/body-family-relaxed-v1',out=root+'/complete-parts-v1',read=async file=>JSON.parse(await readFile(file,'utf8')),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ownership=await read(root+'/ownership-v1.json'),materials=await read(root+'/materials-v7.json'),files=await read(root+'/source-files-v1.json'),sourceManifest=await read(out+'/sources-v1.json'),owners={curls:await read(out+'/hair-curls-v1.json'),sidepart:await read(out+'/hair-sidepart-v1.json')},equipment=await read(out+'/equipment-v1.json'),served=new Map();
for(const [id,path]of Object.entries(files)){const bytes=await readFile(path);assert.equal(sha(bytes),ownership.sources[id].sha256);served.set('/family-source/body-'+id,bytes);}
for(const [file,source]of Object.entries(sourceManifest)){const bytes=await readFile(source.path);assert.equal(sha(bytes),source.sha256);served.set('/family-source/'+file,bytes);}
const accessories=await read(root+'/accessories-v1/registration-v1.json'),accessorySources=await read(root+'/accessories-v1/sources-v1.json');for(const [file,source]of Object.entries(accessorySources)){const bytes=await readFile(source.path);assert.equal(sha(bytes),source.sha256);served.set('/family-source/'+file,bytes);}
const server=await serve(0,{handle(req,res,path){if(!served.has(path))return false;res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(served.get(path));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/family-accessory-review`);
 const result=await page.evaluate(async({ownership,materials,owners,equipment,accessories})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{loadCharacterImageSource}=await import('/character-image-source.js'),{prepareFamilyAppearanceLibrary}=await import('/character-family-appearance.js'),{createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{unlitFilter}=await import('/power.js');
  const loaded={},sourceCache=new Map(),load=file=>{if(!sourceCache.has(file))sourceCache.set(file,loadCharacterImageSource('/family-source/'+file));return sourceCache.get(file);},check=(ok,msg)=>{if(!ok)throw Error(msg);},pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data,equal=(a,b)=>a.every((v,i)=>v===b[i]),make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,w,h);return c;};
  for(const id of Object.keys(ownership.sources))loaded[id]=await loadCharacterImageSource('/family-source/body-'+id);
  const family=await prepareBodyFamily({ownership,sources:loaded}),library=await prepareFamilyAppearanceLibrary({family,materials,owners,equipment,accessories,load,maxEntries:2}),oldLibrary=createResidentPartLibrary(),boards={curls:make(1600,1800),sidepart:make(1600,1800),heads:make(1600,1300)},palettes=[{skin:'warm',shirt:'cream',shorts:'cream',shoes:'brown'},{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}],options=[{hat:'none',facialHair:'none'},{hat:'straw-v1',facialHair:'none'},{hat:'none',facialHair:'short-chestnut-v1'},{hat:'straw-v1',facialHair:'short-chestnut-v1'}];let composed=0,unchanged=0,returns=0;const hashes=[];
  try{
   for(const [styleIndex,hair]of ['curls','sidepart'].entries())for(const [palette,material]of palettes.entries())for(const [option,flags]of options.entries()){
    const value={hair,hairColour:palette?'silver':'chestnut',materials:material,...flags},lease=await library.acquire(value),provider=lease.provider,old=palette?null:await oldLibrary.prepare(residentPartRecipe({...flags,hair:hair==='curls'?'short-curls-v1':'side-part-v1'}));
    try{
     for(const [si,sheet]of ['base','idle','activities'].entries())for(let index=0;index<16;index++){
      const frame=provider.frameForPose(sheet,index),changed=sheet==='base'&&(index<4||hair==='sidepart'&&index===8);
      if(old&&!changed){check(equal(pixels(frame),pixels(old.frameForPose(sheet,index))),'Unchanged accessory appearance differs '+hair+' '+option+' '+sheet+':'+index);unchanged++;}
      if(old&&sheet==='activities'&&[13,14].includes(index)){check(equal(pixels(provider.frameForPose(sheet,index,{sequenceIndex:5})),pixels(old.frameForPose(sheet,index,{sequenceIndex:5}))),'Equipped feeding return differs');returns++;}
      if(option===3){const slot=si*16+index,x=slot%8*200,y=Math.floor(slot/8)*300,ctx=boards[hair].getContext('2d');ctx.drawImage(frame,x+palette*100,y+15,100,100);ctx.save();ctx.translate(x+190-palette*100,y+250);ctx.scale(-1,1);ctx.filter=unlitFilter(1);ctx.drawImage(frame,0,-100,100,100);ctx.restore();ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${hair} ${sheet}:${index}`,x+3,y+280);}
      if(palette===0&&sheet==='base'&&[0,1,2,3,8].includes(index)){const pose=[0,1,2,3,8].indexOf(index),slot=(styleIndex*5+pose)*4+option,x=slot%8*200,y=Math.floor(slot/8)*260,ctx=boards.heads.getContext('2d');ctx.drawImage(frame,85,0,110,110,x,y,200,200);ctx.fillStyle='#483a27';ctx.font='11px monospace';ctx.fillText(`${hair} base:${index} option:${option}`,x+3,y+223);ctx.fillText('0 bare / 1 hat / 2 beard / 3 both',x+3,y+240);}
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels(frame)))].map(n=>n.toString(16).padStart(2,'0')).join('');hashes.push({hair,palette,option,sheet,index,sha256:digest});composed++;
     }
    }finally{lease.release();}
   }
   const info=library.info();check(info.accessories.hatFrames===1&&info.accessories.facialSourceFrames===44&&info.accessories.posePlacements===96,'Wrong shared accessory preparation');
   return {scope:'Complete internal hat/beard composition with unchanged source paint and four measured walking offsets. Static art/source review only; movement/world/player integration remains required.',composed,unchanged,returns,info,hashes,boards:Object.fromEntries(Object.entries(boards).map(([key,c])=>[key,c.toDataURL('image/png').split(',')[1]]))};
  }finally{await library.dispose();family.dispose();for(const c of Object.values(boards))c.width=c.height=0;}
 },{ownership,materials,owners,equipment,accessories});
 assert.deepEqual(errors,[]);assert.equal(result.composed,768);assert.equal(result.unchanged,348);assert.equal(result.returns,16);
 const output=root+'/accessories-v1';for(const [key,value]of Object.entries(result.boards))await writeFile(output+'/review-v1-'+key+'.png',Buffer.from(value,'base64'));delete result.boards;
 result.registrationSha256=sha(await readFile(output+'/registration-v1.json'));result.rendererSha256={};for(const file of ['character-family-appearance.js','character-family-accessories.js','character-hair.js','character-facial-hair.js'])result.rendererSha256[file]=sha(await readFile('web/'+file));await writeFile(output+'/review-v1.json',JSON.stringify(result,null,2)+'\n');delete result.hashes;console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
