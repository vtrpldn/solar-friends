// Canvas filters otherwise flush the entire world surface at each restore().
// Cache filtered sprite cells on small surfaces, then composite without a filter.
const cache=new Map(),ids=new WeakMap();let nextId=0,bytes=0;
const budget=48*1024*1024;
export function paintImage(ctx,image,sx,sy,sw,sh,dx,dy,dw,dh,requestedFilter=ctx.filter){
 const original=ctx.filter;
 if(typeof document==='undefined'){ctx.drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh);return;}
 // 1/64 color steps bound dawn/dusk cache churn; geometry and alpha are exact.
 const filter=(requestedFilter||'none').replace(/\d*\.?\d+/g,n=>String(Math.round(Number(n)*64)/64));
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

// Procedural resource icons need the same small-surface filter boundary as PNG
// sprites. Keep gradients, shadows and band colors together in the cached icon.
export function paintProcedural(ctx,key,bounds,x,y,scale,draw) {
 if(typeof document==='undefined'){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);draw(ctx);ctx.restore();return;}
 const [left,top,w,h]=bounds,matrix=ctx.getTransform(),pixels=Math.max(Math.hypot(matrix.a,matrix.b),Math.hypot(matrix.c,matrix.d))*Math.abs(scale),factor=Math.max(4,Math.min(8,Math.ceil(pixels)));
 const id=['procedural',key,factor].join('|');let image=cache.get(id);
 if(image){cache.delete(id);cache.set(id,image);}else{
  image=document.createElement('canvas');image.width=Math.ceil(w*factor);image.height=Math.ceil(h*factor);
  const local=image.getContext('2d');local.scale(factor,factor);local.translate(-left,-top);draw(local);
  cache.set(id,image);bytes+=image.width*image.height*4;
  while(bytes>budget&&cache.size>1){const oldest=cache.keys().next().value,entry=cache.get(oldest);bytes-=entry.width*entry.height*4;cache.delete(oldest);}
 }
 ctx.drawImage(image,x+left*scale,y+top*scale,w*scale,h*scale);
}
