// Local texture repair; source PNGs and the game's camera remain independent.
function weights(p,a,b,c){
  const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/d;
  const v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/d;
  return[u,v,1-u-v];
}
export function meshPoint(mesh,p){
  if(!mesh)return p;
  for(const triangle of mesh.triangles){
    const w=weights(p,...triangle.map(i=>mesh.source[i]));
    if(w.every(n=>n>=-1e-8))return[0,1].map(axis=>triangle.reduce((sum,i,j)=>sum+w[j]*mesh.target[i][axis],0));
  }
  throw new Error('Building landmark lies outside its projection mesh');
}
// Clip the original hull to every source triangle before transforming it.
// Triangle crossings can become extrema even if no original hull vertex does.
export function meshPolygons(mesh,polygon){
 if(!mesh)return [polygon];
 const result=[];
 const side=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
 for(const indices of mesh.triangles){
  const t=indices.map(i=>mesh.source[i]);let clipped=polygon;
  for(let e=0;e<3;e++){
   const a=t[e],b=t[(e+1)%3],output=[];
   for(let i=0;i<clipped.length;i++){
    const p=clipped[i],q=clipped[(i+1)%clipped.length],P=side(a,b,p),Q=side(a,b,q);
    if(P>=-1e-8)output.push(p);
    if((P>=0)!==(Q>=0)){const f=P/(P-Q);output.push([p[0]+f*(q[0]-p[0]),p[1]+f*(q[1]-p[1])]);}
   }
   clipped=output;
  }
  if(clipped.length)result.push(clipped.map(p=>{const w=weights(p,...t);return [0,1].map(axis=>w.reduce((sum,n,i)=>sum+n*mesh.target[indices[i]][axis],0));}));
 }
 return result;
}
export const meshOutline=(mesh,polygon)=>meshPolygons(mesh,polygon).flat();
const cache=new WeakMap(),recent=new Map();let bytes=0;
export function buildingTexture(image,mesh,cell=[0,0,1,1],resolution=1024){
 if(!mesh||typeof document==='undefined')return image;
 let variants=cache.get(image);if(!variants){variants=new Map();cache.set(image,variants);}
 const key=cell.join(',')+'|'+resolution,previous=variants.get(mesh)?.get(key);
 if(previous){recent.delete(previous);recent.set(previous,{variants,mesh,key});return previous;}
 const [x,y,w,h]=cell,iw=image.naturalWidth??image.width,ih=image.naturalHeight??image.height;
 const scale=Math.min(1,resolution/(iw*w)),canvas=document.createElement('canvas');
 canvas.width=Math.ceil(iw*w*scale);canvas.height=Math.ceil(ih*h*scale);
 const ctx=canvas.getContext('2d'),pixelScale=canvas.width/mesh.size;
 for(const triangle of mesh.triangles){
  const source=triangle.map(i=>mesh.source[i]),target=triangle.map(i=>mesh.target[i]);
  const map=p=>{const w=weights(p,...source);return[0,1].map(axis=>w.reduce((sum,n,i)=>sum+n*target[i][axis],0));};
  const p=map([0,0]),X=map([1,0]),Y=map([0,1]);
  const center=[0,1].map(axis=>target.reduce((sum,p)=>sum+p[axis]/3,0));
  ctx.save();ctx.scale(pixelScale,pixelScale);ctx.beginPath();
  // Subpixel overlap avoids transparent cracks along shared rasterized edges.
  target.forEach(([x,y],i)=>{const dx=x-center[0],dy=y-center[1],length=Math.hypot(dx,dy),gain=1+.3/length;const point=[center[0]+dx*gain,center[1]+dy*gain];if(i)ctx.lineTo(...point);else ctx.moveTo(...point);});ctx.closePath();ctx.clip();
  ctx.transform(X[0]-p[0],X[1]-p[1],Y[0]-p[0],Y[1]-p[1],p[0],p[1]);
  ctx.drawImage(image,x*iw,y*ih,w*iw,h*ih,0,0,mesh.size,mesh.height);ctx.restore();
 }
 if(!variants.has(mesh))variants.set(mesh,new Map());variants.get(mesh).set(key,canvas);recent.set(canvas,{variants,mesh,key});bytes+=canvas.width*canvas.height*4;
 while(bytes>64*1024*1024&&recent.size>1){const [old,entry]=recent.entries().next().value;bytes-=old.width*old.height*4;entry.variants.get(entry.mesh).delete(entry.key);recent.delete(old);}
 return canvas;
}
