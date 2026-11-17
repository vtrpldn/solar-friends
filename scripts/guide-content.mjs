import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const GUIDE_DIR='web/v02/weekend/guide';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const root=path.resolve(import.meta.dirname,'..');
export async function guideSnapshot(base=root){
 const files=new Set();
 // Every current runtime module is covered, including new modules. Follow local
 // imports into shared definitions; exclude only the Guide's own implementation.
 for(const f of await readdir(path.join(base,'web/v02/weekend')))if(f.endsWith('.js')&&!f.startsWith('guide'))files.add('web/v02/weekend/'+f);
 const pending=[...files];
 for(let i=0;i<pending.length;i++){
  const file=pending[i],source=await readFile(path.join(base,file),'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+\.js)["']/g)){
   const dep=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));
   if(path.posix.basename(dep).startsWith('guide')||files.has(dep))continue;
   files.add(dep);pending.push(dep);
  }
 }
 const sources={};for(const f of [...files].sort())sources[f]=digest(await readFile(path.join(base,f)));
 const raw=await readFile(path.join(base,GUIDE_DIR,'topics.json'),'utf8'),topics=JSON.parse(raw),assets={};
 for(const t of topics)assets[t.id+'.svg']=digest(await readFile(path.join(base,GUIDE_DIR,t.id+'.svg')));
 const content={topics:digest(raw),facts:digest(await readFile(path.join(base,'web/v02/weekend/guide-facts.js'))),renderer:digest(await readFile(path.join(base,'scripts/build-guide.mjs'))),dependencies:digest(await readFile(path.join(base,'package-lock.json')))};
 return {version:1,sources,content,assets};
}
export function guideDifferences(reviewed,current){
 const changes=[];
 for(const group of ['sources','content','assets'])for(const key of new Set([...Object.keys(reviewed[group]||{}),...Object.keys(current[group]||{})]))if(reviewed[group]?.[key]!==current[group]?.[key])changes.push(`${group}: ${key}`);
 return changes;
}
export async function verifyGuide(base=root){
 const topics=JSON.parse(await readFile(path.join(base,GUIDE_DIR,'topics.json'),'utf8'));
 const ids=new Set();
 for(const topic of topics){
  if(!/^[a-z0-9-]+$/.test(topic.id)||ids.has(topic.id))throw Error('Duplicate or invalid Guide topic');ids.add(topic.id);
  for(const field of ['title','description','diagram','tip'])if(!topic[field]?.trim())throw Error(`Missing ${field}: ${topic.id}`);
  if(!topic.sources?.length||!topic.tests?.length)throw Error(`Missing Guide coverage: ${topic.id}`);
  for(const f of topic.sources)await readFile(path.join(base,'web/v02/weekend',f));
  for(const t of topic.tests)await readFile(path.join(base,'scripts',`verify-v02-${t}.mjs`));
  const svg=await readFile(path.join(base,GUIDE_DIR,topic.id+'.svg'),'utf8');if(!svg.includes('<svg')||svg.includes('<script'))throw Error(`Invalid Guide diagram: ${topic.id}`);
 }
 const current=await guideSnapshot(base),reviewed=JSON.parse(await readFile(path.join(base,GUIDE_DIR,'reviewed.json'),'utf8'));
 const changes=guideDifferences(reviewed,current);
 if(changes.length)throw Error(`Guide review required:\n${changes.join('\n')}\nReview affected diagrams and tips, then run npm run guide:refresh -- --reviewed.`);
 return topics.length;
}
