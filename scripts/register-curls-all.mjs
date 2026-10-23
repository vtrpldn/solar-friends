// Consolidate the individually reviewed pose registrations without fitting or
// changing source pixels, bounds, occlusion masks or activity underlays.
import {readFile,writeFile} from 'node:fs/promises';
const root='web/art/characters/prototype-v1/',poses={base:{},idle:{},activities:{}};let body;
for(const clip of ['breathe','walk','work','sit','look','stretch','wave','relax','cook','water','tend','feed']){
 const registration=JSON.parse(await readFile(root+`hair-${clip}-v1-registration.json`,'utf8'));
 body??=registration.body;if(JSON.stringify(body)!==JSON.stringify(registration.body))throw Error('Hair/body bindings disagree.');
 for(const [index,pose]of Object.entries(registration.poses)){poses[registration.sheet][index]={...pose,schema:1,sheet:registration.sheet,index:Number(index),partSha256:pose.sha256};delete poses[registration.sheet][index].sha256;}
}
for(const sheet of Object.values(poses))if(Object.keys(sheet).length!==16)throw Error('Provide all sixteen authored poses per sheet.');
await writeFile(root+'hair-curls-all-v1-registration.json',JSON.stringify({schema:2,sheets:['base','idle','activities'],body,poses},null,2)+'\n');
console.log('Consolidated 48 source-bound short-curl poses.');
