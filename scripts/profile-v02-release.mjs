// Repeatable desktop profile of a recorded village; never changes the source save.
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {rewriteSiteText} from './site-routes.mjs';
import {STORY_SAVE} from '../web/v02/weekend/modes.js';
const out=process.env.PROFILE_OUTPUT||'/tmp/solar-performance/baseline';
await mkdir(out,{recursive:true});
const s=JSON.parse(await readFile(process.env.PROFILE_SAVE||'docs/releases/evidence/2026-11-17-production-save.json','utf8'));
s.view={...s.view,paused:true,speed:1};
const source=process.env.PROFILE_GAME_REVISION?execFileSync('git',['show',`${process.env.PROFILE_GAME_REVISION}:web/v02/weekend/game.js`],{encoding:'utf8'}):await readFile('web/v02/weekend/game.js','utf8');
const sourceHash=createHash('sha256').update(source).digest('hex');
const server=await serve(),browser=await chromium.launch({headless:true,args:['--mute-audio',...(process.env.SOLAR_RENDERER?[`--use-angle=${process.env.SOLAR_RENDERER}`]:[])]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript(({key,save})=>{localStorage.setItem(key,save);localStorage.setItem('solar-friends-audio','{"music":0,"effects":0}');},{key:STORY_SAVE,save:JSON.stringify(s)});
 await page.route('**/v2/game.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:rewriteSiteText(source,'v2/game.js')}));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
 const results=[];
 for(const mode of (process.env.PROFILE_MODES||'paused,1x,16x').split(',')){
  await page.goto(`http://127.0.0.1:${server.address().port}/v2/?mode=story&performance=1`);
  await page.locator('#performance').waitFor();await page.waitForTimeout(6000);
  if(mode!=='paused'){await page.keyboard.press(mode==='1x'?'1':'4');await page.locator('#pause').click();}
  await page.waitForTimeout(2000);await cdp.send('Profiler.start');
  const measured=await page.evaluate(async()=>{const gl=document.querySelector('#world').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');const renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);const frames=[];const start=performance.now();let previous=start;while(performance.now()-start<20000){const now=await new Promise(requestAnimationFrame);frames.push(now-previous);previous=now;}frames.sort((a,b)=>a-b);return {renderer,frames:frames.length,meanMs:frames.reduce((a,b)=>a+b,0)/frames.length,p95Ms:frames[Math.floor(frames.length*.95)],heapBytes:performance.memory?.usedJSHeapSize,readout:document.querySelector('#performance').innerText};});
  const {profile}=await cdp.send('Profiler.stop');await writeFile(`${out}/${mode}.cpuprofile`,JSON.stringify(profile));
  const nodes=new Map(profile.nodes.map(n=>[n.id,n.callFrame])),totals=new Map();profile.samples.forEach((id,i)=>totals.set(id,(totals.get(id)||0)+(profile.timeDeltas[i]||0)));
  const top=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([id,us])=>({function:nodes.get(id).functionName,url:nodes.get(id).url.replace(/^http.*?\/v2\//,'v2/'),line:nodes.get(id).lineNumber+1,ms:us/1000}));
  const result={mode,sourceHash,sourceRevision:process.env.PROFILE_GAME_REVISION||'working-tree',...measured,top};results.push(result);console.log(JSON.stringify(result));await writeFile(`${out}/report.json`,JSON.stringify(results,null,2));
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
