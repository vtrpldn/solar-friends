// Parts inherit the body's transform. Never normalize hair or clothing alone.
import {locateSpriteFrames,preparedFrames,FRAME_ANCHOR} from './sprite-frames.js';
export const CHARACTER_PART_MINIMUM_COVERAGE=.98;
export function auditCharacterPartRegion(pixels,region){
 if(!Number.isInteger(pixels?.width)||!Number.isInteger(pixels?.height)||pixels.width<1||pixels.height<1||pixels.data?.length!==pixels.width*pixels.height*4||!Array.isArray(region)||region.length!==4||Array.from(region).some(n=>!Number.isFinite(n))||region[0]<0||region[1]<0||region[2]<=0||region[3]<=0||region[0]+region[2]>pixels.width||region[1]+region[3]>pixels.height)throw Error('Provide pixels and a valid authored part region.');
 const [rx,ry,rw,rh]=region,right=rx+rw,bottom=ry+rh,data=pixels.data,width=pixels.width,height=pixels.height;
 let painted=0,inside=0;const bounds=[Infinity,Infinity,-Infinity,-Infinity];
 // Alpha is still inspected in source order at every pixel. Bounds need only
 // the first/last painted pixel in each row, not four updates per painted pixel.
 for(let y=0,offset=3;y<height;y++){
  let first=-1,last=-1,rowPainted=0,rowInside=0;const insideY=y>=ry&&y<bottom;
  for(let x=0;x<width;x++,offset+=4)if(data[offset]>=32){
   rowPainted++;if(first<0)first=x;last=x;
   if(insideY&&x>=rx&&x<right)rowInside++;
  }
  if(rowPainted){
   painted+=rowPainted;inside+=rowInside;
   if(first<bounds[0])bounds[0]=first;if(last+1>bounds[2])bounds[2]=last+1;
   if(bounds[1]===Infinity)bounds[1]=y;bounds[3]=y+1;
  }
 }
 return {pixels:painted,inside,bounds:painted?bounds:null,coverage:painted?inside/painted:0,minimumCoverage:CHARACTER_PART_MINIMUM_COVERAGE,ok:painted>0&&inside/painted>=CHARACTER_PART_MINIMUM_COVERAGE};
}
export function characterBodyLayout(pixels){return locateSpriteFrames(pixels.data,pixels.width,pixels.height,4,4,2);}
export function auditCharacterPart(pixels,regions,{minimumCoverage=CHARACTER_PART_MINIMUM_COVERAGE}={}){
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
