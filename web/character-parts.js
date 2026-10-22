// Parts inherit the body's transform. Never normalize hair or clothing alone.
import {locateSpriteFrames,preparedFrames,FRAME_ANCHOR} from './sprite-frames.js';
export function characterBodyLayout(pixels){return locateSpriteFrames(pixels.data,pixels.width,pixels.height,4,4,2);}
export function auditCharacterPart(pixels,regions,{minimumCoverage=.98}={}){
 if(!Number.isFinite(minimumCoverage)||minimumCoverage<=0||minimumCoverage>1)throw Error('Use a coverage threshold above zero and at most one.');
 if(regions.length!==16||regions.some(b=>b.length!==4||b.some(n=>!Number.isFinite(n))||b[0]<0||b[1]<0||b[2]<=0||b[3]<=0||b[0]+b[2]>pixels.width||b[1]+b[3]>pixels.height))throw Error('Provide sixteen valid authored part regions.');
 const cells=Array.from({length:16},()=>({pixels:0,inside:0,bounds:[Infinity,Infinity,-Infinity,-Infinity]}));
 for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++){
  if(pixels.data[(y*pixels.width+x)*4+3]<32)continue;
  const i=Math.min(3,Math.floor(y*4/pixels.height))*4+Math.min(3,Math.floor(x*4/pixels.width)),cell=cells[i],[rx,ry,rw,rh]=regions[i];
  cell.pixels++;if(x>=rx&&x<rx+rw&&y>=ry&&y<ry+rh)cell.inside++;
  cell.bounds=[Math.min(cell.bounds[0],x),Math.min(cell.bounds[1],y),Math.max(cell.bounds[2],x+1),Math.max(cell.bounds[3],y+1)];
 }
 const poses=cells.map((cell,index)=>({...cell,index,bounds:cell.pixels?cell.bounds:null,coverage:cell.pixels?cell.inside/cell.pixels:0,ok:cell.pixels>0&&cell.inside/cell.pixels>=minimumCoverage}));
 return {ok:poses.every(p=>p.ok),minimumCoverage,poses};
}
export function drawRegisteredCharacterFrame(ctx,{body,parts=[],layout,index,diagnostic=false}){
 if(!Number.isInteger(index)||index<0||index>=16)throw Error('Choose a supported body pose.');
 if(body.naturalWidth!==layout.width||body.naturalHeight!==layout.height)throw Error('The body atlas dimensions differ from its registration.');
 for(const part of parts){
  if(part.image.naturalWidth!==layout.width||part.image.naturalHeight!==layout.height)throw Error('Character parts must share the authored atlas coordinate space.');
  if(!diagnostic&&!part.audit?.ok)throw Error('This character part has not passed its registration gate.');
 }
 const f=layout.frames[index],column=index%4,row=Math.floor(index/4),w=layout.width/4,h=layout.height/4,scale=layout.scale*256;
 ctx.clearRect(0,0,256,256);ctx.drawImage(preparedFrames(body,{referenceRow:2})[index],0,0);
 for(const part of parts)ctx.drawImage(part.image,column*w,row*h,w,h,128+(column*w-f.pivot)*scale,FRAME_ANCHOR*256+(row*h-f.bottom)*scale,w*scale,h*scale);
}
