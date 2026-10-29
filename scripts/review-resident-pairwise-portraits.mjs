import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import init,{Game} from '../web/pkg/solar_friends.js';
import {serve} from './serve.mjs';
import {residentPairwiseCases} from './resident-pairwise-cases.mjs';
const out=process.argv[2]??'artifacts/resident-pairwise-portraits';await mkdir(out,{recursive:true});const sha=b=>createHash('sha256').update(b).digest('hex'),inputs={};
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});const game=new Game();let coverage,classic;try{const c=JSON.parse(game.scenario_catalog());coverage=residentPairwiseCases(c.resident_parts);classic=c.resident_appearances.map(p=>({preset:p.key,version:p.version}));}finally{game.free();}
const cases=[...coverage.cases.map(c=>c.recipe),...classic];for(const p of ['scripts/resident-pairwise-cases.mjs','scripts/review-resident-pairwise-portraits.mjs','web/pkg/solar_friends_bg.wasm'])inputs[p]=sha(await readFile(p));
const server=await serve(0,{async handle(_req,res,path){if(path==='/portrait-review'){res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Public resident portrait review</title>');return true;}if(/\.(js|png|json|wasm)$/.test(path))inputs['web'+path]=sha(await readFile('web'+path));return false;}});let browser;
const report={completed:false,coverage,appearances:cases,inputs,cases:[],scope:'Direct shared portrait painter at actual creator 64x72 and library 64x76 sizes, plus identical prepared standing-world poses; all custom pairwise recipes and original looks. Day/night still boards only, no modal interaction, animation, world/biome, rain or performance acceptance.'};
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/portrait-review`);
 await page.evaluate(async()=>{const {createResidentAppearanceLibrary}=await import('/resident-appearance-library.js'),{drawResidentAnimation}=await import('/resident-animation.js'),{paintResidentPortrait}=await import('/resident-portrait.js'),{unlitFilter}=await import('/power.js'),canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};window.portraitReview={library:createResidentAppearanceLibrary(),draw:drawResidentAnimation,paint:paintResidentPortrait,filter:unlitFilter,canvas,scratch:canvas(256,256),board:null};});
 for(const [index,appearance]of cases.entries()){
  const result=await page.evaluate(async({index,appearance,last})=>{const s=window.portraitReview,row=Math.floor(index%21/3),column=index%3;if(index%21===0){s.board=s.canvas(1152,1400);const x=s.board.getContext('2d');x.fillStyle='#e0e7ce';x.fillRect(0,0,1152,1400);}s.library.setActive([appearance]);const provider=await s.library.prepare(appearance),frame=s.library.portraitFrame(appearance);if(frame!==provider.frameForPose('base',8))throw Error('Portrait is not the same prepared standing frame as the world');
   const ctx=s.board.getContext('2d'),x=column*384,y=row*200;ctx.fillStyle='#283e32';ctx.font='12px sans-serif';ctx.fillText(`${index+1}: ${appearance.body??appearance.preset} ${appearance.assetVersion??'classic'}`,x+4,y+14);ctx.font='10px sans-serif';ctx.fillText('Creator 2×       Library / day-world       Night',x+4,y+27);const checks=[];
   for(const night of [0,1])for(const height of [72,76]){
    const portrait=s.canvas(64,height);s.paint(portrait,appearance,s.library,{filter:s.filter(night)});const rgba=portrait.getContext('2d').getImageData(0,0,64,height).data,opaque=rgba.filter((v,i)=>i%4===3&&v>0).length;if(!opaque)throw Error('Empty public portrait');
    if(!night&&height===72)ctx.drawImage(portrait,x+8,y+36,128,144);if(!night&&height===76)ctx.drawImage(portrait,x+156,y+36);if(night&&height===76)ctx.drawImage(portrait,x+280,y+36);
    checks.push({night,height,opaquePixels:opaque});portrait.width=portrait.height=0;
   }
   for(const night of [0,1]){ctx.save();ctx.filter=s.filter(night);s.draw(ctx,s.scratch,provider,{layers:[{sheet:'base',row:2,frame:0,weight:1}],facing:1,breath:1},x+(night?310:190),y+190,80);ctx.restore();}
   const result={samePreparedFrame:true,checks,framing:s.library.portraitFraming(appearance)};if(index%21===20||last){result.board=s.board.toDataURL().split(',')[1];s.board.width=s.board.height=0;s.board=null;}return result;
  },{index,appearance,last:index===cases.length-1});
  if(result.board){await writeFile(`${out}/portraits-${Math.floor(index/21)+1}.png`,Buffer.from(result.board,'base64'));delete result.board;}assert.equal(result.checks.length,4);report.cases.push({index,...result});console.log(`Prepared portraits ${index+1}/${cases.length}`);
 }
 await page.evaluate(async()=>{await window.portraitReview.library.dispose();delete window.portraitReview;});assert.deepEqual(errors,[]);for(const [p,h]of Object.entries(inputs))assert.equal(sha(await readFile(p)),h,p);report.completed=true;await writeFile(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(`PASS ${cases.length} matching world/portrait appearances, ${cases.length*4} size/lighting renders.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
