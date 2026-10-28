import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),definition=JSON.parse(await readFile('assets/art-direction/character-prototype-v1/body-broad-v1/composed-family-draft-v5.json')),root='web/art/characters/broad-v1';
definition.id='broad-v1';await mkdir(root,{recursive:true});
for(const [key,source]of Object.entries(definition.sources)){const bytes=await readFile(source.path);assert.equal(hash(bytes),source.sha256);const file=`source-${source.sha256}.png`,target=`${root}/${file}`;try{assert.equal(hash(await readFile(target)),source.sha256);}catch(error){if(error.code!=='ENOENT')throw error;await copyFile(source.path,target);}definition.sources[key]={path:file,sha256:source.sha256};}
const bytes=Buffer.from(JSON.stringify(definition)+'\n');const target=`${root}/bundle-v1.json`;try{assert.equal(hash(await readFile(target)),hash(bytes),'Never replace a published bundle revision.');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(target,bytes);}
await writeFile('web/character-broad-family-bundle-index.js',`// Immutable artwork descriptor. Recipes cannot select URLs.\nexport const bundledBroadFamily=Object.freeze(${JSON.stringify({id:'broad-v1',url:'/art/characters/broad-v1/bundle-v1.json',sha256:hash(bytes)})});\n`);console.log(JSON.stringify({sources:Object.keys(definition.sources).length,bytes:bytes.length,sha256:hash(bytes)}));
