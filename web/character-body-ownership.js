import {validateBodyFrameRegistration} from './character-body-frames.js';
import {validateContactBodyRegistration} from './character-contact-frame.js';
import {validateContactAtlasRegistration} from './character-contact-atlas.js';
const sheets=['base','idle','activities'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
// A family owns every raw pose explicitly. Source/transform records are part of
// attachment identity, not only convenient loading hints or mutable filenames.
export function validateBodyOwnership(value){
 if(!exact(value,['schema','family','sources','poses'])||value.schema!==1||typeof value.family!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(value.family)||!value.sources||typeof value.sources!=='object'||Array.isArray(value.sources)||!exact(value.poses,sheets))throw Error('Use a complete body-family ownership manifest.');
 const ids=Object.keys(value.sources),counts=new Map();
 if(!ids.length||ids.length>16||ids.some(id=>!/^[a-z][a-z0-9-]{0,47}$/.test(id)))throw Error('Keep a bounded set of named body sources.');
 for(const id of ids){
  const s=value.sources[id],t=s?.transform;
  if(!exact(s,['sha256','width','height','sheet','transform'])||typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256)||![s.width,s.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=4096)||!sheets.includes(s.sheet))throw Error('Use complete, hashed body-source geometry.');
  if(t?.method==='sheet-v1'){
   if(!exact(t,['method','columns','rows','referenceRow'])||![t.columns,t.rows,t.referenceRow].every(Number.isSafeInteger)||t.columns<1||t.rows<1||t.columns*t.rows>16||t.referenceRow<0||t.referenceRow>=t.rows)throw Error('Use a bounded shared sheet transform.');
   counts.set(id,t.columns*t.rows);
  }else if(t?.method==='waist-v1'){
   if(!exact(t,['method','registration']))throw Error('Keep the complete measured waist registration.');
   validateBodyFrameRegistration(t.registration);const r=t.registration;
   if(r.family!==value.family||r.sheet!==s.sheet||r.source.sha256!==s.sha256||r.source.width!==s.width||r.source.height!==s.height)throw Error('Waist registration must own this exact family and source.');
   counts.set(id,r.frames.length);
  }else if(t?.method==='contact-atlas-v1'){
   if(!exact(t,['method','registration']))throw Error('Keep the complete contact-atlas registration.');
   validateContactAtlasRegistration(t.registration);const r=t.registration;
   if(r.family!==value.family||r.sheet!==s.sheet||r.source.sha256!==s.sha256||r.source.width!==s.width||r.source.height!==s.height)throw Error('Atlas contacts must own this exact family and source.');
   counts.set(id,r.frames.length);
  }else if(t?.method==='contact-v1'){
   if(!exact(t,['method','registration']))throw Error('Keep the complete measured contact registration.');
   validateContactBodyRegistration(t.registration);const r=t.registration;
   if(r.family!==value.family||r.sheet!==s.sheet||r.source.sha256!==s.sha256||r.source.width!==s.width||r.source.height!==s.height)throw Error('Contact registration must own this exact family and source.');
   counts.set(id,1);
  }else throw Error('Unsupported body-source normalization.');
 }
 const used=new Set(),poses=new Set();
 for(const sheet of sheets){
  if(!Array.isArray(value.poses[sheet])||value.poses[sheet].length!==16)throw Error('Own all 48 body pose slots.');
  for(const p of value.poses[sheet]){
   if(!exact(p,['source','index'])||typeof p.source!=='string'||!Object.hasOwn(value.sources,p.source)||value.sources[p.source].sheet!==sheet||!Number.isSafeInteger(p.index)||p.index<0||p.index>=counts.get(p.source))throw Error('Every body pose needs an available source pose in the same sheet.');
   const key=p.source+':'+p.index;if(poses.has(key))throw Error('Do not substitute another body pose for a missing drawing.');poses.add(key);used.add(p.source);
  }
 }
 if(used.size!==ids.length)throw Error('Remove unused sources from body ownership.');
}
