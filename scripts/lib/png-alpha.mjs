import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
// Read source alpha without resampling or changing project images.
export function readAlpha(bytes) {
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Expected PNG');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
  assert(width<=4096&&height<=4096&&bytes[24]===8&&bytes[25]===6&&bytes[28]===0,'Expected bounded, noninterlaced RGBA PNG');
  const chunks=[];
  for(let offset=8;offset<bytes.length;){const length=bytes.readUInt32BE(offset),name=bytes.toString('ascii',offset+4,offset+8);if(name==='IDAT')chunks.push(bytes.subarray(offset+8,offset+8+length));offset+=length+12;}
  const stride=width*4,raw=inflateSync(Buffer.concat(chunks));assert.equal(raw.length,(stride+1)*height);
  const alpha=new Uint8Array(width*height),rows=[new Uint8Array(stride),new Uint8Array(stride)];
  const paeth=(a,b,c)=>{const p=a+b-c,A=Math.abs(p-a),B=Math.abs(p-b),C=Math.abs(p-c);return A<=B&&A<=C?a:B<=C?b:c;};
  for(let y=0;y<height;y++){
    const row=rows[y%2],prior=rows[(y+1)%2],start=y*(stride+1),filter=raw[start];assert(filter<=4);
    for(let i=0;i<stride;i++){const a=i>=4?row[i-4]:0,b=y?prior[i]:0,c=y&&i>=4?prior[i-4]:0;row[i]=(raw[start+1+i]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}
    for(let x=0;x<width;x++)alpha[y*width+x]=row[x*4+3];
  }
  return {width,height,alpha};
}
export function alphaOutline(image,cell=[0,0,1,1]) {
  const x0=Math.round(cell[0]*image.width),y0=Math.round(cell[1]*image.height),width=Math.round(cell[2]*image.width),height=Math.round(cell[3]*image.height),points=[];
  for(let y=0;y<height;y++){
    let left=width,right=-1;
    for(let x=0;x<width;x++)if(image.alpha[(y+y0)*image.width+x+x0]>=32){left=Math.min(left,x);right=x;}
    if(right>=0)for(const x of [left,right+1])for(const Y of [y,y+1])points.push([x/width,Y/width]);
  }
  return points;
}
export function convexHull(points) {
  const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);assert(sorted.length>=3,'Empty sprite');
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=ps=>{const out=[];for(const p of ps){while(out.length>=2&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out.slice(0,-1);};
  return [...half(sorted),...half([...sorted].reverse())].map(p=>p.map(n=>Number(n.toFixed(8))));
}
