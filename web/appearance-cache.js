// Bound asynchronous frame composition as well as the completed-frame cache.
// Pending callers share work; clearing never lets old work refill the cache.
export function createAppearanceCache({compose,maxEntries=12,maxConcurrent=2,maxQueued=48,isPinned=()=>false,measureBytes}){
 if(measureBytes!==undefined&&typeof measureBytes!=='function'||typeof compose!=='function'||typeof isPinned!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>24||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(maxQueued)||maxQueued<1||maxQueued>128)throw Error('Choose bounded appearance composition limits.');
 const cache=new Map(),pending=new Map(),queue=[];let epoch=0,active=0,installation=0,closed=false,closing=null,finishClose=null,invalidateUndo=null,rollback=null;const running=new Set();
 function drain(){
  while(!closed&&active<maxConcurrent&&queue.length){
   const job=queue.shift();active++;running.add(job);
   const release=()=>{active--;running.delete(job);pending.delete(job.pendingKey);drain();if(closed&&active===0)finishClose?.();};
   Promise.resolve().then(()=>compose(job.input)).then(result=>{
    try{if(job.epoch===epoch){cache.set(job.key,result);while(cache.size>maxEntries){const victim=[...cache.keys()].find(key=>!isPinned(key));cache.delete(victim??job.key);}}}catch(error){cache.delete(job.key);release();job.reject(error);return;}
    release();job.resolve(result);
   },error=>{release();job.reject(error);});
  }
 }
 return {
  peek(key){if(!cache.has(key))return undefined;const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;},
  get(key,input){
   if(closed)return Promise.reject(Error('This appearance cache has been released.'));
   if(typeof key!=='string'||!key) return Promise.reject(Error('Choose a canonical appearance key.'));
   if(cache.has(key)){const result=cache.get(key);cache.delete(key);cache.set(key,result);return Promise.resolve(result);}
   const pendingKey=epoch+':'+key;if(pending.has(pendingKey))return pending.get(pendingKey);
   if(active>=maxConcurrent&&queue.length>=maxQueued)return Promise.reject(Error('Appearance previews are busy. Try again when composition finishes.'));
   let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   pending.set(pendingKey,promise);queue.push({key,input,epoch,pendingKey,resolve,reject});drain();return promise;
  },
  install(entries){
   if(closed)throw Error('This appearance cache has been released.');
   if(!Array.isArray(entries)||entries.length>maxEntries||entries.some(e=>!Array.isArray(e)||e.length!==2||typeof e[0]!=='string'||!e[0])||new Set(entries.map(e=>e[0])).size!==entries.length)throw Error('Install a bounded set of distinct prepared appearances.');
   const installed=new Set(entries.map(e=>e[0])),next=new Map(cache);for(const [key,value]of entries){next.delete(key);next.set(key,value);}
   while(next.size>maxEntries){const victim=[...next.keys()].find(key=>!installed.has(key)&&!isPinned(key));if(victim===undefined)throw Error('Prepared appearances exceed protected cache capacity.');next.delete(victim);}
   invalidateUndo?.();
   const previous=new Map(cache),revision=++installation;rollback=previous;invalidateUndo=()=>{previous.clear();rollback=null;};
   cache.clear();for(const [key,value]of next)cache.set(key,value);
   return ()=>{if(installation!==revision)return false;installation++;cache.clear();for(const [key,value]of previous)cache.set(key,value);previous.clear();rollback=null;invalidateUndo=null;return true;};
  },
  clear(){epoch++;installation++;invalidateUndo?.();invalidateUndo=null;cache.clear();},
  dispose(){
   if(closing)return closing;closed=true;epoch++;installation++;invalidateUndo?.();invalidateUndo=null;cache.clear();
   closing=new Promise(resolve=>{finishClose=resolve;});
   const error=Error('This appearance cache has been released.');
   for(const job of queue.splice(0)){pending.delete(job.pendingKey);job.reject(error);}
   for(const job of running)job.reject(error);
   if(active===0)finishClose();return closing;
  },
  info:()=>({...(closed?{closed:true}:{}),entries:cache.size,active,queued:queue.length,pending:pending.size,maxEntries,maxConcurrent,maxQueued,...(measureBytes?{rollbackEntries:rollback?.size??0,retainedBytes:[...new Set([...cache.values(),...(rollback?.values()??[])])].reduce((sum,value)=>{const bytes=measureBytes(value);if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(sum+bytes))throw Error('Measure bounded cache surface bytes.');return sum+bytes;},0)}:{})}),
 };
}
