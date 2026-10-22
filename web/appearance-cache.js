// Bound asynchronous frame composition as well as the completed-frame cache.
// Pending callers share work; clearing never lets old work refill the cache.
export function createAppearanceCache({compose,maxEntries=12,maxConcurrent=2,maxQueued=48}){
 if(typeof compose!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>24||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(maxQueued)||maxQueued<1||maxQueued>128)throw Error('Choose bounded appearance composition limits.');
 const cache=new Map(),pending=new Map(),queue=[];let epoch=0,active=0;
 function drain(){
  while(active<maxConcurrent&&queue.length){
   const job=queue.shift();active++;
   const release=()=>{active--;pending.delete(job.pendingKey);drain();};
   Promise.resolve().then(()=>compose(job.input)).then(result=>{
    if(job.epoch===epoch){cache.set(job.key,result);while(cache.size>maxEntries)cache.delete(cache.keys().next().value);}
    release();job.resolve(result);
   },error=>{release();job.reject(error);});
  }
 }
 return {
  get(key,input){
   if(typeof key!=='string'||!key) return Promise.reject(Error('Choose a canonical appearance key.'));
   if(cache.has(key)){const result=cache.get(key);cache.delete(key);cache.set(key,result);return Promise.resolve(result);}
   const pendingKey=epoch+':'+key;if(pending.has(pendingKey))return pending.get(pendingKey);
   if(active>=maxConcurrent&&queue.length>=maxQueued)return Promise.reject(Error('Appearance previews are busy. Try again when composition finishes.'));
   let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   pending.set(pendingKey,promise);queue.push({key,input,epoch,pendingKey,resolve,reject});drain();return promise;
  },
  clear(){epoch++;cache.clear();},
  info:()=>({entries:cache.size,active,queued:queue.length,pending:pending.size,maxEntries,maxConcurrent,maxQueued}),
 };
}
