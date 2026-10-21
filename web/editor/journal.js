// Compact reversible JSON edits. Paths never traverse inherited properties;
// replacement uses data properties so even special JSON keys remain plain data.
export function canonical(value){
  return JSON.stringify(value,(_key,item)=>{
    if(typeof item==='number'&&!Number.isFinite(item))throw Error('Use a finite number for this value.');
    if(['undefined','function','symbol','bigint'].includes(typeof item))throw Error('Drafts can contain only serializable values.');
    if(item&&typeof item==='object'&&!Array.isArray(item))return Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]]));
    return item;
  });
}
const own=(object,key)=>Object.hasOwn(object,key);
const side=(exists,value)=>exists?{exists:true,value:structuredClone(value)}:{exists:false};
const equal=(a,b)=>Object.is(a,b)||canonical(a)===canonical(b);
export function difference(before,after,replacementSize){
  const changes=[];
  const add=(path,a,b,hasA=true,hasB=true)=>{changes.push({path,before:side(hasA,a),after:side(hasB,b)});if(changes.length>32768)throw Error('Use a root replacement.');};
  function walk(a,b,path){
    if(Object.is(a,b))return;
    if(path.length>=64||path.some(key=>typeof key==='string'&&key.length>1000)){add([],before,after);throw Error('Use a root replacement.');}
    if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
      if(Array.isArray(a)){
        const firstChange=changes.length;
        if(a.length!==b.length){
          let first=0,last=0;while(first<Math.min(a.length,b.length)&&equal(a[first],b[first]))first++;
          while(last<Math.min(a.length,b.length)-first&&equal(a[a.length-1-last],b[b.length-1-last]))last++;
          const oldEnd=a.length-last,newEnd=b.length-last,overlap=Math.min(oldEnd-first,newEnd-first);
          for(let i=0;i<overlap;i++)walk(a[first+i],b[first+i],[...path,first+i]);
          for(let i=oldEnd-1;i>=first+overlap;i--)add([...path,i],a[i],undefined,true,false);
          for(let i=first+overlap;i<newEnd;i++)add([...path,i],undefined,b[i],false,true);
        }else for(let i=0;i<a.length;i++)walk(a[i],b[i],[...path,i]);
        if(changes.length-firstChange>Math.max(64,a.length/4)&&canonical(changes.slice(firstChange)).length>canonical(a).length+canonical(b).length){
          changes.splice(firstChange);add(path,a,b);
        }
      }else for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
        if(!own(a,key)||!own(b,key))add([...path,key],a[key],b[key],own(a,key),own(b,key));
        else walk(a[key],b[key],[...path,key]);
      }
    }else add(path,a,b);
  }
  try{walk(before,after,[]);}catch{return [{path:[],before:side(true,before),after:side(true,after)}];}
  const limit=replacementSize??canonical(before).length+canonical(after).length;
  return canonical(changes).length>limit?[{path:[],before:side(true,before),after:side(true,after)}]:changes;
}
export function validateChanges(changes,encode){
  if(!Array.isArray(changes)||!changes.length||changes.length>32768)throw Error('Invalid edit operations.');
  for(const op of changes){
    if(!op||Object.keys(op).sort().join(',')!=='after,before,path'||!Array.isArray(op.path)||op.path.length>64||op.path.some(key=>typeof key!=='string'&&!Number.isSafeInteger(key)||typeof key==='string'&&key.length>1000||typeof key==='number'&&key<0))throw Error('Invalid edit path.');
    for(const value of [op.before,op.after]){
      if(!value||typeof value.exists!=='boolean'||Object.keys(value).sort().join(',')!==(value.exists?'exists,value':'exists'))throw Error('Invalid edit value.');
      if(value.exists)encode(value.value);
    }
    if(!op.path.length&&(!op.before.exists||!op.after.exists))throw Error('A draft cannot be removed.');
  }
}
export function applyChanges(source,changes,forward){
  let root=structuredClone(source);
  for(const op of forward?changes:[...changes].reverse()){
    const expected=forward?op.before:op.after,replacement=forward?op.after:op.before;
    if(!op.path.length){if(!equal(root,expected.value))throw Error('History does not match the draft.');root=structuredClone(replacement.value);continue;}
    let parent=root;
    for(const key of op.path.slice(0,-1)){
      if(!parent||typeof parent!=='object'||!own(parent,key)||Array.isArray(parent)&&typeof key!=='number'||!Array.isArray(parent)&&typeof key!=='string')throw Error('History leaves the draft.');
      parent=parent[key];
    }
    const key=op.path.at(-1);
    if(!parent||typeof parent!=='object')throw Error('Invalid history target.');
    if(Array.isArray(parent)){
      if(typeof key!=='number'||key>parent.length||expected.exists&&(key===parent.length||!equal(parent[key],expected.value)))throw Error('Invalid array history.');
      if(!expected.exists&&replacement.exists)parent.splice(key,0,structuredClone(replacement.value));
      else if(expected.exists&&!replacement.exists)parent.splice(key,1);
      else if(expected.exists&&replacement.exists)parent[key]=structuredClone(replacement.value);
      else throw Error('Invalid array edit.');
      continue;
    }
    if(typeof key!=='string')throw Error('Invalid object history.');
    if(own(parent,key)!==expected.exists||expected.exists&&!equal(parent[key],expected.value))throw Error('History does not match the draft.');
    if(replacement.exists)Object.defineProperty(parent,key,{value:structuredClone(replacement.value),enumerable:true,configurable:true,writable:true});
    else delete parent[key];
  }
  return root;
}

// State signatures detect accidental journal/document damage; each operation
// separately verifies its touched value before it is applied.
export function signature(raw){
  let a=2166136261,b=2654435769;
  for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}
  return [raw.length,a>>>0,b>>>0];
}
export const sameSignature=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===3&&b.length===3&&a.every((n,i)=>n===b[i]);
export function validSignature(value,maximum){return Array.isArray(value)&&value.length===3&&value.every(n=>Number.isSafeInteger(n)&&n>=0)&&value[0]<=maximum&&value[1]<=4294967295&&value[2]<=4294967295;}
