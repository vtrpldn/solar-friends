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
const server=await serve(0,{handle(req,res,path){if(!served.has(path))return false;res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}).end(served.get(path));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/family-complete-review`);
 const result=await page.evaluate(async({ownership,materials,owners,equipment})=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{prepareBodyFamily}=await import('/character-body-family.js'),{createFamilyBodyMaterialModel}=await import('/character-materials.js'),{prepareRegisteredHair}=await import('/character-hair.js'),{extractRegisteredAtlasPart,composeActivityUnderlay}=await import('/character-atlas-part.js'),{loadEquipmentArt,validateEquipmentParts}=await import('/character-equipment-parts.js'),{registeredEquipmentFrame}=await import('/character-equipment.js'),{createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{canonical}=await import('/editor/journal.js');
  const check=(v,message)=>{if(!v)throw Error(message);},loaded={},sourceCache=new Map(),load=file=>{if(!sourceCache.has(file))sourceCache.set(file,loadCharacterImageSource('/family-source/'+file));return sourceCache.get(file);},pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data,equal=(a,b)=>a.every((v,i)=>v===b[i]),make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').fillStyle='#e8dfbf';c.getContext('2d').fillRect(0,0,w,h);return c;};
  for(const id of Object.keys(ownership.sources))loaded[id]=await loadCharacterImageSource('/family-source/body-'+id);
  const family=await prepareBodyFamily({ownership,sources:loaded}),model=await createFamilyBodyMaterialModel(family,materials,{maxFrames:48}),oldLibrary=createResidentPartLibrary(),tools=[];let composed=0,unchanged=0,returns=0,foregrounds=0;const boards={},hashes=[];
  for(const registration of equipment){check(canonical(registration.body)===canonical(family.binding),'Equipment family identity differs');if(registration.schema===2)validateEquipmentParts(registration);tools.push({registration,equipment:await loadEquipmentArt(registration,load)});}
  try{
   for(const style of ['curls','sidepart']){
    const owner=owners[style];check(canonical(owner.body)===canonical(family.binding),'Hair family identity differs');
    const old=await oldLibrary.prepare(residentPartRecipe({hair:style==='curls'?'short-curls-v1':'side-part-v1'})),board=make(1600,1800);boards[style]=board;
    for(const [si,sheet]of ['base','idle','activities'].entries())for(let index=0;index<16;index++){
     const pose=owner.poses[sheet][index],source=await load(pose.file),part=extractRegisteredAtlasPart({...source,registration:{sha256:pose.partSha256,size:1254,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}}),composer=prepareRegisteredHair({...source,image:part.frame,registration:{...pose,body:owner.body}});let activity=null;
     if(pose.activity){const a=pose.activity;activity=extractRegisteredAtlasPart({...await load(a.file),registration:{sha256:a.sha256,size:a.size,bounds:a.bounds,sourceRect:a.sourceRect}});}
     for(const [paletteIndex,palette]of [{skin:'warm',shirt:'cream',shorts:'cream',shoes:'brown'},{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}].entries()){
      const args={body:family.frames[sheet][index],binding:family.binding,appearanceBody:model.provider(palette).frameForPose(sheet,index)},appearance=await composer.compose({...args,referenceBody:family.frames.base[8],hairColour:paletteIndex?'silver':'chestnut'});let frame=appearance;
      try{
       if(activity)frame=composeActivityUnderlay(appearance,activity);
       if(sheet==='activities'){
        const options={...args,appearanceFrame:appearance,...tools[index],sheet,index};frame=await registeredEquipmentFrame(options);foregrounds++;
        if([13,14].includes(index)&&paletteIndex===0){const {registration,equipment:art}=tools[index],keep=registration.parts.map((p,i)=>p.id.startsWith('grain-')?-1:i).filter(i=>i>=0),returned=await registeredEquipmentFrame({...options,registration:{...registration,parts:keep.map(i=>registration.parts[i])},equipment:{...art,parts:keep.map(i=>art.parts[i])}});try{check(equal(pixels(returned),pixels(old.frameForPose(sheet,index,{sequenceIndex:5}))),'Feeding return changed');returns++;}finally{returned.width=returned.height=0;}}
       }
       const changed=sheet==='base'&&(index<4||style==='sidepart'&&index===8);
       if(!paletteIndex&&!changed){check(equal(pixels(frame),pixels(old.frameForPose(sheet,index))),'Unchanged family appearance differs '+style+' '+sheet+':'+index);unchanged++;}
       const offset=si*16+index,x=offset%8*200,y=Math.floor(offset/8)*300,ctx=board.getContext('2d');ctx.drawImage(frame,x+paletteIndex*100,y+15,100,100);ctx.save();ctx.translate(x+190-paletteIndex*100,y+250);ctx.scale(-1,1);ctx.drawImage(frame,0,-100,100,100);ctx.restore();ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${style} ${sheet}:${index}`,x+3,y+280);
       const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pixels(frame)))].map(n=>n.toString(16).padStart(2,'0')).join('');hashes.push({style,sheet,index,palette:paletteIndex,sha256:digest});composed++;
      }finally{if(frame!==appearance)frame.width=frame.height=0;appearance.width=appearance.height=0;}
     }
     if(part.frame instanceof HTMLCanvasElement)part.frame.width=part.frame.height=0;if(activity?.frame instanceof HTMLCanvasElement)activity.frame.width=activity.frame.height=0;
    }
   }
   return {scope:'Internal complete 48-pose hair/tool/stool assembly, two styles and two palettes. No public body recipe, hat/beard/clothing/body-range, animation/world or player acceptance claim.',composed,unchanged,returns,foregrounds,hashes,boards:Object.fromEntries(Object.entries(boards).map(([key,c])=>[key,c.toDataURL('image/png').split(',')[1]]))};
  }finally{for(const board of Object.values(boards))board.width=board.height=0;model.clear();family.dispose();}
 },{ownership,materials,owners,equipment});
 assert.deepEqual(errors,[]);assert.equal(result.composed,192);assert.equal(result.unchanged,87);assert.equal(result.returns,4);assert.equal(result.foregrounds,64);
 for(const [style,base64]of Object.entries(result.boards))await writeFile(out+'/review-v1-'+style+'.png',Buffer.from(base64,'base64'));delete result.boards;
 result.inputSha256={};for(const file of ['hair-curls-v1.json','hair-sidepart-v1.json','equipment-v1.json','sources-v1.json','ownership-proof-v1.json'])result.inputSha256[file]=sha(await readFile(out+'/'+file));result.rendererSha256={};for(const file of ['character-hair.js','character-hair-placement.js','character-materials.js','character-atlas-part.js','character-equipment.js','character-equipment-parts.js','character-foreground.js'])result.rendererSha256[file]=sha(await readFile('web/'+file));await writeFile(out+'/review-v1.json',JSON.stringify(result,null,2)+'\n');delete result.hashes;console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
