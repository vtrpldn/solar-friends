import {validateMapPackage} from '../map-package.js';
import {validateRelease} from '../release-package.js';
// Read only the understood envelope. Recover validated package content into a
// fresh library identity; outer metadata and the original backup stay untouched.
export function recoveredPackage(file,{validateMap,validateScenario,validateResident}={}){
 const specs={map:['solar-friends-frozen-map','package'],release:['solar-friends-frozen-release','package'],resident:['solar-friends-resident-preset','file']};
 const spec=typeof file?.kind==='string'&&Object.hasOwn(specs,file.kind)?specs[file.kind]:null;
 if(file?.format!=='solar-friends-recovery'||file.schema!==1||!spec||file.record?.format!==spec[0]||file.record.schema!==1)throw Error('This package backup needs another game version. Keep the original file; nothing was recovered.');
 const value=structuredClone(file.record[spec[1]]);
 if(file.kind==='map')return {kind:'map',file:validateMapPackage(value,validateMap)};
 if(file.kind==='release')return {kind:'release',file:validateRelease(value,validateScenario)};
 if(value?.format!=='solar-friends-resident'||![1,2].includes(value.schema)||new TextEncoder().encode(JSON.stringify(value)).length>64*1024||typeof validateResident!=='function')throw Error('This resident backup cannot open in this version. Keep the original file.');
 const report=validateResident(JSON.stringify(value));if(report?.ok!==true)throw Error(report?.issues?.find(issue=>issue.severity==='error')?.message||'This resident backup cannot open in this version. Keep the original file.');
 return {kind:'resident',file:value};
}
