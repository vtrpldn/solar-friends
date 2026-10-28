// Measured native ground plane for the unchanged reclining source. A different
// drawing or registration needs its own review; contacts alone imply no shape.
export function registeredBodyShadow(registration){
 const r=registration;
 if(r?.source?.sha256!=='50958453c8bf8c12defcacb2c75943be77a57b0ff17c72793040186dd9621f5e'||r.uniformScale!==.199||JSON.stringify(r.sourceContact)!=='[640,810]'||JSON.stringify(r.nativeContact)!=='[128,164]')return undefined;
 return {center:[128,164],radius:[110,18],angle:-Math.atan(.5)};
}
export function copyResidentShadow(value){
 if(value===undefined)return undefined;
 if(!value||Object.keys(value).sort().join(',')!=='angle,center,radius'||!Array.isArray(value.center)||value.center.length!==2||!Array.isArray(value.radius)||value.radius.length!==2||!Array.from(value.center).every(n=>Number.isFinite(n)&&n>=0&&n<=256)||!Array.from(value.radius).every(n=>Number.isFinite(n)&&n>0&&n<=128)||!Number.isFinite(value.angle)||Math.abs(value.angle)>Math.PI)throw Error('Use bounded registered resident ground shadows.');
 return {center:[...value.center],radius:[...value.radius],angle:value.angle};
}
