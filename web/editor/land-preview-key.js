import {canonical} from './journal.js';
// These three fields cannot affect geography. Keep every other authored field
// in the key so new setup/rule fields invalidate conservatively by default.
export function landPreviewKey(definition){
 const {title,description,...rest}=definition;
 const {funds,...start}=rest.start;
 return canonical({...rest,start});
}
