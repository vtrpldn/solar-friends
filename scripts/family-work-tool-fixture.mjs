import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
export const workToolOutput='assets/art-direction/character-prototype-v1/body-family-relaxed-v1/work-tool-v1';
export const workFileSha=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function familyWorkToolFixture(){
 const read=async file=>JSON.parse(await readFile(file)),bundle=await read('web/art/characters/relaxed-v1/bundle-v1.json'),manifest=await read(workToolOutput+'/cycle-sources-v1.json'),served=new Map(),workSources={};assert.equal(manifest.poses.length,4);
 for(const [slot,pose]of manifest.poses.entries()){assert.equal(pose.index,slot+4);assert(!Object.hasOwn(bundle.sources,pose.file));const bytes=await readFile(workToolOutput+'/'+pose.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),pose.sha256);assert.equal(pose.registration.source.sha256,pose.sha256);served.set('/work-tool-source/'+pose.file,bytes);workSources[pose.file]={url:'/work-tool-source/'+pose.file,sha256:pose.sha256};}
 return {served,data:{bundle,workEquipment:manifest.poses.map(p=>p.registration),workSources},hashes:{bundle:await workFileSha('web/art/characters/relaxed-v1/bundle-v1.json'),workManifest:await workFileSha(workToolOutput+'/cycle-sources-v1.json')}};
}
