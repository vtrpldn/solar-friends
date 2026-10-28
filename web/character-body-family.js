import {prepareContactBodyFrame} from './character-contact-frame.js';
import {preparedFrames} from './sprite-frames.js';
import {prepareRegisteredBodyFrames} from './character-body-frames.js';
import {validateBodyOwnership} from './character-body-ownership.js';
import {attachmentFamilyBinding} from './character-attachments.js';
const sheets=['base','idle','activities'];
// Loaded sources come from loadCharacterImageSource: hash and decode the same
// response. The manifest cannot choose URLs or load arbitrary image uploads.
export async function prepareBodyFamily({ownership,sources}){
 const owner=structuredClone(ownership);validateBodyOwnership(owner);
 const ids=Object.keys(owner.sources),owned=[],prepared=new Map();let disposed=false;
 if(!sources||Object.keys(sources).length!==ids.length||ids.some(id=>!Object.hasOwn(sources,id)))throw Error('Load exactly the declared body-family sources.');
 try{
  for(const id of ids){
   const spec=owner.sources[id],source=sources[id],image=source?.image,t=spec.transform;
   if(source?.sourceHash!==spec.sha256||!image?.complete||image.naturalWidth!==spec.width||image.naturalHeight!==spec.height)throw Error('Body source identity or decoded dimensions changed.');
   const contact=t.method==='contact-v1'?prepareContactBodyFrame(source,t.registration):null;
   const frames=contact?[contact.frame]:t.method==='sheet-v1'?preparedFrames(image,{columns:t.columns,rows:t.rows,referenceRow:t.referenceRow}):prepareRegisteredBodyFrames(source,t.registration);
   // Legacy normalization returns borrowed cached canvases. Only the explicitly
   // registered source is owned here and may be released on failure/disposal.
   if(t.method==='waist-v1'||t.method==='contact-v1')owned.push(...frames);
   if(!frames||frames.length!==(t.method==='sheet-v1'?t.columns*t.rows:t.method==='contact-v1'?1:t.registration.frames.length))throw Error('Incomplete prepared body source.');
   prepared.set(id,frames);
  }
  const frames=Object.fromEntries(sheets.map(sheet=>[sheet,owner.poses[sheet].map(p=>prepared.get(p.source)[p.index])])),binding=await attachmentFamilyBinding(frames,owner);
  return Object.freeze({frames,binding,contactForPose(sheet,index){if(disposed)throw Error('This body family has been released.');if(!sheets.includes(sheet)||!Number.isSafeInteger(index)||index<0||index>15)throw Error('Choose a complete body-family pose.');const pose=owner.poses[sheet][index],transform=owner.sources[pose.source].transform;return transform.method==='contact-v1'?[...transform.registration.nativeContact]:undefined;},frameForPose(sheet,index){if(disposed)throw Error('This body family has been released.');if(!sheets.includes(sheet)||!Number.isSafeInteger(index)||index<0||index>15)throw Error('Choose a complete body-family pose.');return frames[sheet][index];},dispose(){if(disposed)return;disposed=true;for(const frame of owned)frame.width=frame.height=0;prepared.clear();}});
 }catch(error){for(const frame of owned)frame.width=frame.height=0;throw error;}
}
