// Measured layout/gesture guides only. No finished raster artwork is edited.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 for(const clip of ['look','wave','relax']){
  const png=await page.evaluate(clip=>{
   const c=document.createElement('canvas');c.width=c.height=1254;const x=c.getContext('2d');
   const line=(points,color,width)=>{x.strokeStyle=color;x.lineWidth=width;x.lineCap=x.lineJoin='round';x.beginPath();x.moveTo(...points[0]);for(const p of points.slice(1))x.lineTo(...p);x.stroke();};
   const ellipse=(cx,cy,rx,ry,color)=>{x.fillStyle=color;x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);x.fill();};
   for(let i=0;i<4;i++){
    x.save();x.translate(i%2*627,Math.floor(i/2)*627);
    let near=[[235,250],[200,370],[204,460]],far=[[405,250],[435,350],[430,455]];
    if(clip==='wave'&&i===1)near=[[235,250],[190,315],[205,245]];
    if(clip==='wave'&&i===2)near=[[235,250],[190,270],[205,125]];
    if(clip==='wave'&&i===3)near=[[235,250],[195,330],[245,355]];
    if(clip==='relax'&&(i===1||i===2)){near=[[235,250],[185,330],[250,410]];far=[[405,250],[450,330],[390,410]];}
    line(far,'#518fa8',53);
    ellipse(315,330,90,100,'#36a17b');x.fillStyle='#b5ac7b';x.fillRect(230,400,180,80);
    line([[275,460],[275,550]],'#d16a40',65);line([[365,460],[367,550]],'#518fa8',65);
    ellipse(275,580,60,32,'#71503d');ellipse(380,575,66,32,'#71503d');
    line(near,'#d16a40',57);
    if(clip==='wave'&&(i===1||i===2)){
     const p=near[2];ellipse(p[0],p[1]-8,31,43,'#d16a40');
     for(let finger=0;finger<4;finger++)line([[p[0]-20+finger*13,p[1]-18],[p[0]-20+finger*13,p[1]-62+(finger===0||finger===3?9:0)]],'#d16a40',11);
    }
    ellipse(330,150,77,82,'#b8aaa0');
    x.restore();
   }
   return c.toDataURL('image/png').split(',')[1];
  },clip);
  const bytes=Buffer.from(png,'base64'),path=root+'/idle-'+clip+'-geometry-v2.png';await writeFile(path,bytes);
  await writeFile(root+'/idle-'+clip+'-geometry-v2.json',JSON.stringify({status:'Geometry only, not painted sprite art',clip,sourceSize:[1254,1254],layout:[2,2],cell:627,headCenter:[330,150],headRadii:[77,82],footCenters:[[275,580],[380,575]],fixedAnatomyAcrossPoses:true,nearLimb:'terracotta',farLimb:'blue',sha256:createHash('sha256').update(bytes).digest('hex'),scope:'Identical head, torso, hip, leg and boot geometry in each cell; only gesture arms change. Finished anatomy, style, contacts and proportions require review from the generated pixels.'},null,2)+'\n');
 }
}finally{await browser.close();}
