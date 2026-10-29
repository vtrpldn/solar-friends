import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {catalog} from '../web/artwork/catalog.js';
import {artworkSourceInventory,verifyArtworkSourceInventory} from './lib/artwork-source-inventory.mjs';
const root=fileURLToPath(new URL('../web/art/',import.meta.url)),file=new URL('../assets/art-direction/source-inventory-v1.json',import.meta.url);
if(process.argv.includes('--write')){const inventory=artworkSourceInventory(root,catalog);writeFileSync(file,JSON.stringify(inventory,null,2)+'\n');console.log(`Wrote ${inventory.records.length} source inventory records; this does not accept artwork visually.`);}
else{const inventory=verifyArtworkSourceInventory(root,catalog,JSON.parse(readFileSync(file)));console.log(`PASS ${inventory.records.length} inventoried sources and ${inventory.aliases.length} declared bundle alias groups.`);}
