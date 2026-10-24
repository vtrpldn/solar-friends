import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {familyWalkClothingFixture,fileSha256} from './family-walk-clothing-fixture.mjs';
const name=process.argv[2],version=process.argv[3]??'v1';assert(/^[a-z0-9-]+$/.test(name??'')&&/^v[1-9][0-9]?$/.test(version));const root='assets/art-direction/character-prototype-v1',folder=root+'/'+name,fixture=await familyWalkClothingFixture(),regs=JSON.parse(await readFile(folder+'/registrations-'+version+'.json'));assert.equal(regs.length,1);const registration=regs[0];assert.equal(await fileSha256(folder+'/candidate-'+version+'.png'),registration.source.sha256);fixture.served.set('/family-source/pose-shirt.png',await readFile(folder+'/candidate-'+version+'.png'));const manifest=JSON.parse(await readFile(root+'/body-family-relaxed-v1/complete-parts-v1/sources-v1.json'));
for(const owner of Object.values(fixture.data.owners)){const pose=owner.poses[registration.sheet][registration.index],source=manifest[pose.file];assert.equal(source.sha256,pose.partSha256);assert.equal(await fileSha256(source.path),source.sha256);fixture.served.set('/family-source/'+pose.file,await readFile(source.path));}
const materialRevision=process.argv.find(v=>v.startsWith('--materials='))?.slice(12);assert(materialRevision===undefined||/^v[1-9][0-9]?$/.test(materialRevision));const outputVersion=version+(materialRevision?'-materials-'+materialRevision:'');if(materialRevision){const path=root+'/body-family-relaxed-v1/materials-'+materialRevision+'.json';fixture.data.materials=JSON.parse(await readFile(path));delete fixture.hashes[root+'/body-family-relaxed-v1/materials-v7.json'];fixture.hashes[path]=await fileSha256(path);}
const server=await serve(0,{handle(q,r,p){if(!fixture.served.has(p))return false;r.end(fixture.served.get(p));return true;}});let browser;
try{browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async({data,r})=>{
  const {prepareBodyFamily}=await import('/character-body-family.js'),{createFamilyBodyMaterialModel}=await import('/character-materials.js'),{prepareRegisteredHair}=await import('/character-hair.js'),{extractRegisteredAtlasPart}=await import('/character-atlas-part.js'),{prepareClothingColourSource}=await import('/character-clothing-colour.js'),{prepareFamilyAccessories}=await import('/character-family-accessories.js'),{loadCharacterImageSource}=await import('/character-image-source.js');
  const cache=new Map(),load=file=>{if(!cache.has(file))cache.set(file,loadCharacterImageSource('/family-source/'+file));return cache.get(file);},sources={};for(const id of Object.keys(data.ownership.sources))sources[id]=await load('body-'+id);const family=await prepareBodyFamily({ownership:data.ownership,sources}),boards={},colours=[],paintedBodies=new Set();let model=null,accessories=null,compositions=0,alphaChecks=0,lowerChecks=0;
  const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,w,h);return c;},check=(v,m)=>{if(!v)throw Error(m);},pixels=c=>c.getContext('2d').getImageData(0,0,256,256).data;
  boards.plain=make(1024,1536);boards.equipped=make(1024,1536);boards.waist=make(1200,900);
  try{
   model=await createFamilyBodyMaterialModel(family,data.materials,{maxFrames:16});accessories=await prepareFamilyAccessories({family,registration:data.accessories,load});const source=await load('pose-shirt.png');
   for(const shirt of ['cream','teal','terracotta','indigo'])colours.push(await prepareClothingColourSource({...source,colour:shirt}));
   for(const [style,hair]of ['curls','sidepart'].entries()){
    const owner=data.owners[hair],pose=owner.poses[r.sheet][r.index],hairSource=await load(pose.file),part=extractRegisteredAtlasPart({...hairSource,registration:{sha256:pose.partSha256,size:pose.size,bounds:pose.bounds,sourceRect:pose.sourceRect??[0,0,1254,1254]}});let cap;
    try{cap=prepareRegisteredHair({...hairSource,image:part.frame,registration:{...pose,body:owner.body}});
     for(const [skinIndex,skin]of ['warm','sunlit','copper'].entries()){
      const baseline={};for(const [column,shirt]of ['cream','teal','terracotta','indigo'].entries()){
       const appearanceBody=model.provider({skin,shirt,shorts:'sage',shoes:'graphite'}).frameForPose(r.sheet,r.index);if(appearanceBody!==family.frames[r.sheet][r.index])paintedBodies.add(appearanceBody);let dressed=null,equipped=null;
       try{dressed=await cap.compose({body:family.frames[r.sheet][r.index],binding:family.binding,referenceBody:family.frames.base[8],appearanceBody,hairColour:'chestnut',clothing:{...source,registration:r,colourSource:colours[column]}});equipped=accessories.compose(dressed,{hat:true,facialHair:true},r.sheet,r.index);
        for(const [key,frame]of Object.entries({plain:dressed,equipped})){const rgba=pixels(frame);if(column===0)baseline[key]=rgba.slice();else for(let p=0;p<65536;p++){check(rgba[p*4+3]===baseline[key][p*4+3],'Colour changed final alpha');alphaChecks++;if(p>=150*256)for(let c=0;c<4;c++){check(rgba[p*4+c]===baseline[key][p*4+c],'Colour changed lower body');lowerChecks++;}}
         const ctx=boards[key].getContext('2d'),row=style*3+skinIndex;ctx.drawImage(frame,column*256,row*256);ctx.fillStyle='#483a27';ctx.font='12px monospace';ctx.fillText(`${hair}/${skin}/${shirt}`,column*256+5,row*256+16);compositions++;
        }
        if(style===0){const ctx=boards.waist.getContext('2d');ctx.drawImage(dressed,95,128,70,30,column*300,skinIndex*300,300,240);ctx.fillStyle='#483a27';ctx.font='13px monospace';ctx.fillText(`${skin}/${shirt} waist`,column*300+4,skinIndex*300+270);}
       }finally{for(const c of [dressed,equipped])if(c)c.width=c.height=0;}
      }
     }
    }finally{cap?.dispose();if(part.frame instanceof HTMLCanvasElement)part.frame.width=part.frame.height=0;}
   }
   return {compositions,alphaChecks,lowerChecks,images:Object.fromEntries(Object.entries(boards).map(([key,c])=>[key,c.toDataURL('image/png').split(',')[1]]))};
  }finally{for(const c of colours)c.dispose();for(const c of Object.values(boards))c.width=c.height=0;accessories?.dispose();for(const c of paintedBodies)c.width=c.height=0;model?.clear();family.dispose();}
 },{data:fixture.data,r:registration});assert.deepEqual(errors,[]);assert.equal(result.compositions,48);assert.equal(result.alphaChecks,2359296);for(const [key,png]of Object.entries(result.images))await writeFile(folder+'/colours-'+outputVersion+'-'+key+'.png',Buffer.from(png,'base64'));delete result.images;result.scope='Single-pose matching-body shirt colour and hat/beard review. No complete clip, world, lighting, transition or player acceptance.';result.materialRevision=materialRevision??'v7';result.sourceSha256=registration.source.sha256;result.registrationSha256=await fileSha256(folder+'/registrations-'+version+'.json');result.inputs=fixture.hashes;result.rendererSha256={};for(const file of ['web/character-clothing.js','web/character-clothing-colour.js','web/character-hair.js'])result.rendererSha256[file]=await fileSha256(file);await writeFile(folder+'/colours-'+outputVersion+'.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
