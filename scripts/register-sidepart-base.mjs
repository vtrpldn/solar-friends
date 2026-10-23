// Bind selected review artwork to the unchanged body and existing hand/stool
// registrations. This does not approve the art or weaken runtime source checks.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root='web/art/characters/prototype-v1/',read=async file=>JSON.parse(await readFile(root+file,'utf8')),breathe=await read('hair-sidepart-breathe-v1-registration.json'),walk=await read('hair-walk-v1-registration.json'),work=await read('hair-work-v1-registration.json'),sit=await read('hair-sit-v1-registration.json'),poses={};
for(let index=0;index<16;index++){
 const owner=index<4?walk:index<8?work:index<12?breathe:sit,original=owner.poses[index],version=({1:2,7:3,12:2,13:2,14:2,15:2})[index]??1,file=`hair-sidepart-base-${index}-candidate-v${version}.png`,bytes=await readFile(root+file);
 if(JSON.stringify(owner.body)!==JSON.stringify(breathe.body))throw Error('The source body bindings disagree.');
 poses[index]={file,schema:1,sheet:'base',index,size:1254,bounds:original.bounds,partSha256:createHash('sha256').update(bytes).digest('hex'),...(original.foreground?{foreground:original.foreground}:{}),...(original.activity?{activity:original.activity}:{})};
}
await writeFile(root+'hair-sidepart-base-v1-registration.json',JSON.stringify({schema:1,status:'Partial base-animation review only; not a playable hairstyle',sheet:'base',clips:['breathe','walk','work','sit','sleep'],body:breathe.body,poses},null,2)+'\n');
console.log('Registered 16 selected hair sources; visual and runtime validation still required.');
