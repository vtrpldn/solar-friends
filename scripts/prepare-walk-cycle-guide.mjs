// New-pose geometry only; existing painted sprites are used as references.
import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const revision=process.argv[2]??'v2';
if(!['v2','v3'].includes(revision))throw Error('Unknown authored gait geometry revision');
const root='assets/art-direction/character-prototype-v1/body-walk-cycle-'+revision;
// Freeze geometry before painting: changing guides would invalidate provenance.
try { await access(root+'/guide-intent.json'); throw new Error('Guide already frozen; create a new versioned collection instead.'); } catch(error) { if(error.code!=='ENOENT')throw error; }
await mkdir(root,{recursive:true});
const poses=[
 {key:'contact-near',head:[149,55],nearArm:[[119,90],[103,122],[92,157]],farArm:[[165,91],[181,115],[195,133]],nearLeg:[[132,155],[157,195],[180,224]],farLeg:[[151,153],[122,196],[101,223]],nearBoot:[[176,226],[188,225],[200,237],[178,242],[174,236]],farBoot:[[96,222],[106,225],[114,241],[105,243],[91,232]],support:'near heel and far toe'},
 {key:'passing-near-support',head:[149,51],nearArm:[[119,86],[110,122],[115,155]],farArm:[[165,87],[175,115],[179,147]],nearLeg:[[132,151],[139,194],[140,226]],farLeg:[[151,149],[168,188],[151,212]],nearBoot:[[134,225],[145,225],[157,237],[154,243],[131,243]],farBoot:[[147,210],[157,213],[166,222],[161,228],[143,222]],support:'near foot; far knee passes forward with raised boot'},
 {key:'contact-far',head:[149,55],nearArm:[[119,90],[132,119],[156,149]],farArm:[[165,91],[148,122],[124,154]],nearLeg:[[132,155],[111,196],[96,224]],farLeg:[[151,153],[168,194],[184,225]],nearBoot:[[91,223],[102,226],[113,241],[104,243],[87,232]],farBoot:[[179,225],[190,226],[203,237],[182,242],[176,236]],support:'far heel and near toe'},
 {key:'passing-far-support',head:[149,51],nearArm:[[119,86],[129,121],[143,153]],farArm:[[165,87],[162,120],[151,153]],nearLeg:[[132,151],[157,188],[144,212]],farLeg:[[151,149],[145,194],[141,226]],nearBoot:[[140,210],[150,212],[162,222],[157,229],[136,222]],farBoot:[[135,225],[146,225],[158,238],[155,243],[132,243]],support:'far foot; near knee passes forward with raised boot'},
];
// Revision 3 lowers only the swing legs and reduces vertical rise.
// Anatomy is authored here, before generating any new paint.
if(revision==='v3'){
 const near=poses[1],far=poses[3];
 for(const p of [near,far]){p.head[1]=53;for(const arm of [p.nearArm,p.farArm])for(const point of arm)point[1]+=2;for(const leg of [p.nearLeg,p.farLeg])leg[0][1]+=2;}
 near.farLeg=[[151,151],[157,202],[146,221]];
 near.farBoot=[[142,219],[152,221],[163,230],[158,236],[138,229]];
 far.nearLeg=[[132,153],[145,202],[137,221]];
 far.nearBoot=[[133,219],[143,221],[155,230],[150,236],[129,229]];
}
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/walk-cycle-guide`);
 const images=await page.evaluate(async poses=>{
  const {loadCharacterImageSource}=await import('/character-image-source.js'),{preparedFrames}=await import('/sprite-frames.js');
  const source=await loadCharacterImageSource('/art/characters/prototype-v1/body-neutral-base.png'),frames=preparedFrames(source.image,{referenceRow:2});
  const make=()=>{const c=document.createElement('canvas');c.width=c.height=1254;return c;},geometry=make(),skeleton=make(),standing=make(),old=make();standing.getContext('2d').drawImage(frames[8],0,0,1254,1254);
  const polygon=(ctx,points,color)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fillStyle=color;ctx.fill();};
  const limb=(ctx,points,width,color)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap=ctx.lineJoin='round';ctx.stroke();};
  for(const [i,p]of poses.entries()){
   const x=i%2*627,y=Math.floor(i/2)*627;old.getContext('2d').drawImage(frames[i],x,y,627,627);
   for(const canvas of [geometry,skeleton]){const ctx=canvas.getContext('2d');ctx.save();ctx.translate(x,y);ctx.scale(627/256,627/256);const lift=p.head[1]-55;
    limb(ctx,p.farLeg,19,'#528fac');polygon(ctx,p.farBoot,'#345f79');limb(ctx,p.farArm,16,'#528fac');ctx.beginPath();ctx.arc(...p.farArm[2],8,0,Math.PI*2);ctx.fillStyle='#528fac';ctx.fill();
    polygon(ctx,[[121,80+lift],[165,82+lift],[163,145+lift],[115,145+lift]],'#38a777');polygon(ctx,[[115,141+lift],[163,141+lift],[164,165+lift],[115,165+lift]],'#b5ad76');
    limb(ctx,[p.farLeg[0],p.farLeg[1].map((n,j)=>(n+p.farLeg[0][j])/2)],22,'#b5ad76');
    limb(ctx,p.nearLeg,22,'#d66b45');limb(ctx,[p.nearLeg[0],p.nearLeg[1].map((n,j)=>(n+p.nearLeg[0][j])/2)],25,'#d6bf79');polygon(ctx,p.nearBoot,'#78513d');
    limb(ctx,p.nearArm,19,'#d66b45');ctx.beginPath();ctx.arc(...p.nearArm[2],10,0,Math.PI*2);ctx.fillStyle='#d66b45';ctx.fill();
    ctx.fillStyle='#b8aaa0';ctx.fillRect(135,70+lift,20,20);ctx.beginPath();ctx.ellipse(...p.head,27,33,0,0,Math.PI*2);ctx.fill();
    if(canvas===skeleton){for(const [points,color]of [[p.nearArm,'#70280f'],[p.nearLeg,'#70280f'],[p.farArm,'#16394d'],[p.farLeg,'#16394d']]){limb(ctx,points,2,color);for(const point of points){ctx.beginPath();ctx.arc(...point,3,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();}}ctx.strokeStyle='#343f2d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(65,243);ctx.lineTo(215,243);ctx.stroke();}
    ctx.restore();
   }
  }
  return Object.fromEntries(Object.entries({geometry,skeleton,standing,old}).map(([key,canvas])=>[key,canvas.toDataURL('image/png').split(',')[1]]));
 },poses);
 for(const [key,data]of Object.entries(images))await writeFile(root+'/'+key+'.png',Buffer.from(data,'base64'));
 const hashes={};for(const file of ['geometry.png','skeleton.png','standing.png','old.png'])hashes[file]=createHash('sha256').update(await readFile(root+'/'+file)).digest('hex');
 await writeFile(root+'/guide-intent.json',JSON.stringify({status:'Pose geometry authored before generation; not finished sprite art.',sourceSize:[1254,1254],layout:[2,2],nativeCellSize:256,groundAnchor:243,nearLimbGuideColour:'terracotta',farLimbGuideColour:'blue',poses,hashes,sourceBodySha256:createHash('sha256').update(await readFile('web/art/characters/prototype-v1/body-neutral-base.png')).digest('hex')},null,2)+'\n');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
