import {canonical} from './editor/journal.js';
import {MAX_CREATION_BYTES} from './editor/files.js';
export const MAP_FORMAT='solar-friends-map';
export const MAP_COMPATIBILITY=Object.freeze({game:1,ruleset:1,assets:1});

function mapRaw(file,validate){
  if(file?.format!==MAP_FORMAT||file.schema!==1)throw Error('This map format is unsupported. Keep the original file.');
  const raw=canonical(file);
  if(new TextEncoder().encode(raw).length>MAX_CREATION_BYTES)throw Error('Keep shared maps under 2 MiB.');
  if(typeof validate!=='function')throw Error('A shared map must pass native land validation before it can be stored.');
  return raw;
}

function checkedMap(raw,checked){if(checked?.ok!==true)throw Error(checked?.issues?.find(issue=>issue.severity==='error')?.message||'This map cannot be opened by this game version.');return JSON.parse(raw);}
export function validateMapPackage(file,validate){const raw=mapRaw(file,validate);return checkedMap(raw,validate(raw));}
export async function validateMapPackageAsync(file,validate){const raw=mapRaw(file,validate);return checkedMap(raw,await validate(raw));}

function mapEnvelope({id,version,map,weather,title,description,author,credits=[]}){
  if(typeof author!=='string')throw Error('Add an author display name before saving the map.');
  const resolved=structuredClone(map);resolved.revision=version;
  return {format:MAP_FORMAT,schema:1,id,content_revision:version,title,description,author:author.trim(),compatibility:{...MAP_COMPATIBILITY},credits:structuredClone(credits),map:resolved,weather:structuredClone(weather)};
}

export function createMapPackage(args){return validateMapPackage(mapEnvelope(args),args.validate);}
export function createMapPackageAsync(args){return validateMapPackageAsync(mapEnvelope(args),args.validate);}

export function mapPackageFile(file,validate){return canonical(validateMapPackage(file,validate));}
