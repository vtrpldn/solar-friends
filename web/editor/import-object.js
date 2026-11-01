// Callers enforce their file-size bounds before reading. Syntax and root-shape
// failures are player-facing file errors; never expose parser excerpts of a file.
export function parseImportObject(raw,kind='creation'){
 const label=kind==='resident'?'resident':'creation';
 const message=`This file is not a readable ${label}. Choose an exported Solar Friends ${label} or backup.`;
 let value;
 try{value=JSON.parse(raw);}catch{throw Error(message);}
 if(value===null||typeof value!=='object'||Array.isArray(value))throw Error(message);
 return value;
}
