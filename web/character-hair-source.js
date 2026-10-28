// A newly authored close-up source has a declared whole-canvas mapping. This
// never fits its painted bounds, rotates a cap or changes existing reuse rigs.
export function registeredHairSourceTransform(registration){
 const t=registration.sourceTransform;if(t===undefined)return null;
 const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(!exact(t,['schema','uniformScale','offset'])||t.schema!==1||registration.placement!==undefined||!Number.isFinite(t.uniformScale)||t.uniformScale<=0||t.uniformScale>1||!Array.isArray(t.offset)||t.offset.length!==2||![t.offset[0],t.offset[1]].every(n=>Number.isFinite(n)&&n>=0&&n<=256))throw Error('Use one complete uniform hair-source mapping without a reuse placement.');
 if(!Number.isSafeInteger(registration.size)||registration.size<1||t.offset.some(n=>n+registration.size*t.uniformScale>256))throw Error('Keep the complete hair-source canvas inside the native frame.');
 return Object.freeze({uniformScale:t.uniformScale,offset:Object.freeze([...t.offset])});
}
