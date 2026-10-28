// For the opaque, unclipped beginning of a world frame. One raster per owner.
// Terrain and the drawing context are borrowed;
// only the reusable viewport canvas belongs to this cache.
export function createWorldBackdrop(ctx,drawGround,{background='#dfe6c9',maxPixels=16*1024*1024}={}){
 if(typeof drawGround!=='function'||!Number.isSafeInteger(maxPixels)||maxPixels<1)throw Error('Choose a bounded ground backdrop.');
 if(typeof background!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(background))throw Error('Choose an opaque backdrop colour.');
 let surface=null,key=null,source=null,closed=false,hits=0,rebuilds=0;
 const clear=()=>{if(surface)surface.width=surface.height=0;key=null;source=null;};
 return Object.freeze({
  paint(ground,origin,scale,revision=ground){
   if(closed)throw Error('This ground backdrop has been released.');
   const {width,height}=ctx.canvas,m=ctx.getTransform();
   const supported=width>0&&height>0&&width*height<=maxPixels&&m.a>0&&m.d>0&&m.b===0&&m.c===0&&m.e===0&&m.f===0&&ctx.filter==='none'&&ctx.globalAlpha===1&&ctx.globalCompositeOperation==='source-over'&&ctx.shadowBlur===0&&ctx.shadowOffsetX===0&&ctx.shadowOffsetY===0&&ctx.shadowColor==='rgba(0, 0, 0, 0)'&&(ctx.getContextAttributes?.().colorSpace??'srgb')==='srgb';
   if(!supported){clear();drawGround(ctx,ground,origin,scale);return false;}
   const next=[width,height,m.a,m.d,origin.x,origin.y,scale,revision,ground.width,ground.height,ctx.imageSmoothingEnabled,ctx.imageSmoothingQuality];
   if(source===ground&&key&&next.every((value,index)=>value===key[index]))hits++;
   else{
    key=null;source=null;
    surface??=document.createElement('canvas');surface.width=width;surface.height=height;
    try{
     const local=surface.getContext('2d');local.fillStyle=background;local.fillRect(0,0,width,height);
     local.setTransform(m);local.imageSmoothingEnabled=ctx.imageSmoothingEnabled;local.imageSmoothingQuality=ctx.imageSmoothingQuality;
     drawGround(local,ground,origin,scale);
     source=ground;key=next;rebuilds++;
    }catch(error){clear();throw error;}
   }
   ctx.save();
   try{ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(surface,0,0);}
   finally{ctx.restore();}
   return true;
  },
  clear,
  dispose(){if(closed)return;clear();closed=true;},
  info:()=>({hits,rebuilds,width:surface?.width??0,height:surface?.height??0,bytes:(surface?.width??0)*(surface?.height??0)*4,maxPixels,closed}),
 });
}
