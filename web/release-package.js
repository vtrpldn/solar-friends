import {canonical} from './editor/journal.js';
import {freezeCreation,MAX_CREATION_BYTES} from './editor/files.js';
export const RELEASE_FORMAT='solar-friends-release';
export const RELEASE_COMPATIBILITY=Object.freeze({game:1,ruleset:1,assets:1});
function releaseRaw(file,validate){
 if(file?.format!==RELEASE_FORMAT||file.schema!==1)throw Error('This frozen release format is not supported. Keep the original file.');
 const raw=canonical(file);if(new TextEncoder().encode(raw).length>MAX_CREATION_BYTES)throw Error('This frozen release is too large to open.');
 if(typeof validate!=='function')throw Error('A release must pass the game compiler before it can be stored.');
 return raw;
}
function checkedRelease(raw,checked){if(checked?.ok!==true)throw Error(checked?.issues?.find(i=>i.severity==='error')?.message||'This release could not pass the game compiler.');return JSON.parse(raw);}
export function validateRelease(file,validate){const raw=releaseRaw(file,validate);return checkedRelease(raw,validate(raw));}
export async function validateReleaseAsync(file,validate){const raw=releaseRaw(file,validate);return checkedRelease(raw,await validate(raw));}
function releaseEnvelope({id,version,definition,author,credits=[]}){
 if(typeof author!=='string')throw Error('Add an author display name before saving a release.');
 const frozen=structuredClone(definition);frozen.revision=version;frozen.map.revision=version;
 return {format:RELEASE_FORMAT,schema:1,id,content_revision:version,title:frozen.title,description:frozen.description,author:author.trim(),compatibility:{...RELEASE_COMPATIBILITY},credits:structuredClone(credits),definition:frozen};
}
export function createReleasePackage(args){return validateRelease(releaseEnvelope(args),args.validate);}
export function createReleasePackageAsync(args){return validateReleaseAsync(releaseEnvelope(args),args.validate);}
export function freezeReleaseDefinition(definition,context){
 const frozen=freezeCreation(definition,context),biome=definition.map.biome;
 frozen.rules.weather??=structuredClone(biome?context.catalog.biomes.find(b=>b.id===biome.id&&b.version===biome.version)?.weather:context.catalog.weather);
 if(!frozen.rules.weather)throw Error('This creation needs a different weather catalog.');
 frozen.map.biome??={id:'mata-atlantica',version:1};
 frozen.start.residents??=structuredClone(context.catalog.resident_presets);
 return frozen;
}
export function releaseFile(file,validate){return canonical(validateRelease(file,validate));}
