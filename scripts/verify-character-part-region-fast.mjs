import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditCharacterPartRegion} from '../web/character-parts.js';
// The independent reference is the exact shipped pre-optimization function.
const source=execFileSync('git',['show','463b723:web/character-parts.js'],{encoding:'utf8'});
const text=source.slice(source.indexOf('export function auditCharacterPartRegion'),source.indexOf('\nexport function characterBodyLayout'));
const reference=new Function('CHARACTER_PART_MINIMUM_COVERAGE',text.replace('export function','return function'))(.98);
let seed=193871,checked=0,channels=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let test=0;test<1800;test++){
 const width=1+Math.floor(random()*257),height=1+Math.floor(random()*129),raw=new Uint8ClampedArray(width*height*4+12),data=raw.subarray(8,8+width*height*4);
 for(let i=0;i<data.length;i+=4){data[i]=random()*256;data[i+1]=random()*256;data[i+2]=random()*256;data[i+3]=[0,1,31,32,33,128,254,255][Math.floor(random()*8)];}
 if(test%5===0)for(let i=3;i<data.length;i+=4)data[i]=0;
 if(test%5===1)for(let i=3;i<data.length;i+=4)data[i]=255;
 const left=random()*width,top=random()*height,region=[left,top,(width-left)*(random()*.9+.1),(height-top)*(random()*.9+.1)],pixels={width,height,data};
 const before=data.slice();assert.deepEqual(auditCharacterPartRegion(pixels,region),reference(pixels,region));assert.deepEqual(data,before);checked++;channels+=data.length;
}
for(const pixels of [{width:1,height:1,data:[0,0,0,NaN]},{width:2,height:2,data:[0,0,0,32,0,0,0,31,0,0,0,255,0,0,0,0]}])for(const region of [[0,0,pixels.width,pixels.height],[.5,.5,.5,.5]]){assert.deepEqual(auditCharacterPartRegion(pixels,region),reference(pixels,region));checked++;}
for(const bad of [{width:0,height:1,data:[]},{width:1.5,height:2,data:[]},{width:1,height:1,data:[]}])assert.throws(()=>auditCharacterPartRegion(bad,[0,0,1,1]));
for(const region of [[],[0,0,0,1],[-1,0,1,1],[0,0,2,1],[NaN,0,1,1],[0,0,Infinity,1]])assert.throws(()=>auditCharacterPartRegion({width:1,height:1,data:new Uint8ClampedArray(4)},region));
const result={checked,channels,seed:193871,scope:'Exact differential region audit, threshold boundaries, full/empty alpha, fractional regions, offset typed-array views, borrowed input and invalid arguments. Not full rendering or performance acceptance.',baseline:{commit:'463b723',sha256:createHash('sha256').update(source).digest('hex')},currentSha256:createHash('sha256').update(await readFile('web/character-parts.js')).digest('hex')};
if(process.argv[2]){await mkdir(process.argv[2],{recursive:true});await writeFile(process.argv[2]+'/report.json',JSON.stringify(result,null,2)+'\n');}console.log(JSON.stringify(result));
