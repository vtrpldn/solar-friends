// Explicit pose bindings permit shared painted caps; there is no runtime fallback
// or fitting. Every reused source still passes its own pose/occlusion checks.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root='web/art/characters/prototype-v1/',read=async file=>JSON.parse(await readFile(root+file,'utf8')),base=await read('hair-sidepart-base-v1-registration.json'),idle={};
const replacements={
 'hair-curls-single-candidate-v3.png':'hair-sidepart-base-8-candidate-v1.png',
 'hair-curls-idle-5-candidate-v1.png':'hair-sidepart-idle-5-candidate-v2.png',
 'hair-curls-idle-6-candidate-v2.png':'hair-sidepart-idle-6-candidate-v1.png',
 'hair-curls-idle-9-candidate-v4.png':'hair-sidepart-idle-9-candidate-v1.png',
 'hair-curls-idle-12-candidate-v1.png':'hair-sidepart-idle-12-candidate-v1.png',
 'hair-curls-idle-13-candidate-v1.png':'hair-sidepart-idle-13-candidate-v1.png',
};
for(const clip of ['look','stretch','wave','relax']){
 const owner=await read(`hair-${clip}-v1-registration.json`);if(JSON.stringify(owner.body)!==JSON.stringify(base.body))throw Error('The source body bindings disagree.');
 for(const [key,original]of Object.entries(owner.poses)){
  const index=Number(key),file=replacements[original.file];if(!file)throw Error('Choose an explicit side-part source for this pose.');
  idle[index]={file,schema:1,sheet:'idle',index,size:1254,bounds:original.bounds,partSha256:createHash('sha256').update(await readFile(root+file)).digest('hex'),...(original.foreground?{foreground:original.foreground}:{})};
 }
}
await writeFile(root+'hair-sidepart-base-idle-v1-registration.json',JSON.stringify({schema:2,status:'Partial base/idle-animation review only; not a playable hairstyle',sheets:['base','idle'],clips:[...base.clips,'look','stretch','wave','relax'],body:base.body,poses:{base:base.poses,idle}},null,2)+'\n');
console.log('Registered 32 explicit side-part pose bindings; visual and runtime validation still required.');
