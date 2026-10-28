// Shared bounded async preparation. Leased entries cannot be evicted; release
// invalidates only that lease, and closing waits for in-flight work to settle.
export function createAppearanceLeaseCache({prepare,destroy,maxEntries=12,maxConcurrent=2,maxQueued=24}){
 if(typeof prepare!=='function'||typeof destroy!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>24||!Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>4||!Number.isInteger(maxQueued)||maxQueued<1||maxQueued>128)throw Error('Choose bounded appearance preparation limits.');
 const records=new Map(),queue=[];let active=0,closed=false,closing=null;
 const alive=()=>{if(closed)throw Error('This appearance library has been released.');};
 const remove=record=>{if(record.value!==null){const value=record.value;record.value=null;destroy(value);}};
 function drain(){while(!closed&&active<maxConcurrent&&queue.length){const job=queue.shift();active++;(async()=>{try{const value=await prepare(job.input);active--;job.resolve(value);}catch(error){active--;job.reject(error);}drain();})();}}
 return Object.freeze({
  async acquire(key,input){
   alive();if(typeof key!=='string'||!key.length||key.length>16384)throw Error('Use a bounded canonical appearance key.');let record=records.get(key);
   if(!record){
    if(records.size>=maxEntries){const victim=[...records].find(([,r])=>r.value!==null&&!r.users&&!r.waiters);if(!victim)throw Error('Release a character preview before preparing another appearance.');remove(victim[1]);records.delete(victim[0]);}
    if(active>=maxConcurrent&&queue.length>=maxQueued)throw Error('Character previews are busy. Try again after preparation finishes.');
    record={users:0,waiters:0,value:null,promise:null};const current=record;
    record.promise=new Promise((resolve,reject)=>queue.push({input,resolve,reject})).then(value=>{if(value===null||value===undefined)throw Error('Appearance preparation returned no value.');current.value=value;return value;}).catch(error=>{if(records.get(key)===current)records.delete(key);throw error;});records.set(key,record);drain();
   }else{records.delete(key);records.set(key,record);}
   record.waiters++;let value;try{value=await record.promise;alive();}finally{record.waiters--;}
   record.users++;let released=false;return Object.freeze({value,assertActive(){alive();if(released)throw Error('This appearance preview has been released.');},release(){if(released)return;released=true;record.users--;}});
  },
  info:()=>({entries:records.size,active,queued:queue.length,leases:[...records.values()].reduce((n,r)=>n+r.users,0),ready:[...records.values()].filter(r=>r.value!==null).length,maxEntries,maxConcurrent,maxQueued,closed}),
  dispose(){if(closing)return closing;closed=true;for(const job of queue.splice(0))job.reject(Error('This appearance library has been released.'));closing=(async()=>{await Promise.allSettled([...records.values()].map(r=>r.promise));for(const r of records.values())remove(r);records.clear();})();return closing;},
 });
}
