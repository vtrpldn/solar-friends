import {canonical} from './editor/journal.js';
import {MAX_CREATION_BYTES} from './editor/files.js';
export const MAP_FORMAT='solar-friends-map';
export const MAP_COMPATIBILITY=Object.freeze({game:1,ruleset:1,assets:1});

export function validateMapPackage(file,validate){
  if(file?.format!==MAP_FORMAT||file.schema!==1)throw Error('This map format is unsupported. Keep the original file.');
  const raw=canonical(file);
  if(new TextEncoder().encode(raw).length>MAX_CREATION_BYTES)throw Error('Keep shared maps under 2 MiB.');
  if(typeof validate!=='function')throw Error('A shared map must pass native land validation before it can be stored.');
  const checked=validate(raw);
  if(checked?.ok!==true)throw Error(checked?.issues?.find(issue=>issue.severity==='error')?.message||'This map cannot be opened by this game version.');
  return JSON.parse(raw);
}

export function createMapPackage({id,version,map,weather,title,description,author,credits=[],validate}){
  if(typeof author!=='string')throw Error('Add an author display name before saving the map.');
  const resolved=structuredClone(map);resolved.revision=version;
  return validateMapPackage({format:MAP_FORMAT,schema:1,id,content_revision:version,title,description,author:author.trim(),compatibility:{...MAP_COMPATIBILITY},credits:structuredClone(credits),map:resolved,weather:structuredClone(weather)},validate);
}

export function mapPackageFile(file,validate){return canonical(validateMapPackage(file,validate));}
