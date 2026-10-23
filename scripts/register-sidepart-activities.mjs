// Bind painted activity caps explicitly to the original body coordinates.
// Reuse is authored per pose; no runtime fallback or independent fitting.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='web/art/characters/prototype-v1/';
const read=async file=>JSON.parse(await readFile(root+file,'utf8'));
const prior=await read('hair-sidepart-base-idle-v1-registration.json'),activities={};
const indices=[0,1,5,6,7,8,9,10,12,13,14,15];
const files=Object.fromEntries(indices.map(index=>[index,`hair-sidepart-activities-${index}-candidate-v1.png`]));
const mapping={0:0,1:1,2:0,3:0,4:0,5:5,6:6,7:7,8:8,9:9,10:10,11:10,12:12,13:13,14:14,15:15};
for(const clip of ['cook','water','tend','feed']){
 const owner=await read(`hair-${clip}-v1-registration.json`);
 if(JSON.stringify(owner.body)!==JSON.stringify(prior.body))throw Error('The activity and base body bindings disagree.');
 for(const [key,original] of Object.entries(owner.poses)){
  const index=Number(key),file=files[mapping[index]];
  if(!file)throw Error('Choose an explicit painted activity cap.');
  activities[index]={file,schema:1,sheet:'activities',index,size:1254,bounds:original.bounds,partSha256:createHash('sha256').update(await readFile(root+file)).digest('hex'),...(original.foreground?{foreground:original.foreground}:{})};
 }
}
if(Object.keys(activities).length!==16)throw Error('Provide all sixteen activity bindings.');
await writeFile(root+'hair-sidepart-all-v1-registration.json',JSON.stringify({...prior,status:'Initial playable part set; final cadence and complete character-creator release gates remain under review',sheets:[...prior.sheets,'activities'],clips:[...prior.clips,'cook','water','tend','feed'],poses:{...prior.poses,activities}},null,2)+'\n');
console.log('Registered all 48 explicit side-part poses; visual and equipment review still required.');
