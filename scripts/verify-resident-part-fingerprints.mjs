import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
// Reference capture always executes this known pre-optimization revision;
// it cannot bless the current compositor by rewriting its expected hashes.
const capture=process.argv.includes('--capture-reference'),referenceCommit='7aeced031158d6f32cd59156d14a7ce8f2005cec',referenceFiles=new Map();
if(capture)for(const file of ['character-hair.js','resident-parts.js'])referenceFiles.set('/'+file,execFileSync('git',['show',`${referenceCommit}:web/${file}`]));
const server=await serve(0,{handle:async(req,res,path)=>{if(!referenceFiles.has(path))return false;res.writeHead(200,{'Content-Type':'application/javascript'}).end(referenceFiles.get(path));return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/fingerprint-host`);
 const frames=await page.evaluate(async()=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),library=createResidentPartLibrary(),frames={};
  const hash=async canvas=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',canvas.getContext('2d').getImageData(0,0,256,256).data))].map(n=>n.toString(16).padStart(2,'0')).join('');
  for(const hair of ['short-curls-v1','side-part-v1'])for(const hairColour of ['chestnut','espresso','black','silver']){
   const provider=await library.prepare(residentPartRecipe({hair,hairColour,materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}}));
   for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){const key=`${hair}/${hairColour}/${sheet}/${index}`;frames[key]=await hash(provider.frameForPose(sheet,index));if(sheet==='activities'&&[13,14].includes(index))frames[key+'/return']=await hash(provider.frameForPose(sheet,index,{sequenceIndex:5}));}
  }
  return frames;
 });assert.deepEqual(errors,[]);assert.equal(Object.keys(frames).length,400);
 if(capture){await writeFile('/tmp/solar-resident-part-reference.json',JSON.stringify({referenceCommit,referenceSources:Object.fromEntries([...referenceFiles].map(([path,source])=>[path.slice(1),createHash('sha256').update(source).digest('hex')])),scope:'Copper skin, teal top, sage shorts, graphite shoes; both hairstyles, all four colours, 48 poses and two feeding returns per recipe; SHA-256 of exact 256x256 RGBA.',frames},null,2)+'\n');console.log('Captured 400 pre-optimization RGBA fingerprints from fixed reference commit '+referenceCommit);}
 else{const reference=JSON.parse(await readFile(new URL('../assets/art-direction/character-prototype-v1/prepared-hair-v1/reference-frames.json',import.meta.url),'utf8'));assert.equal(reference.referenceCommit,referenceCommit);assert.deepEqual(frames,reference.frames);console.log('PASS: 400 exact RGBA fingerprints match the frozen pre-optimization renderer at '+referenceCommit);}
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
