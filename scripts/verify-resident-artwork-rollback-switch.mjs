import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-artwork-rollback-switch';await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/rollback-switch-check');
 const result=await page.evaluate(async()=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),{createResidentAppearanceLibrary}=await import('/resident-appearance-library.js');
  const check=(value,message)=>{if(!value)throw Error(message);},parts=createResidentPartLibrary(),a=residentPartRecipe(),b=residentPartRecipe({hair:'side-part-v1'}),c=residentPartRecipe({materials:{skin:'copper',shirt:'teal',shorts:'sage',shoes:'graphite'}});
  const pa=await parts.prepare(a),pb=await parts.prepare(b);parts.setActive([a]);const stale=parts.installPrepared([b],[pb]);const pc=await parts.prepare(c);parts.setActive([c]);check(stale()===false,'Late part rollback accepted after a cached active-cast switch');check(parts.provider(c)===pc,'Late rollback removed the switched village provider');
  const valid=parts.installPrepared([b],[pb]);parts.setActive([structuredClone(b),structuredClone(b)]);check(valid()===true&&valid()===false,'Equivalent pin refresh invalidated rollback or rollback repeated');check(parts.provider(c)===pc,'Valid rollback lost the previous current provider');
  const awayAndBack=parts.installPrepared([b],[pb]);parts.setActive([a]);parts.setActive([b]);check(awayAndBack()===false,'Switching away and back revived an old rollback');
  const library=createResidentAppearanceLibrary(),looks=['iara','bento','nina'].map(preset=>({preset,version:1})),providers=[];for(const look of looks)providers.push(await library.prepare(look));library.setActive([looks[0]]);const old=library.installPrepared([looks[1]],[providers[1]]);library.setActive([looks[2]]);check(old()===false,'Legacy cast switch accepted an obsolete rollback');check(library.provider(looks[2])===providers[2],'Legacy switch lost its provider');
  const undo=library.installPrepared([looks[1]],[providers[1]]);library.setActive([structuredClone(looks[1])]);check(undo()===true&&undo()===false,'Legacy rollback failed or repeated after an equivalent refresh');
  const reordered=library.installPrepared([looks[0],looks[1]],[providers[0],providers[1]]);library.setActive([structuredClone(looks[1]),structuredClone(looks[0]),structuredClone(looks[1])]);check(reordered()===true,'Reordered equivalent cast invalidated a valid rollback');
  return {partCachedSwitchProtected:true,legacyCachedSwitchProtected:true,equivalentRefreshPreservesRollback:true,awayAndBackRefusesOldRollback:true,reorderedEquivalentCastSupported:true,exactProviderIdentityPreserved:true,partCacheEntries:parts.cacheInfo().entries};
 });assert.deepEqual(errors,[]);assert.equal(result.partCacheEntries,3);result.inputs={};for(const file of ['web/resident-parts.js','web/resident-appearance-library.js','scripts/verify-resident-artwork-rollback-switch.mjs'])result.inputs[file]=createHash('sha256').update(await readFile(file)).digest('hex');result.scope='Real prepared part/legacy providers across cached cast activation changes and rollback; not every player session transition or total memory acceptance.';await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
