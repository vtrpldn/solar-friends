import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {recordPreviewPlayback} from './record-preview-playback.mjs';
const output=process.argv[2]??'artifacts/sidepart-equipment';await mkdir(output,{recursive:true});const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {sidePartReviewRecipe,validateSidePartReviewRecipe}=await import('/artwork/character-sidepart-review.js'),{prototypeAppearanceRecipe}=await import('/character-appearance-recipe.js'),{createEquippedAppearanceReview}=await import('/artwork/character-equipped-model.js'),{createBodyForegroundLayers}=await import('/character-foreground.js'),{paintEquipmentArt}=await import('/character-equipment-parts.js'),{drawResidentAnimation,sampleResidentClip}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');
  const appearance=window.sidePartAppearanceReview.model,model=window.sidePartEquippedReview.model,materials=window.bodyMaterialsReview.model,frames=window.bodyAttachmentReview.frames,binding=window.bodyAttachmentReview.binding,reviews={cook:window.cookingEquipmentReview,water:window.equipmentPoseReview,tend:window.tendingEquipmentReview,feed:window.feedingEquipmentReview};
  const recipes=[sidePartReviewRecipe(),sidePartReviewRecipe({skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}),sidePartReviewRecipe({skin:'sunlit',shirt:'indigo',shorts:'umber',shoes:'brown'})],canvas=(w=256,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data,equal=(a,b)=>a.every((v,i)=>v===b[i]),checked=[],timelines={},boards={};
  for(const [clip,review]of Object.entries(reviews)){
   const board=canvas(1024,840),bc=board.getContext('2d');bc.fillStyle='#e3e5cd';bc.fillRect(0,0,1024,840);boards[clip]=board;
   for(const [r,recipe]of recipes.entries()){
    const provider=await model.provider(clip,recipe),hair=await appearance.provider(clip,recipe),painted=materials.provider(recipe.materials);
    for(const [index,pose]of review.poses){
     const actual=provider.frameForPose('activities',index),appearanceFrame=hair.frameForPose('activities',index),{front}=await createBodyForegroundLayers({body:frames.activities[index],binding,appearanceBody:painted.frameForPose('activities',index),mask:pose.registration.foreground,sheet:'activities',index}),hands=pixels(front),base=pixels(appearanceFrame).slice();
     for(let p=0;p<hands.length;p+=4)if(hands[p+3]){for(let c=0;c<4;c++)if(base[p+c]!==hands[p+c])throw Error('Hair obscures a tool-owned hand');base.fill(0,p,p+4);}
     const expected=canvas(),ec=expected.getContext('2d');ec.putImageData(new ImageData(base,256,256),0,0);ec.drawImage(paintEquipmentArt(pose.equipment,pose.registration),0,0);ec.drawImage(front,0,0);
     if(!equal(pixels(actual),pixels(expected)))throw Error('Equipment/hair/hand ordering differs');
     if(equal(pixels(actual),pixels(appearanceFrame)))throw Error('Activity equipment disappeared');
     if(r===1&&equal(pixels(actual),pixels(pose.frame)))throw Error('Activity silently substituted the curly hairstyle');
     if(clip==='feed'&&[13,14].includes(index)){
      const recovery=provider.frameForPose('activities',index,{sequenceIndex:5});if(equal(pixels(recovery),pixels(actual)))throw Error('Feeding return retained grain');
      // Both hairstyles must change exactly the same non-hair pixels on return.
      const keep=pose.registration.parts.map((part,i)=>part.id.startsWith('grain-')?-1:i).filter(i=>i>=0),expectedReturn=canvas(),rc=expectedReturn.getContext('2d');rc.putImageData(new ImageData(base.slice(),256,256),0,0);rc.drawImage(paintEquipmentArt({...pose.equipment,parts:keep.map(i=>pose.equipment.parts[i])},{...pose.registration,parts:keep.map(i=>pose.registration.parts[i])}),0,0);rc.drawImage(front,0,0);if(!equal(pixels(recovery),pixels(expectedReturn)))throw Error('Feeding recovery contains non-basket equipment');
      if(r===1){const old=pixels(pose.frame),oldReturn=pixels(pose.recoveryFrame),now=pixels(actual),nowReturn=pixels(recovery);let changed=0;for(let p=0;p<old.length;p++){const delta=old[p]-oldReturn[p];if(delta!==now[p]-nowReturn[p])throw Error('Hairstyle changed feeding recovery pixels');if(delta)changed++;}if(!changed)throw Error('Recovery test was vacuous');}
     }
     bc.drawImage(actual,index%4*256,r*280);bc.fillStyle='#304435';bc.font='14px sans-serif';bc.fillText('Palette '+r+' · '+clip+' '+index,index%4*256+8,r*280+273);checked.push({clip,index,palette:r});
    }
   }
   const timeline=canvas(1536,1120),tc=timeline.getContext('2d'),surface=canvas(),provider=await model.provider(clip,recipes[1]);
   for(let row=0;row<4;row++)for(let column=0;column<6;column++){const seconds=column*.5,x=column*256,y=row*280,night=row%2,facing=row<2?1:-1;tc.fillStyle=night?'#263c4b':'#e3e5cd';tc.fillRect(x,y,256,280);tc.save();tc.filter=unlitFilter(night);drawResidentAnimation(tc,surface,provider,{layers:sampleResidentClip(clip,seconds),facing,breath:1},x+128,y+244,256);tc.restore();tc.fillStyle=night?'#f4e9c8':'#304435';tc.font='14px sans-serif';tc.fillText(seconds+'s · '+(facing===1?'right':'left')+' · '+(night?'night':'day'),x+6,y+272);}timelines[clip]=timeline;
  }
  const recipe=recipes[1];model.clear();const [a,b]=await Promise.all([model.provider('feed',recipe),model.provider('feed',recipe)]);if(a!==b)throw Error('Duplicate pending tool composition');
  const bounded=createEquippedAppearanceReview({appearance,materials,frames,binding,reviews,makeRecipe:sidePartReviewRecipe,validateRecipe:validateSidePartReviewRecipe,maxClips:1});await bounded.provider('feed',recipe);await bounded.provider('water',recipe);const cache=bounded.cacheInfo();if(cache.entries!==1||cache.rgbaBytes>6*256*256*4)throw Error('Tool cache overflow');bounded.clear();if(bounded.cacheInfo().entries)throw Error('Tool cache failed to clear');
  const denied=[];for(const recipe of [prototypeAppearanceRecipe(),{...recipes[0],reviewSchema:2},{...recipes[0],extra:1}]){try{await model.provider('feed',recipe);}catch{denied.push(true);}}if(denied.length!==3)throw Error('Invalid tool recipe accepted');
  for(const clip of ['walk','breathe','sleep'])if(await model.provider(clip,recipe)!==await appearance.provider(clip,recipe))throw Error('Non-tool pose was recompiled or substituted');
  window.sidePartEquipmentBoards={boards,timelines};return {checked,cache,deniedRecipes:denied.length};
 });assert.equal(result.checked.length,48);
 const prefix='#sidepart-equipped',wait=()=>page.waitForFunction(prefix=>document.querySelector(prefix+'-review').dataset.ready==='true',prefix);
 for(const [key,value]of Object.entries({skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}))await page.selectOption(prefix+'-'+key,value);await wait();
 const recordings={};for(const clip of ['cook','water','tend','feed']){await page.selectOption(prefix+'-clip',clip);await wait();recordings[clip]=await recordPreviewPlayback(page,{prefix,duration:Number(await page.locator(prefix+'-time').getAttribute('max')),output,stem:'sidepart-equipped-'+clip});}
 await page.locator(prefix+'-review').screenshot({path:output+'/sidepart-equipped-scenes.png'});
 for(const type of ['boards','timelines'])for(const clip of ['cook','water','tend','feed']){const data=await page.evaluate(({type,clip})=>window.sidePartEquipmentBoards[type][clip].toDataURL('image/png').split(',')[1],{type,clip});await writeFile(output+'/sidepart-equipped-'+clip+'-'+type+'.png',Buffer.from(data,'base64'));}
 assert.deepEqual(errors,[]);const files=['scripts/verify-sidepart-equipment.mjs','scripts/record-preview-playback.mjs','web/artwork/character-equipped-model.js','web/artwork/character-sidepart-review.js','web/artwork/character-body-lab.js','web/character-equipment.js','web/art/characters/prototype-v1/hair-sidepart-all-v1-registration.json','web/pkg/solar_friends_bg.wasm'],sourceHashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));await writeFile(output+'/report.json',JSON.stringify({result:'PASS',scope:'Draft side-part equipment composition; no production artwork approval',sourceHashes,recordings,...result},null,2)+'\n');console.log('PASS: 48 side-part equipped palette/pose checks, exact hand ownership, unchanged feeding recovery, shared pending work, bounded cache, strict private recipes and four recorded activity previews.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
