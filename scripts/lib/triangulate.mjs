// Bowyer-Watson triangulation for a small, deterministic landmark set.
export const area=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function triangulate(input){
 const span=Math.max(...input.flat().map(Math.abs))*16+1;
 const p=[...input,[-span,-span],[span*2,-span],[-span,span*2]],n=input.length;
 let triangles=[[n,n+1,n+2]];
 const inside=(t,d)=>{
  const [a,b,c]=t.map(i=>[p[i][0]-d[0],p[i][1]-d[1]]);
  const det=(a[0]*a[0]+a[1]*a[1])*(b[0]*c[1]-b[1]*c[0])-(b[0]*b[0]+b[1]*b[1])*(a[0]*c[1]-a[1]*c[0])+(c[0]*c[0]+c[1]*c[1])*(a[0]*b[1]-a[1]*b[0]);
  return det* Math.sign(area(...t.map(i=>p[i])))>1e-7;
 };
 for(let i=0;i<n;i++){
  const bad=triangles.filter(t=>inside(t,p[i])),edges=new Map();
  for(const t of bad)for(let j=0;j<3;j++){const edge=[t[j],t[(j+1)%3]],key=[...edge].sort((a,b)=>a-b).join(',');if(edges.has(key))edges.delete(key);else edges.set(key,edge);}
  const removed=new Set(bad);triangles=triangles.filter(t=>!removed.has(t));
  for(const [a,b]of edges.values())if(Math.abs(area(p[a],p[b],p[i]))>1e-7)triangles.push(area(p[a],p[b],p[i])>0?[a,b,i]:[b,a,i]);
 }
 return triangles.filter(t=>t.every(i=>i<n));
}
