import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bindComposedRuntimeRaster} from '../web/character-runtime-binding.js';
import {canonical} from '../web/editor/journal.js';
const source=JSON.parse(await readFile('web/art/characters/broad-v1/bundle-v1.json')),runtime=structuredClone(source.materials.body),definition=structuredClone(source);
for(const sheet of ['base','idle','activities'])for(let i=0;i<16;i++)runtime.frames[sheet][i]=(i%2?'a':'b').repeat(64);
const before=canonical(definition),rebound=bindComposedRuntimeRaster(definition,{binding:runtime});assert(rebound>5);assert.notEqual(canonical(definition),before);assert.equal(canonical(definition.ownership),canonical(source.ownership));
for(const hair of Object.values(definition.hairstyles))for(const p of hair.registration.poses)assert.equal(p.bodyFrameSha256,runtime.frames[p.sheet][p.index]);
for(const p of definition.hat.poses)assert.equal(p.bodyFrameSha256,runtime.frames[p.sheet][p.index]);
let refusals=0;for(const mutate of [
 d=>d.ownership.sources.walk.sha256='0'.repeat(64),
 d=>d.ownership.sources.walk.transform.registration.uniformScale=.4,
 d=>d.hat.body.frames.base[0]='0'.repeat(64),
 d=>d.hairstyles['side-part-v1'].registration.poses[2].bodyFrameSha256='0'.repeat(64),
 d=>d.hairstyles['side-part-v1'].registration.poses[2].index=99,
]){const d=structuredClone(source);mutate(d);const prior=canonical(d);assert.throws(()=>bindComposedRuntimeRaster(d,{binding:runtime}));assert.equal(canonical(d),prior);refusals++;}
console.log(JSON.stringify({rebound,refusals,sourceOwnershipUnchanged:true,componentAndPoseHashesRebound:true,rejectionsAtomic:true}));
