// Canvas filters otherwise flush the entire world surface at each restore().
// Cache filtered sprite cells on small surfaces, then composite without a filter.
const cache=new Map(),ids=new WeakMap();let nextId=0,bytes=0;
const budget=48*1024*1024;
export function paintImage(ctx,image,sx,sy,sw,sh,dx,dy,dw,dh){
 const original=ctx.filter;
 if(typeof document==='undefined'){ctx.drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh);return;}
 // 1/64 color steps bound dawn/dusk cache churn; geometry and alpha are exact.
 const filter=(original||'none').replace(/\d*\.?\d+/g,n=>String(Math.round(Number(n)*64)/64));
 if(!ids.has(image))ids.set(image,++nextId);
 const transform=ctx.getTransform();
 const pixels=Math.max(Math.abs(dw)*Math.hypot(transform.a,transform.b),Math.abs(dh)*Math.hypot(transform.c,transform.d));
 const resolution=Math.min(1024,Math.max(128,Math.ceil(pixels/128)*128));
 const key=[ids.get(image),sx,sy,sw,sh,filter,resolution].join('|');let cut=cache.get(key);
 if(cut){cache.delete(key);cache.set(key,cut);}else{
  cut=document.createElement('canvas');const factor=Math.min(1,resolution/Math.max(sw,sh));
  cut.width=Math.ceil(sw*factor);cut.height=Math.ceil(sh*factor);
  const surface=cut.getContext('2d');surface.filter=filter;surface.drawImage(image,sx,sy,sw,sh,0,0,cut.width,cut.height);
  cache.set(key,cut);bytes+=cut.width*cut.height*4;
  while(bytes>budget&&cache.size>1){const oldest=cache.keys().next().value,entry=cache.get(oldest);bytes-=entry.width*entry.height*4;cache.delete(oldest);}
 }
 ctx.filter='none';ctx.drawImage(cut,0,0,cut.width,cut.height,dx,dy,dw,dh);ctx.filter=original;
}
