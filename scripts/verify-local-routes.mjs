import assert from 'node:assert/strict';
import {serve} from './serve.mjs';
const server=await serve(0), origin=`http://127.0.0.1:${server.address().port}`;
try {
 for(const [from,to] of [['/','/v2/menu.html'],['/v02/weekend/?mode=story','/v2/?mode=story'],['/v2/weekend/game.js','/v2/game.js'],['/v0.1/','/v1/'],['/v0.2/','/v2/'],['/v02/library/','/v2/library/']]){
  const r=await fetch(origin+from,{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),to);
 }
 for(const path of ['/v1/','/v2/','/v2/menu.html','/v2/library/','/v2/residents/','/v1/fonts/Outfit-VariableFont_wght.ttf']){
  const r=await fetch(origin+path);
  assert.equal(r.status,200,path);
 }
 const visited=new Set();
 async function module(path){
  if(visited.has(path))return;visited.add(path);
  const r=await fetch(origin+path);assert.equal(r.status,200,path);
  const text=await r.text();
  for(const match of text.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+|\/v[12]\/[^"']+)["']/g)){
   const url=new URL(match[1],origin+path);
   await module(url.pathname);
  }
 }
 await module('/v2/game.js');await module('/v2/library/catalog.js');
 const css=await(await fetch(origin+'/v2/weekend.css')).text();assert(!css.includes('../../fonts/'));
 for (const [,font] of css.matchAll(/url\("([^"]+\.ttf)"\)/g)) assert.equal((await fetch(new URL(font,origin+'/v2/weekend.css'))).status,200);
 console.log(`PASS: version routes, legacy redirects/query preservation, v1/v2 pages and ${visited.size} source modules.`);
} finally {server.close();}
