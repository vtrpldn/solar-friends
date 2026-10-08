// Orthographic registration of the pergola's four equal-height posts.
// A single affine camera cannot repair its displaced front post. This small
// constrained texture mesh moves the painted structure onto a rectangular
// prism without replacing the village's materials, vines or furniture.
export const pergolaMesh = {
  size:1280,
  source:[[0,0],[1280,0],[1280,1280],[0,1280],[625,158],[199,382],[1092,413],[698,607],[625,548],[199,828],[1092,838],[698,1058]],
  target:[[0,0],[1280,0],[1280,1280],[0,1280],[650,170],[210,390],[1090,390],[650,610],[650,600],[210,820],[1090,820],[650,1040]],
  triangles:[[0,1,4],[0,4,5],[1,4,6],[4,5,8],[4,6,8],[6,7,8],[0,3,9],[0,5,9],[5,7,8],[5,7,9],[1,2,10],[1,6,10],[6,7,10],[2,3,11],[3,9,11],[7,9,11],[7,10,11],[2,10,11]],
};
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
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
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
