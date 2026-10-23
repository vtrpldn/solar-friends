import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-hair-colours',server=await serve();let browser;
try{
 await mkdir(output,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/hair-colour-review-host`);
 const result=await page.evaluate(async()=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');const library=createResidentPartLibrary(),read=c=>c.getContext('2d').getImageData(0,0,256,256).data;
  const board=document.createElement('canvas');board.width=1024;board.height=800;const ctx=board.getContext('2d');ctx.fillStyle='#dfe7c5';ctx.fillRect(0,0,1024,800);ctx.fillStyle='#263f32';ctx.font='18px sans-serif';document.body.replaceChildren(board);document.body.style.margin='0';
  let checked=0,returns=0,changed=0;
  for(const [h,hair] of ['short-curls-v1','side-part-v1'].entries()){
   const baseline=await library.prepare(residentPartRecipe({hair}));
   for(const [column,hairColour] of ['chestnut','espresso','black','silver'].entries()){
    const recipe=residentPartRecipe({hair,hairColour}),provider=await library.prepare(recipe);if(hairColour==='chestnut'&&provider!==baseline)throw Error('Default colour duplicated composition');
    for(const sheet of ['base','idle','activities'])for(let index=0;index<16;index++){
     const compare=options=>{const a=read(baseline.frameForPose(sheet,index,options)),b=read(provider.frameForPose(sheet,index,options));let differences=0;for(let p=0;p<a.length;p+=4){if(a[p+3]!==b[p+3])throw Error('Hair colour changed silhouette');for(let c=0;c<3;c++)if(a[p+c]!==b[p+c]){differences++;if(Math.floor(p/4/256)>155)throw Error('Hair colour changed lower body or equipment');}}if(hairColour!=='chestnut'&&!differences)throw Error('Hair colour had no visible effect');if(differences)changed++;};compare();checked++;if(sheet==='activities'&&[13,14].includes(index)){compare({sequenceIndex:5});returns++;}
    }
    ctx.fillStyle='#263f32';ctx.fillText(`${hair}: ${hairColour}`,column*256+8,h*400+25);ctx.drawImage(provider.frameForPose('base',8),column*256,h*400+30);ctx.drawImage(provider.frameForPose('activities',4),column*256,h*400+240,128,128);ctx.drawImage(provider.frameForPose('activities',12),column*256+128,h*400+240,128,128);
   }
  }
  return {checked,returns,changed,board:board.toDataURL('image/png')};
 });await writeFile(`${output}/hair-colours.png`,Buffer.from(result.board.split(',')[1],'base64'));delete result.board;assert.equal(result.checked,384);assert.equal(result.returns,16);assert.deepEqual(errors,[]);await writeFile(`${output}/report.json`,JSON.stringify(result,null,2)+'\n');console.log('PASS: all 384 colour/style poses and 16 feeding returns preserve silhouette and lower body/equipment; nondefault colours visibly differ.',result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
