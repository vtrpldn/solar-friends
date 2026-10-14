// Optional texture meshes for artwork that needs local projection repair.
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
const cache=new WeakMap();
export function buildingTexture(image,mesh){
  if(!mesh)return image;
  if(cache.has(image))return cache.get(image);
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth??image.width;canvas.height=image.naturalHeight??image.height;
  const ctx=canvas.getContext('2d'),scale=canvas.width/mesh.size;
  for(const triangle of mesh.triangles){
    const source=triangle.map(i=>mesh.source[i]),target=triangle.map(i=>mesh.target[i]);
    const map=p=>{const w=weights(p,...source);return[0,1].map(axis=>w.reduce((sum,n,i)=>sum+n*target[i][axis],0));};
    const p=map([0,0]),x=map([1,0]),y=map([0,1]);
    ctx.save();ctx.scale(scale,scale);ctx.beginPath();target.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
    ctx.transform(x[0]-p[0],x[1]-p[1],y[0]-p[0],y[1]-p[1],p[0],p[1]);
    ctx.drawImage(image,0,0,mesh.size,mesh.size);ctx.restore();
  }
  cache.set(image,canvas);return canvas;
}
