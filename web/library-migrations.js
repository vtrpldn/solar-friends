const version=value=>Number.isSafeInteger(value)&&value>0&&value<=0xffffffff;
const author=value=>typeof value==='string'&&value.trim().length>0&&[...value].length<=80;
const compatibility=value=>value&&typeof value==='object'&&['game','ruleset','assets'].every(key=>version(value[key]));

// Enrich discovery metadata only. Never rewrite a village snapshot or draft,
// and read one candidate body at a time rather than materializing all saves.
export function enrichRunHeaders(transaction){
  const heads=transaction.objectStore('heads'),runs=transaction.objectStore('runs');
  const request=heads.index('kind').openCursor('run');
  request.onsuccess=()=>{
    const cursor=request.result;if(!cursor)return;
    const head=cursor.value;
    if(typeof head.id!=='string'||head.key!==`run:${head.id}`||head.sessionKind!=='scenario'||(author(head.author)&&version(head.contentRevision)&&compatibility(head.compatibility))){cursor.continue();return;}
    const read=runs.get(head.id);
    read.onsuccess=()=>{
      const record=read.result,release=record?.release;
      if(record?.format==='solar-friends-run'&&record.schema===1&&record.id===head.id&&release){
        const next={...head};let changed=false;
        for(const [key,source,valid] of [['author','author',author],['contentRevision','content_revision',version],['compatibility','compatibility',compatibility]]){
          if(!valid(head[key])&&valid(release[source])){next[key]=release[source];changed=true;}
        }
        if(changed)heads.put(next);
      }
      cursor.continue();
    };
  };
}
