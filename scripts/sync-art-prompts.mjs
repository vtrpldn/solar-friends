import { readFile, writeFile } from 'node:fs/promises';
const sources = ['assets/art-direction/artwork-consistency.md','assets/art-direction/house-variation-prompts.json','assets/art-direction/art-polish-prompts.json','assets/art-direction/quest-building-prompts.md','assets/art-direction/chicken-coop-prompt.md','web/art/README.md'];
const records=Object.fromEntries(await Promise.all(sources.map(async file=>[file,await readFile(new URL('../'+file,import.meta.url),'utf8')])));
const text=JSON.stringify(records,null,2)+'\n';
const target=new URL('../web/artwork/prompt-records.json',import.meta.url);
if(process.argv.includes('--check')) {
  if(await readFile(target,'utf8')!==text)throw new Error('Artwork prompt records are stale. Run node scripts/sync-art-prompts.mjs.');
} else await writeFile(target,text);
