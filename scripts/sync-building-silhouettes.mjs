import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {allBuildingArt} from '../web/building-art.js';
import {readAlpha,alphaOutline,convexHull} from './lib/png-alpha.mjs';
const cache=new Map(),records={};
async function source(file){if(!cache.has(file)){const bytes=await readFile(new URL('../web/art/'+file,import.meta.url));cache.set(file,{image:readAlpha(bytes),hash:createHash('sha256').update(bytes).digest('hex')});}return cache.get(file);}
for(const [key,art] of Object.entries(allBuildingArt)){
  const day=await source(art.file),night=await source(art.nightFile);
  records[key]={day:day.hash,night:night.hash,hull:convexHull([...alphaOutline(day.image,art.cell),...alphaOutline(night.image,art.cell)])};
}
const output='// Generated from full day/night source alpha ≥32, matching the art studio.\n// Run node scripts/sync-building-silhouettes.mjs after changing a building PNG.\nexport const buildingSilhouettes = '+JSON.stringify(records)+';\n';
const file=new URL('../web/building-silhouettes.js',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==output)throw new Error('Building silhouettes are stale. Run node scripts/sync-building-silhouettes.mjs.');}
else await writeFile(file,output);
console.log('PASS: full day/night alpha outlines recorded for all '+Object.keys(records).length+' building variants.');
