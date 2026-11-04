import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import init,{Game} from '../web/pkg/solar_friends.js';
import {EditorDocument} from '../web/editor/document.js';
import {maximumHistoryBase,historyFixture} from './maximum-history-fixture.mjs';
const output=process.argv[2]??'artifacts/compound-history-restore';
await mkdir(output,{recursive:true});
await writeFile(output+'/report.json',JSON.stringify({passed:false,status:'running'})+'\n');
await init({module_or_path:await readFile('web/pkg/solar_friends_bg.wasm')});
const game=new Game();let base;
try{base=maximumHistoryBase(game).definition;}finally{game.free();}
const {checkpoint,summary}=historyFixture(base,'compound');
const original=structuredClone(checkpoint);let yields=0;
const doc=await EditorDocument.restoreAsync(checkpoint,{yieldControl:async()=>{yields++;}});
assert.deepEqual(doc.checkpoint(),original);assert(!doc.historyRecovered);
const expected=stage=>{const d=structuredClone(base);d.title='Compound history step '+stage;for(let i=0;i<1080;i++)d.map.terrain[i].fertility=stage%2?.25:.75;return d;};
function check(stage){assert.deepEqual(doc.value,expected(stage));const h=doc.checkpoint().history;assert.equal(h.past.length+h.future.length,64);const bytes=Buffer.byteLength(JSON.stringify(h));assert(bytes>7.5*1024*1024&&bytes<8*1024*1024);}
for(let n=1;n<=64;n++){assert(doc.undo());check(80-n);}assert(!doc.undo());
for(let n=1;n<=64;n++){assert(doc.redo());check(16+n);}assert(!doc.redo());
assert(doc.undo());const sync=EditorDocument.restore(doc.checkpoint());
for(const instance of [doc,sync])instance.transact('Branch after restoration',d=>{d.title='New direction';});
assert.deepEqual(doc.checkpoint(),sync.checkpoint());assert(!doc.redo());
const reloaded=await EditorDocument.restoreAsync(doc.checkpoint());assert(!reloaded.historyRecovered);assert.deepEqual(reloaded.checkpoint(),doc.checkpoint());
assert.deepEqual(checkpoint,original);
const files=['web/editor/document.js','scripts/maximum-history-fixture.mjs','scripts/verify-compound-history-restore.mjs','web/pkg/solar_friends_bg.wasm'];
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
await writeFile(output+'/report.json',JSON.stringify({passed:true,summary,yields,checks:['64 Undo and 64 Redo against independently constructed whole definitions','both limits hold throughout traversal','branch clears future and matches synchronous restore','exact reload and caller checkpoint preservation'],scope:'Document and native-valid fixture check; not public gestures or browser responsiveness.',sources},null,2)+'\n');
console.log('PASS simultaneous 64-step near-8-MiB restoration, full independent replay, branch/cache parity and reload.');
