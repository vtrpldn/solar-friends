// Review original generated pixels; never alters the source artwork.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const sources=await Promise.all([1,2,3].map(async version=>{const path=`${root}/sleep-candidate-v${version}.png`,bytes=await readFile(path);return {version,path,sha256:createHash('sha256').update(bytes).digest('hex'),data:bytes.toString('base64')};}));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const result=await page.evaluate(async sources=>{
  const board=document.createElement('canvas');board.width=1500;board.height=1050;const ctx=board.getContext('2d');const reports=[];
  for(const [row,source]of sources.entries()){
   const image=new Image();image.src='data:image/png;base64,'+source.data;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');c.drawImage(image,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;
   const counts={zero:0,low:0,medium:0,solid:0};let bounds=[canvas.width,canvas.height,-1,-1];
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const a=pixels[(y*canvas.width+x)*4+3];counts[a===0?'zero':a<32?'low':a<240?'medium':'solid']++;if(a>=32){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}}
   reports.push({version:source.version,sha256:source.sha256,width:canvas.width,height:canvas.height,counts,alpha32Bounds:bounds});
   for(let col=0;col<3;col++){const x=col*500,y=row*350;ctx.fillStyle=['#93a653','#c6a169','#233b47'][col];ctx.fillRect(x,y,500,350);ctx.drawImage(image,x+10,y+20,480,320);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(`v${source.version} / ${['green','dry','night'][col]}`,x+12,y+20);}
  }
  return {reports,board:board.toDataURL('image/png').split(',')[1]};
 },sources);
 await writeFile(root+'/sleep-source-composite-v1.png',Buffer.from(result.board,'base64'));
 await writeFile(root+'/sleep-source-alpha-v1.json',JSON.stringify({schema:1,why:'Inspect delivered alpha through browser compositing before attributing an image viewer halo to the source',sources:result.reports},null,2)+'\n');
 console.log(JSON.stringify(result.reports));
}finally{await browser.close();}
