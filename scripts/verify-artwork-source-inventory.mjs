import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {catalog} from '../web/artwork/catalog.js';
import {artworkSourceInventory,verifyArtworkSourceInventory} from './lib/artwork-source-inventory.mjs';
const actual=verifyArtworkSourceInventory(fileURLToPath(new URL('../web/art/',import.meta.url)),catalog,JSON.parse(readFileSync(new URL('../assets/art-direction/source-inventory-v1.json',import.meta.url))));
const root=mkdtempSync(join(tmpdir(),'solar-art-inventory-'));
try{
 const bytes=Buffer.from('controlled source bytes; this test covers identity, not PNG decoding'),hash=createHash('sha256').update(bytes).digest('hex');
 const source=`source-${hash}.png`,bundlePath=join(root,'characters/broad-v1/bundle-v1.json'),copy=join(root,'characters/broad-v1',source),original=join(root,'characters/prototype-v1/tool.png');
 mkdirSync(join(root,'characters/broad-v1'),{recursive:true});mkdirSync(join(root,'characters/prototype-v1'),{recursive:true});writeFileSync(copy,bytes);writeFileSync(original,bytes);
 const bundle={schema:3,sources:{tool:{path:source,sha256:hash}}};writeFileSync(bundlePath,JSON.stringify(bundle));
 const expected=artworkSourceInventory(root,[]);assert.equal(expected.records.length,2);assert.equal(expected.aliases.length,1);verifyArtworkSourceInventory(root,[],expected);
 const missing=structuredClone(expected);missing.records.pop();assert.throws(()=>verifyArtworkSourceInventory(root,[],missing),/inventory changed/);
 writeFileSync(copy,'changed source');assert.throws(()=>artworkSourceInventory(root,[]),/Changed bundled source/);writeFileSync(copy,bytes);
 writeFileSync(join(root,'unregistered.png'),'new file');assert.throws(()=>artworkSourceInventory(root,[]),/Uncatalogued artwork/);rmSync(join(root,'unregistered.png'));
 writeFileSync(join(root,'characters/prototype-v1/accidental-copy.png'),bytes);assert.throws(()=>artworkSourceInventory(root,[]),/Unexpected duplicate artwork/);rmSync(join(root,'characters/prototype-v1/accidental-copy.png'));
 rmSync(bundlePath);assert.throws(()=>artworkSourceInventory(root,[]),/Unexpected duplicate artwork/);writeFileSync(bundlePath,JSON.stringify(bundle));
 bundle.sources.tool.path='../escape.png';writeFileSync(bundlePath,JSON.stringify(bundle));assert.throws(()=>artworkSourceInventory(root,[]),/Unsafe bundled artwork/);
 delete bundle.sources.tool.path;bundle.sources.tool.url='/art/characters/broad-v1/'+source;writeFileSync(bundlePath,JSON.stringify(bundle));verifyArtworkSourceInventory(root,[],expected);
 bundle.sources.tool.url='/art/characters/broad-v1/../prototype-v1/tool.png';writeFileSync(bundlePath,JSON.stringify(bundle));assert.throws(()=>artworkSourceInventory(root,[]),/Unsafe bundled artwork/);
 console.log(`PASS ${actual.records.length} current sources and ${actual.aliases.length} declared aliases; controls reject missing inventory records, changed bytes, unregistered files, accidental named copies and unsafe paths. Both supported bundle source formats covered.`);
}finally{rmSync(root,{recursive:true,force:true});}
