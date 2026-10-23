// Measures raw alpha and composes unchanged sources at the shared body scale.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='assets/art-direction/character-prototype-v1/short-beard-v1',names=['rejected-candidate-v1.png','candidate-v2.png','candidate-v3.png','candidate-v4.png'];
const body=await readFile('assets/art-direction/character-prototype-v1/straw-hat-prototype-v1/body-guide.png'),inputs=await Promise.all(names.map(async name=>{const bytes=await readFile(root+'/'+name);return {name,sha256:createHash('sha256').update(bytes).digest('hex'),data:bytes.toString('base64')};}));
const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();const result=await page.evaluate(async({body,inputs})=>{const image=async data=>{const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();return i;},base=await image(body),board=document.createElement('canvas');board.width=1600;board.height=620;const ctx=board.getContext('2d'),rows=[];ctx.fillStyle='#e8dfbf';ctx.fillRect(0,0,1600,620);
 for(const [index,input]of inputs.entries()){
  const overlay=await image(input.data),source=document.createElement('canvas');source.width=overlay.width;source.height=overlay.height;const c=source.getContext('2d');c.drawImage(overlay,0,0);const pixels=c.getImageData(0,0,source.width,source.height).data;let count=0,outside=0,minX=Infinity,minY=Infinity,maxX=-1,maxY=-1;for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){if(pixels[(y*source.width+x)*4+3]<8)continue;count++;minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);if(x<580||x>790||y<280||y>370)outside++;}
  rows.push({name:input.name,sha256:input.sha256,width:overlay.width,height:overlay.height,alphaThreshold:8,bounds:[minX,minY,maxX,maxY],visiblePixels:count,outsideReviewEnvelope:outside});
  const x=index*400;ctx.drawImage(base,x,10,400,400);ctx.drawImage(overlay,x,10,400,400);ctx.font='14px monospace';ctx.fillStyle='#483a27';ctx.fillText(input.name,x+8,435);
  // Identical scale for body and accessory; an enlarged face crop is review only.
  ctx.drawImage(base,540,180,280,220,x+15,460,210,165);ctx.drawImage(overlay,540,180,280,220,x+15,460,210,165);
  ctx.drawImage(base,x+260,470,96,96);ctx.drawImage(overlay,x+260,470,96,96);
 }
 return {rows,board:board.toDataURL('image/png').split(',')[1]};},{body:body.toString('base64'),inputs});await writeFile(root+'/comparison.png',Buffer.from(result.board,'base64'));await writeFile(root+'/source-audit.json',JSON.stringify(result.rows,null,2)+'\n');console.log(JSON.stringify(result.rows));}finally{await browser.close();}
