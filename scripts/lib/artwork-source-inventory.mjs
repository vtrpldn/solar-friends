import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function artworkSourceInventory(root,catalog){
 const files=readdirSync(root,{recursive:true}).filter(p=>/\.(png|svg)$/.test(p)).sort();
 const catalogued=new Set(catalog.map(s=>s.file.replace('../art/',''))),bundled=new Map();
 for(const path of readdirSync(root,{recursive:true}).filter(p=>/^characters\/.+\/bundle-v\d+\.json$/.test(p)).sort()){
  const bundle=JSON.parse(readFileSync(join(root,path)));
  for(const source of Object.values(bundle.sources??{})){
   assert(typeof source.path==='string'?/^[a-z0-9-]+\.png$/.test(source.path):typeof source.url==='string'&&/^\/art\/characters\/[a-z0-9-]+\/[a-z0-9-]+\.png$/.test(source.url),`Unsafe bundled artwork: ${path}`);
   assert(/^[a-f0-9]{64}$/.test(source.sha256),`Missing bundled source hash: ${path}`);
   const file=source.path?join(dirname(path),source.path):source.url.slice('/art/'.length);assert.equal(sha(readFileSync(join(root,file))),source.sha256,`Changed bundled source: ${file}`);
   bundled.set(file,[...(bundled.get(file)??[]),path]);
  }
 }
 const records=files.map(file=>{
  assert(catalogued.has(file)||/^characters\/(prototype-v1|broad-v1|relaxed-v1|relaxed-work-v1|relaxed-shirt-v1|relaxed-sleep-v1)\/[a-z0-9-]+\.png$/.test(file),`Uncatalogued artwork: ${file}`);
  return {file,sha256:sha(readFileSync(join(root,file))),role:catalogued.has(file)?'sprite-catalog':bundled.has(file)?'versioned-character-bundle':'character-source-or-study',bundles:bundled.get(file)??[]};
 });
 const groups=new Map();for(const record of records)groups.set(record.sha256,[...(groups.get(record.sha256)??[]),record]);
 const aliases=[];
 for(const [hash,group]of groups)if(group.length>1){
  // Bundles deliberately retain independently owned, content-addressed copies.
  // At most one ordinary named original may accompany those verified copies.
  const copies=group.filter(r=>r.file.endsWith(`/source-${hash}.png`)&&r.bundles.length);
  assert(group.length-copies.length<=1,`Unexpected duplicate artwork: ${group.map(r=>r.file).join(', ')}`);
  aliases.push({sha256:hash,files:group.map(r=>r.file)});
 }
 return {schema:1,scope:'Source inventory and declared bundle alias integrity only; no visual acceptance or proof that every retained study is active.',records,aliases};
}

export function verifyArtworkSourceInventory(root,catalog,expected){
 const actual=artworkSourceInventory(root,catalog);
 assert.deepEqual(actual,expected,'Artwork source inventory changed; inspect additions/changes and rebuild the inventory explicitly. This is not visual acceptance.');
 return actual;
}
