import {FRAME_ANCHOR} from './sprite-frames.js';
import {bodyTransformHasContacts,bodyTransformContact} from './character-contact-atlas.js';
import {validateAttachmentBinding} from './character-attachments.js';
import {canonical} from './editor/journal.js';
// Prototype-only material masks. Geometry is authored per pose and evaluated
// against the registered body's pixels; no part is independently normalized.
export const bodyMaterialPalettes={
 skin:{reference:[205,113,42],warm:[205,113,42],sunlit:[218,139,68],copper:[179,92,36]},
 shirt:{reference:[238,218,180],cream:[238,218,180],teal:[64,130,126],terracotta:[177,87,52],indigo:[80,100,152]},
 shorts:{reference:[238,218,180],cream:[238,218,180],sage:[117,130,80],umber:[132,98,65]},
 shoes:{reference:[106,66,35],brown:[106,66,35],graphite:[69,72,67]},
};
for(const palette of Object.values(bodyMaterialPalettes)){for(const color of Object.values(palette))Object.freeze(color);Object.freeze(palette);}Object.freeze(bodyMaterialPalettes);
export const defaultBodyMaterials=Object.freeze({skin:'warm',shirt:'cream',shorts:'cream',shoes:'brown'});
const materialNames=['skin','shirt','shorts','shoes'];
const ids={skin:1,shirt:2,shorts:3,shoes:4},debugColors=[[70,66,57],[225,89,88],[53,153,210],[113,186,86],[178,102,196]];
const widths={base:16,idle:16,activities:16};
export function validateBodyMaterials(recipe){
 if(!recipe||typeof recipe!=='object'||Array.isArray(recipe)||Object.keys(recipe).length!==4||Object.keys(recipe).some(key=>!Object.hasOwn(ids,key)))throw Error('Choose a supported body material recipe.');
 for(const key of Object.keys(ids))if(typeof recipe[key]!=='string'||!Object.hasOwn(bodyMaterialPalettes[key],recipe[key])||recipe[key]==='reference')throw Error('This body material palette is unavailable.');
 return Object.fromEntries(materialNames.map(key=>[key,recipe[key]]));
}
function creamComponents(pixels){
 const cream=new Uint8Array(256*256),components=new Uint32Array(256*256),queue=new Uint32Array(256*256),sizes=[0];
 for(let p=0;p<cream.length;p++){const o=p*4,r=pixels.data[o],g=pixels.data[o+1],b=pixels.data[o+2],maximum=Math.max(r,g,b),minimum=Math.min(r,g,b);cream[p]=Number(pixels.data[o+3]>=32&&r>90&&g/r>=.78&&b/r>=.52&&(maximum-minimum)/maximum<.48);}
 for(let start=0;start<cream.length;start++){
  if(!cream[start]||components[start])continue;const id=sizes.length;let head=0,tail=1;queue[0]=start;components[start]=id;
  const add=p=>{if(cream[p]&&!components[p]){components[p]=id;queue[tail++]=p;}};
  while(head<tail){const p=queue[head++],x=p%256;if(x)add(p-1);if(x<255)add(p+1);if(p>=256)add(p-256);if(p<256*255)add(p+256);}sizes.push(tail);
 }
 return {cream,components,sizes};
}
export function bodyMaterialMask(pixels,region){
 const explicit=region?.garmentAreas!==undefined;
 if(pixels.width!==256||pixels.height!==256||pixels.data.length!==256*256*4||!region||(!explicit&&(!Number.isFinite(region.shirtTop)||!Number.isFinite(region.waist)||!Number.isFinite(region.shoes)||region.shirtTop<0||region.shirtTop>=region.waist||region.waist>=region.shoes||region.shoes>255))||!Array.isArray(region.head)||region.head.length!==4||Array.from(region.head).some(n=>!Number.isFinite(n))||region.head[0]<0||region.head[0]>255||region.head[1]<0||region.head[1]>255||region.head[2]<=0||region.head[2]>96||region.head[3]<=0||region.head[3]>96)throw Error('Provide registered 256-pixel body frames and supported pose regions.');
 const point=p=>Array.isArray(p)&&p.length===2&&Array.from(p).every(n=>Number.isFinite(n)&&n>=0&&n<=256),line=region.waistLine,areas=region.shoeAreas,skinAreas=region.skinAreas;
 if(line!==undefined&&(!Array.isArray(line)||line.length<2||line.length>32||Array.from(line).some((p,i)=>!point(p)||p[1]<region.shirtTop||p[1]>=region.shoes||(i>0&&p[0]<=line[i-1][0]))))throw Error('Use an ordered measured garment waistline.');
 if(areas!==undefined&&(!Array.isArray(areas)||(!explicit&&!areas.length)||areas.length>4||Array.from(areas).some(polygon=>!Array.isArray(polygon)||polygon.length<3||polygon.length>24||Array.from(polygon).some(p=>!point(p)))))throw Error('Use bounded measured shoe regions.');
 if(skinAreas!==undefined&&(!Array.isArray(skinAreas)||!skinAreas.length||skinAreas.length>4||Array.from(skinAreas).some(polygon=>!Array.isArray(polygon)||polygon.length<3||polygon.length>24||Array.from(polygon).some(p=>!point(p)))))throw Error('Use bounded measured skin regions.');
 if(explicit){
  const garment=region.garmentAreas,polygon=p=>Array.isArray(p)&&p.length>=3&&p.length<=24&&Array.from(p).every(point);
  if(!garment||typeof garment!=='object'||Array.isArray(garment)||Object.keys(garment).sort().join(',')!=='shirt,shorts'||['shirt','shorts'].some(name=>!Array.isArray(garment[name])||!garment[name].length||garment[name].length>4||Array.from(garment[name]).some(p=>!polygon(p)))||!Array.isArray(areas)||Object.keys(region).some(key=>!['head','garmentAreas','shoeAreas','skinAreas'].includes(key)))throw Error('Use measured garment polygons and explicit shoe regions for a reclining pose.');
 }
 const waistAt=x=>{if(!line)return region.waist;if(x<=line[0][0])return line[0][1];for(let i=1;i<line.length;i++)if(x<=line[i][0]){const a=line[i-1],b=line[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}return line.at(-1)[1];};
 const inside=(x,y,polygon)=>{let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;};
 const labels=new Uint8Array(256*256),counts=[0,0,0,0,0],regions=creamComponents(pixels);
 for(let p=0;p<labels.length;p++){
  const offset=p*4,r=pixels.data[offset],g=pixels.data[offset+1],b=pixels.data[offset+2],a=pixels.data[offset+3];if(a<32)continue;
  const x=p%256,y=Math.floor(p/256),inHead=((x-region.head[0])/region.head[2])**2+((y-region.head[1])/region.head[3])**2<=1;let material=0;
  // Small isolated whites in the face are eyes/teeth. Connected garment
  // highlights may cross the head ellipse at a collar and must still dye.
  if(skinAreas?.some(polygon=>inside(x+.5,y+.5,polygon)))material=ids.skin;
  else if(regions.cream[p]&&(explicit||y>=region.shirtTop)&&!(inHead&&regions.sizes[regions.components[p]]<64)){
   if(explicit){
    if(region.garmentAreas.shirt.some(polygon=>inside(x+.5,y+.5,polygon)))material=ids.shirt;
    else if(region.garmentAreas.shorts.some(polygon=>inside(x+.5,y+.5,polygon)))material=ids.shorts;
   }else material=y<waistAt(x)?ids.shirt:ids.shorts;
  }
  else if(areas?areas.some(polygon=>inside(x+.5,y+.5,polygon)):y>=region.shoes&&r<190&&g<140&&b<120&&b/Math.max(1,g)>.4&&g/Math.max(1,r)>.5)material=ids.shoes;
  else if(r>140&&g/r<.72&&b/r<.49&&g/Math.max(1,b)>1.35)material=ids.skin;
  labels[p]=material;counts[material]++;
 }
 return {labels,counts};
}
export function tintBodyMaterials(pixels,mask,recipe,{diagnostic=false}={}){
 const checked=validateBodyMaterials(recipe);if(pixels.data?.length!==pixels.width*pixels.height*4||!(mask?.labels instanceof Uint8Array)||mask.labels.length!==pixels.width*pixels.height||mask.labels.some(id=>id>4))throw Error('Body masks must share the exact frame coordinate space.');
 const data=new Uint8ClampedArray(pixels.data);
 for(let p=0;p<mask.labels.length;p++){
  const id=mask.labels[p],offset=p*4;if(!data[offset+3])continue;
  if(diagnostic){for(let channel=0;channel<3;channel++)data[offset+channel]=debugColors[id][channel];continue;}
  if(!id)continue;const name=materialNames[id-1],palette=bodyMaterialPalettes[name],color=palette[checked[name]];
  for(let channel=0;channel<3;channel++)data[offset+channel]=pixels.data[offset+channel]*color[channel]/palette.reference[channel];
 }
 return {width:pixels.width,height:pixels.height,data};
}
export function createBodyMaterialModel(frames,registration,{maxFrames=96,sourceHashes}={}){
 if(!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>128)throw Error('Choose a body composition cache limit between 1 and 128 frames.');
 if(registration?.schema!==1||registration.normalization?.version!==1||registration.normalization.size!==256||registration.normalization.anchor!==FRAME_ANCHOR||registration.normalization.baseReferenceRow!==2||registration.normalization.otherReferenceRow!==0)throw Error('This body material registration is unavailable.');
 for(const sheet of Object.keys(widths))if(!/^[0-9a-f]{64}$/.test(registration.sheets?.[sheet]?.sha256??'')||sourceHashes?.[sheet]!==registration.sheets[sheet].sha256)throw Error('The body pixels differ from their material registration. Review the changed artwork before composing it.');
 return materialModel(frames,registration.sheets,{maxFrames,sourceKey:Object.values(registration.sheets).map(s=>s.sha256).join(':')});
}
// A mixed-source family cannot be described by three old sheet hashes. Bind
// colour regions to complete pose ownership and verify the actual frame pixels.
export async function createFamilyBodyMaterialModel({frames,binding},registration,{maxFrames=96}={}){
 if(!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>128)throw Error('Choose a bounded body material cache.');
 const owner=structuredClone(binding),r=structuredClone(registration);validateAttachmentBinding(owner);
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
 if(owner.normalization!==2||!exact(r,['schema','body','sheets'])||r.schema!==2||canonical(r.body)!==canonical(owner)||!exact(r.sheets,Object.keys(widths)))throw Error('Use colour regions bound to the complete body family.');
 const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 for(const sheet of Object.keys(widths)){
  if(!exact(r.sheets[sheet],['regions'])||!Array.isArray(r.sheets[sheet].regions)||r.sheets[sheet].regions.length!==16||frames[sheet]?.length!==16)throw Error('Provide all 48 family colour regions.');
  for(let index=0;index<16;index++){
   const frame=frames[sheet][index],region=r.sheets[sheet].regions[index];
   if(!region||Object.keys(region).some(key=>!['shirtTop','waist','shoes','head','waistLine','shoeAreas','skinAreas','garmentAreas'].includes(key))||(region.garmentAreas!==undefined?['head','garmentAreas','shoeAreas']:['shirtTop','waist','shoes','head']).some(key=>!Object.hasOwn(region,key))||frame?.width!==256||frame?.height!==256)throw Error('Use complete measured colour regions and body frames.');
   if(await digest(frame.getContext('2d').getImageData(0,0,256,256).data)!==owner.frames[sheet][index])throw Error('The prepared body pixels changed after colour registration.');
  }
 }
 return materialModel(frames,r.sheets,{maxFrames,sourceKey:await digest(new TextEncoder().encode(canonical(r))),copyMasks:true,...(Object.values(owner.ownership.sources).some(s=>bodyTransformHasContacts(s.transform))?{contactForPose:(sheet,index)=>{const pose=owner.ownership.poses[sheet]?.[index];if(!pose)throw Error('Choose a registered material pose.');const t=owner.ownership.sources[pose.source].transform;return bodyTransformContact(t,pose.index);}}:{})});
}
function materialModel(frames,sheets,{maxFrames,sourceKey,copyMasks=false,contactForPose}){
 const sources={},masks={},cache=new Map();
 for(const [sheet,count]of Object.entries(widths)){
  if(frames[sheet]?.length!==count||sheets[sheet]?.regions?.length!==count)throw Error('Provide all 48 registered body poses.');sources[sheet]=[];masks[sheet]=[];
  for(const [index,frame]of frames[sheet].entries()){const pixels=frame.getContext('2d').getImageData(0,0,256,256);sources[sheet].push(pixels);masks[sheet].push(bodyMaterialMask(pixels,sheets[sheet].regions[index]));}
 }
 const frameFor=(sheet,index,recipe,diagnostic)=>{
  if(!Object.hasOwn(widths,sheet)||!Number.isInteger(index)||index<0||index>=16)throw Error('Choose a supported body pose.');
  const checked=validateBodyMaterials(recipe);if(!diagnostic&&Object.keys(ids).every(key=>checked[key]===defaultBodyMaterials[key]))return frames[sheet][index];
  const key=sourceKey+':'+sheet+':'+index+':'+JSON.stringify(checked)+':'+diagnostic;
  if(cache.has(key)){const result=cache.get(key);cache.delete(key);cache.set(key,result);return result;}
  const pixels=tintBodyMaterials(sources[sheet][index],masks[sheet][index],checked,{diagnostic}),canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.getContext('2d').putImageData(new ImageData(pixels.data,256,256),0,0);cache.set(key,canvas);if(cache.size>maxFrames)cache.delete(cache.keys().next().value);return canvas;
 };
 return {provider:(recipe=defaultBodyMaterials,{diagnostic=false}={})=>{const checked=validateBodyMaterials(recipe);return {...(contactForPose?{contactForPose}:{}),frameForPose:(sheet,index)=>frameFor(sheet,index,checked,diagnostic)};},mask:(sheet,index)=>{const mask=masks[sheet]?.[index];return copyMasks&&mask?{labels:mask.labels.slice(),counts:[...mask.counts]}:mask;},cacheInfo:()=>({entries:cache.size,maximum:maxFrames,rgbaByteUpperBound:cache.size*256*256*4}),clear:()=>cache.clear()};
}
