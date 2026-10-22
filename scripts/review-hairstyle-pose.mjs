import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const file=process.argv[2],sheet=process.argv[3]??'base',index=Number(process.argv[4]??8);
if(!/^hair-sidepart-(base|idle|activities)-([0-9]|1[0-5])-candidate-v[1-9]\.png$/.test(file??'')||!['base','idle','activities'].includes(sheet)||!Number.isInteger(index)||index<0||index>15||!file.startsWith(`hair-sidepart-${sheet}-${index}-`))throw Error('Choose a bundled side-part pose candidate and matching sheet/index.');
const root='assets/art-direction/character-prototype-v1/',sha256=createHash('sha256').update(await readFile('web/art/characters/prototype-v1/'+file)).digest('hex'),server=await serve();let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/artwork/character-body-lab.html`);await page.waitForFunction(()=>document.body.dataset.bodyReviewReady==='true');
 const result=await page.evaluate(async({file,sheet,index,sha256})=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{auditCharacterPartRegion}=await import('/character-parts.js'),{registeredHairFrame}=await import('/artwork/character-single-hair.js');
  const source=await loadCharacterImageSource('/art/characters/prototype-v1/'+file),{frames,binding}=window.bodyAttachmentReview,rig=await(await fetch('/art/characters/prototype-v1/body-attachments-draft.json')).json(),[hx,hy]=rig.poses[sheet][index].head.position,bounds=[(hx-34)*1254/256,(hy-39)*1254/256,68*1254/256,60*1254/256],canvas=document.createElement('canvas');canvas.width=canvas.height=1254;canvas.getContext('2d').drawImage(source.image,0,0);const audit=auditCharacterPartRegion(canvas.getContext('2d').getImageData(0,0,1254,1254),bounds),registration={schema:1,sheet,index,size:1254,bounds,partSha256:sha256,body:binding};
  if(source.image.naturalWidth!==1254||source.image.naturalHeight!==1254||source.sourceHash!==sha256)throw Error('Candidate size or source changed');
  const frame=await registeredHairFrame({body:frames[sheet][index],binding,registration,image:source.image,sourceHash:sha256}),board=document.createElement('canvas');board.width=768;board.height=420;const ctx=board.getContext('2d');ctx.fillStyle='#eadfbd';ctx.fillRect(0,0,768,420);ctx.drawImage(frames[sheet][index],0,0,384,384);ctx.drawImage(frame,384,0,384,384);ctx.fillStyle='#304435';ctx.font='16px sans-serif';ctx.fillText('Unchanged body',12,408);ctx.fillText('Registered whole-frame hair overlay',396,408);
  return {registration,audit,board:board.toDataURL('image/png').split(',')[1]};
 },{file,sheet,index,sha256});
 const stem=file.replace('.png','');await writeFile(root+stem+'-composition.png',Buffer.from(result.board,'base64'));delete result.board;await writeFile(root+stem+'-report.json',JSON.stringify({scope:'Pose registration and bounds only; style, scalp coverage and animation require visual review',...result},null,2)+'\n');console.log(JSON.stringify({file,sha256,audit:result.audit}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
