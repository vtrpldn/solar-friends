import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async()=>{
  const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{residentLookKeys,validateResidentAppearance}=await import('/resident-look.js'),{preparedFrames}=await import('/sprite-frames.js'),{drawResidentAnimation,sampleResidentClip,residentClips}=await import('/resident-animation.js'),{paintResidentPortrait,paintPreparedResidentPortrait}=await import('/resident-portrait.js'),{unlitFilter}=await import('/power.js'),{RelationshipsEditor}=await import('/editor/relationships.js'),{Game}=await import('/pkg/solar_friends.js');
  const game=new Game(),catalog=JSON.parse(game.scenario_catalog());game.free();if(JSON.stringify(catalog.resident_appearances.map(look=>({preset:look.key,version:look.version})))!==JSON.stringify(residentLookKeys.map(preset=>({preset,version:1}))))throw Error('Native and renderer appearance catalogs disagree');
  const loads=[],decodes=[],sources=new Map(),makeImage=(key,sheet)=>{const image=new Image();image.src='/art/animations/'+key+(sheet==='base'?'':'-'+sheet)+'.png';return image;};
  const library=createResidentAppearanceLibrary({loadImage(key,sheet){loads.push(key+':'+sheet);const image=makeImage(key,sheet),decode=image.decode.bind(image);image.decode=()=>{decodes.push(key+':'+sheet);return decode();};sources.set(key+':'+sheet,image);return image;}});
  const canvas=(w=256,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;},equal=(a,b)=>a.every((v,i)=>v===b[i]),pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;let frames=0,renders=0,portraits=0;
  for(const key of residentLookKeys){
   const appearance={preset:key,version:1},initial=library.provider(appearance);if(loads.some(s=>s.startsWith(key+':')))throw Error('Provider eagerly requested artwork');
   const [a,b]=await Promise.all([library.prepare(appearance),library.prepare({...appearance})]);if(a!==b||a!==initial)throw Error('Appearance provider identity changed');
   const sheets=Object.fromEntries(['base','idle','activities'].map(sheet=>[sheet,sources.get(key+':'+sheet)]));
   for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){if(a.frameForPose(sheet,index)!==preparedFrames(sheets[sheet],{referenceRow:sheet==='base'?2:0})[index])throw Error('Appearance changed the exact original frame selection');frames++;}
   if(library.portraitFrame(appearance)!==a.frameForPose('base',8))throw Error('Portrait and world use different artwork');
   for(const clip of Object.keys(residentClips))for(const facing of [-1,1])for(const night of [0,1])for(const seconds of [0,.121]){
    const actual=canvas(),expected=canvas(),surface=canvas(),legacySurface=canvas(),motion={layers:sampleResidentClip(clip,seconds),facing,breath:1};
    for(const [target,working,provider]of [[actual,surface,a],[expected,legacySurface,sheets]]){const ctx=target.getContext('2d');ctx.filter=unlitFilter(night);drawResidentAnimation(ctx,working,provider,motion,128,244,256);}
    if(!equal(pixels(actual),pixels(expected)))throw Error('Appearance provider changed animation, facing or lighting');renders++;
   }
   for(const night of [0,1]){
    const actual=canvas(96,108),legacy=canvas(96,108),expected=canvas(96,108);paintResidentPortrait(actual,appearance,library,{filter:unlitFilter(night)});paintResidentPortrait(legacy,appearance,residentLookKeys.map(name=>sources.get(name+':base')),{filter:unlitFilter(night)});paintPreparedResidentPortrait(expected,a.frameForPose('base',8),{filter:unlitFilter(night)});
    if(!equal(pixels(actual),pixels(expected))||!equal(pixels(actual),pixels(legacy)))throw Error('Shared portrait changed crop or paint');portraits++;
   }
   await library.prepare(appearance);
  }
  if(loads.length!==15||decodes.length!==15||new Set(loads).size!==15)throw Error('Bundled sheet work was duplicated');
  const before=loads.length,denied=[];
  for(const bad of [null,[],{}, {preset:'bento'}, {preset:'bento',version:2},{preset:'missing',version:1},{preset:'bento',version:1,hair:'side-part-v1'},{reviewSchema:1,body:'neutral-v1',hair:'side-part-v1',materials:{}}]){let rejected=false;try{validateResidentAppearance(bad);}catch{rejected=true;}if(!rejected)throw Error('Unsupported appearance validation accepted');for(const operation of [()=>library.provider(bad),()=>library.prepare(bad),()=>library.portraitFrame(bad)]){let refused=false;try{await operation();}catch{refused=true;}if(!refused)throw Error('Unsupported appearance silently substituted');denied.push(true);}}
  const provider=library.provider({preset:'iara',version:1});for(const [sheet,index]of [['unknown',0],['base',-1],['idle',16],['activities',.5]]){let refused=false;try{provider.frameForPose(sheet,index);}catch{refused=true;}if(!refused)throw Error('Unsupported pose accepted');}
  for(const requested of [[],['missing'],null]){let refused=false;try{await library.prepare({preset:'iara',version:1},{sheets:requested});}catch{refused=true;}if(!refused)throw Error('Unsupported preparation accepted');}
  if(loads.length!==before)throw Error('Invalid appearance requested external artwork');
  let attempts=0;const retry=createResidentAppearanceLibrary({loadImage(key,sheet){const image=makeImage(key,sheet);attempts++;if(attempts===1)image.decode=()=>Promise.reject(Error('Synthetic decode failure'));return image;}}),recipe={preset:'nina',version:1};let rejected=false;try{await retry.prepare(recipe,{sheets:['idle']});}catch{rejected=true;}if(!rejected)throw Error('Failed load was hidden');const recovered=await retry.prepare(recipe,{sheets:['idle']});if(attempts!==2||!recovered.frameForPose('idle',0))throw Error('Failed artwork could not retry');
  const bases=residentLookKeys.map(key=>sources.get(key+':base')),frozen=createResidentAppearanceLibrary({base:bases});bases[0]=bases[4];if(frozen.portraitFrame({preset:'iara',version:1})!==library.portraitFrame({preset:'iara',version:1}))throw Error('Caller array mutation retargeted an appearance');
  const host=document.createElement('div'),people=[{id:'friend-z',name:'Same name',preset:'iara',preset_version:1,appearance:{preset:'nina',version:1}},{id:'friend-a',name:'Same name',preset:'nina',preset_version:1,appearance:{preset:'bento',version:1}}],definition={start:{residents:people}},original=JSON.stringify(definition),relationships=new RelationshipsEditor(host,{presets:catalog.resident_presets.slice().reverse(),art:{appearances:library},change(){throw Error('Portrait preview mutated the creation');}});relationships.render(definition);
  let relationshipPortraits=0;for(const person of people){const actual=host.querySelector(`[data-bond-resident="${person.id}"]`),expected=canvas(48,54);paintResidentPortrait(expected,person.appearance,library);if(!actual||!equal(pixels(actual),pixels(expected)))throw Error('Relationship portrait followed preset order or person identity');relationshipPortraits++;}if(JSON.stringify(definition)!==original)throw Error('Relationship preview rewrote the creation');
  people[0].appearance.version=999;relationships.render(definition);if(host.querySelectorAll('[aria-label="Resident artwork unavailable"]').length!==1||host.querySelectorAll('canvas').length!==1)throw Error('Relationship preview substituted unsupported artwork');
  return {frames,renders,portraits,loads:loads.length,decodes:decodes.length,denied:denied.length,retryAttempts:attempts,nativeCatalog:catalog.resident_appearances.length,relationshipPortraits,unavailableRelationshipPortraits:1};
 });assert.deepEqual(result,{frames:240,renders:520,portraits:10,loads:15,decodes:15,denied:24,retryAttempts:2,nativeCatalog:5,relationshipPortraits:2,unavailableRelationshipPortraits:1});assert.deepEqual(errors,[]);console.log('PASS: shared resident appearance library: 240 exact original poses, 520 facing/lighting animation comparisons, ten shared portraits, native catalog parity, one load/decode per sheet, strict refusal, retry, input isolation and identity-bound relationship portraits.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
