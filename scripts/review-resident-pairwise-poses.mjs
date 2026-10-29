import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import init,{Game} from '../web/pkg/solar_friends.js';
import {serve} from './serve.mjs';
import {residentPairwiseCases} from './resident-pairwise-cases.mjs';
const out=process.argv[2]??'artifacts/resident-pairwise-poses';await mkdir(out,{recursive:true});const sha=b=>createHash('sha256').update(b).digest('hex');
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game();let coverage;try{coverage=residentPairwiseCases(JSON.parse(game.scenario_catalog()).resident_parts);}finally{game.free();}
const inputs={};for(const p of ['scripts/resident-pairwise-cases.mjs','scripts/review-resident-pairwise-poses.mjs','web/pkg/solar_friends_bg.wasm'])inputs[p]=sha(await readFile(p));
const server=await serve(0,{async handle(_req,res,path){if(path==='/pairwise-review'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Resident pairwise pose review</title>');return true;}if(/\.(js|png|json|wasm)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;}});let browser;
const report={completed:false,coverage,inputs,cases:[],scope:'All native atlas poses and two feeding return phases for a deterministic pairwise set of current selectable public outfits. Raster existence and pair coverage do not establish art quality; retained boards require separate visual review. No world, biome, activity transitions or performance acceptance.'};
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/pairwise-review`);
 await page.evaluate(async()=>{const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{drawResidentAnimation}=await import('/resident-animation.js'),{unlitFilter}=await import('/power.js');window.poseReview={library:createResidentAppearanceLibrary(),draw:drawResidentAnimation,filter:unlitFilter,scratch:document.createElement('canvas'),boards:[]};window.poseReview.scratch.width=window.poseReview.scratch.height=256;});
 for(const [index,entry]of coverage.cases.entries()){
  const result=await page.evaluate(async({index,entry,last})=>{const s=window.poseReview,row=index%7;if(row===0){s.boards=Array.from({length:4},(_,i)=>{const c=document.createElement('canvas');c.width=i===3?640:1280;c.height=1120;const x=c.getContext('2d');x.fillStyle='#dfe7cc';x.fillRect(0,0,c.width,c.height);return c;});}
   s.library.setActive([entry.recipe]);const p=await s.library.prepare(entry.recipe);let checked=0;
   const label=`${index+1}: ${entry.values.outfit} / ${entry.values.hair} ${entry.values.hairColour} / hat ${entry.values.hat} beard ${entry.values.facialHair} / ${Object.values(entry.recipe.materials).join(',')}`;
   for(let sheetIndex=0;sheetIndex<3;sheetIndex++){
    const sheet=['base','idle','activities'][sheetIndex],ctx=s.boards[sheetIndex].getContext('2d');ctx.font='11px sans-serif';ctx.fillStyle='#283e32';ctx.fillText(label,4,row*160+14);
    for(let n=0;n<16;n++){
     const frame=p.frameForPose(sheet,n);if(!frame||!frame.getContext('2d').getImageData(0,0,frame.width,frame.height).data.some((v,i)=>i%4===3&&v))throw Error('Empty public pose '+index+' '+sheet+' '+n);
     s.draw(ctx,s.scratch,p,{layers:[{sheet,row:Math.floor(n/4),frame:n%4,weight:1}],facing:1,breath:1},40+n*80,row*160+125,80);checked++;
    }
   }
   const ctx=s.boards[3].getContext('2d');ctx.font='11px sans-serif';ctx.fillStyle='#283e32';ctx.fillText(label,4,row*160+14);
   for(let n=0;n<4;n++){const pose=13+n%2,night=n>=2;ctx.save();ctx.filter=s.filter(night?1:0);s.draw(ctx,s.scratch,p,{layers:[{sheet:'activities',row:3,frame:pose%4,sequenceIndex:5,weight:1}],facing:night?-1:1,breath:1},80+n*160,row*160+125,80);ctx.restore();checked++;}
   const result={checked,body:entry.recipe.body,assetVersion:entry.recipe.assetVersion};if(row===6||last){result.boards=s.boards.map(c=>c.toDataURL().split(',')[1]);for(const c of s.boards)c.width=c.height=0;s.boards=[];}return result;
  },{index,entry,last:index===coverage.cases.length-1});
  assert.equal(result.checked,52);if(result.boards){for(const [n,b]of result.boards.entries())await writeFile(`${out}/batch-${Math.floor(index/7)+1}-${['base','idle','activities','feeding-return'][n]}.png`,Buffer.from(b,'base64'));delete result.boards;}report.cases.push({index,...result});console.log(`Rendered ${index+1}/${coverage.cases.length}: ${result.body} ${result.assetVersion}`);
 }
 await page.evaluate(async()=>{const s=window.poseReview;await s.library.dispose();s.scratch.width=s.scratch.height=0;delete window.poseReview;});assert.deepEqual(errors,[]);for(const [p,h]of Object.entries(inputs))assert.equal(sha(await readFile(p)),h,p);report.completed=true;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(`PASS ${coverage.cases.length*52} pairwise recipe/pose drawings; ${coverage.feasiblePairs} feasible choice pairs.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
