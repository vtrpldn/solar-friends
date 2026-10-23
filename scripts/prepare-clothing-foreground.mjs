// Author body ownership from native anatomical regions, never garment pixels.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateBodyForegroundMask} from '../web/character-foreground-mask.js';
const [name,version='v1']=process.argv.slice(2);assert(/^[a-z0-9-]+$/.test(name??'')&&/^v[1-9][0-9]?$/.test(version));
const root='assets/art-direction/character-prototype-v1/'+name,intentBytes=await readFile(root+'/registration-intent.json'),intent=JSON.parse(intentBytes),specBytes=await readFile(root+'/foreground-regions-'+version+'.json'),spec=JSON.parse(specBytes);
assert.equal(intent.poses.length,1);assert(Array.isArray(spec.regions)&&spec.regions.length>0&&spec.regions.length<=8);
const owned=new Uint8Array(256*256);
for(const rect of spec.regions){assert(Array.isArray(rect)&&rect.length===4&&rect.every(Number.isSafeInteger));const [x,y,w,h]=rect;assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=256&&y+h<=256);for(let row=y;row<y+h;row++)owned.fill(1,row*256+x,row*256+x+w);}
const runs=[];for(let p=0;p<owned.length;){if(!owned[p]){p++;continue;}const start=p;while(p<owned.length&&owned[p])p++;runs.push([start,p-start]);}
const pose=intent.poses[0],mask={schema:2,body:intent.body,sheet:pose.sheet,index:pose.index,size:256,runs};validateBodyForegroundMask(mask,intent.body,pose.sheet,pose.index);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),encoded=JSON.stringify(mask,null,2)+'\n';
const record={status:'Native body foreground ownership; generated garment paint was not read or modified.',bodyFrameSha256:pose.bodyFrameSha256,registrationIntentSha256:hash(intentBytes),regionSpecSha256:hash(specBytes),maskSha256:hash(encoded),regions:spec.regions,ownedPixels:runs.reduce((sum,run)=>sum+run[1],0)};
for(const [file,data]of [['body-foreground-'+version+'.json',encoded],['foreground-intent-'+version+'.json',JSON.stringify(record,null,2)+'\n']]){const previous=await readFile(root+'/'+file,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(previous!==null)assert.equal(previous,data,'Changed ownership needs a new revision');else await writeFile(root+'/'+file,data,{flag:'wx'});}
console.log(JSON.stringify({sheet:pose.sheet,index:pose.index,ownedPixels:record.ownedPixels,runs:runs.length}));
