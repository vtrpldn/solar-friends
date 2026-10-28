// Stage a closed versioned bundle. This does not add it to player recipes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='assets/art-direction/character-prototype-v1/sleep-body-study-v2/family-v2',output='web/art/characters/relaxed-sleep-v1',read=async p=>JSON.parse(await readFile(p)),sha=b=>createHash('sha256').update(b).digest('hex'),internal=await read(root+'/definition-v1.json');await mkdir(output,{recursive:true});
assert.equal(Object.keys(internal.sources).length,136);assert.equal(Object.keys(internal.bodySources).length,5);assert.equal(internal.accessories.schema,2);assert.equal(internal.clothing.length,48);
const sources={};for(const [file,source]of Object.entries(internal.sources)){
 assert(/^[a-z0-9-]+\.png$/.test(file));const bytes=await readFile(source.path);assert.equal(sha(bytes),source.sha256);let url;
 if(source.path.startsWith('web/art/characters/'))url=source.path.slice(3);
 else{assert(source.path.startsWith('assets/art-direction/character-prototype-v1/'));await copyFile(source.path,output+'/'+file);assert.equal(sha(await readFile(output+'/'+file)),source.sha256);url='/art/characters/relaxed-sleep-v1/'+file;}
 sources[file]={url,sha256:source.sha256};
}
const {schema,status,sources:_sources,...registrations}=internal,bundle={schema:3,id:'relaxed-sleep-v1',...registrations,sources},bytes=JSON.stringify(bundle,null,2)+'\n';await writeFile(output+'/bundle-v1.json',bytes);
const descriptor={id:bundle.id,url:'/art/characters/relaxed-sleep-v1/bundle-v1.json',sha256:sha(bytes),maximumBytes:6291456};await writeFile('web/character-sleep-family-bundle-index.js','// Staged bundle; public appearance catalogs do not select this revision yet.\nexport const bundledSleepFamily=Object.freeze('+JSON.stringify(descriptor)+');\n');
await writeFile(root+'/bundle-staging-v1.json',JSON.stringify({descriptor,sourceCount:136,newSourceCount:5,internalDefinitionSha256:sha(await readFile(root+'/definition-v1.json')),publicRecipeActivation:false,scope:'Byte-identical source packaging and closed bundle staging; loader/player integration acceptance pending.'},null,2)+'\n');console.log(JSON.stringify(descriptor));
