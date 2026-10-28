import {presentedPoseLayers} from './resident-animation.js';
import {paintContactShadow} from './world-renderer.js';
import {copyResidentShadow} from './resident-shadow-metadata.js';
// Defaults are supplied by the calling scene so legacy ground pixels stay exact.
export function paintResidentShadow(ctx,provider,animation,x,y,width,{rx,ry,offsetY=0,opacity=.25}){
 const legacy=weight=>paintContactShadow(ctx,x,y+offsetY,rx,ry,opacity*weight);
 if(provider.shadowForPose===undefined){legacy(1);return;}
 if(typeof provider.shadowForPose!=='function')throw Error('Use registered resident shadow metadata.');
 const layers=presentedPoseLayers(animation.layers,provider.interpolation??'crossfade').filter(p=>p.weight>0).map(pose=>({pose,shape:copyResidentShadow(provider.shadowForPose(pose.sheet,pose.row*4+pose.frame,pose))}));
 if(layers.every(({shape})=>shape===undefined)){legacy(1);return;}
 for(const {pose,shape}of layers){
  const index=pose.row*4+pose.frame;
  if(!shape){legacy(pose.weight);continue;}
  const contact=provider.contactForPose?.(pose.sheet,index,pose);
  if(!Array.isArray(contact)||contact.length!==2||!Array.from(contact).every(n=>Number.isFinite(n)&&n>=0&&n<=256))throw Error('Ground shadows require their registered pose contact.');
  const scale=width/256;
  ctx.save();try{ctx.translate(x,y);ctx.scale(animation.facing,1);ctx.translate((shape.center[0]-contact[0])*scale,(shape.center[1]-contact[1])*scale);ctx.rotate(shape.angle);paintContactShadow(ctx,0,0,shape.radius[0]*scale,shape.radius[1]*scale,opacity*pose.weight);}finally{ctx.restore();}
 }
}
