// Geometry only. This never paints, edits or registers finished sprite pixels.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const path='assets/art-direction/character-prototype-v1/body-walk-cycle-v3/guide-intent.json';
const bytes=await readFile(path),intent=JSON.parse(bytes);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const png=await page.evaluate(poses=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1254;
  const ctx=canvas.getContext('2d');
  for(const [i,p]of poses.entries()){
   ctx.save();ctx.translate(i%2*627,Math.floor(i/2)*627);ctx.translate(627*.1,627*.1);ctx.scale(627*.8/256,627*.8/256);
   const limb=(points,color,width)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin=ctx.lineCap='round';ctx.stroke();};
   const polygon=(points,color)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();ctx.fillStyle=color;ctx.fill();};
   limb(p.farLeg,'#518fa8',25);polygon(p.farBoot,'#365c70');limb(p.farArm,'#518fa8',20);
   ctx.fillStyle='#36a17b';ctx.beginPath();ctx.ellipse(142,125,37,42,0,0,Math.PI*2);ctx.fill();
   polygon([[108,145],[169,145],[172,176],[111,176]],'#b5ac7b');
   limb(p.nearLeg,'#d16a40',26);polygon(p.nearBoot,'#71503d');limb(p.nearArm,'#d16a40',22);
   ctx.fillStyle='#b8aaa0';ctx.beginPath();ctx.ellipse(p.head[0],p.head[1],27,34,0,0,Math.PI*2);ctx.fill();
   ctx.restore();
  }
  return canvas.toDataURL('image/png').split(',')[1];
 },intent.poses);
 const output=Buffer.from(png,'base64');await writeFile(root+'/walk-geometry-v2.png',output);
 await writeFile(root+'/walk-geometry-v2.json',JSON.stringify({status:'Geometry only, not painted character art',source:{path,sha256:createHash('sha256').update(bytes).digest('hex')},output:{path:root+'/walk-geometry-v2.png',sha256:createHash('sha256').update(output).digest('hex')},layout:[2,2],size:[1254,1254],cell:627,uniformGuideScale:.8,marginFraction:.1,nearLimb:'terracotta',farLimb:'blue',scope:'Shared four-phase contact/passing skeleton with a broader torso and limbs. Each guide figure is uniformly reduced within its cell to establish transparent margins; no finished sprite is transformed.'},null,2)+'\n');
}finally{await browser.close();}
