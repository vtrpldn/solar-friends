import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const output=process.argv[2]??'/tmp/solar-terrain-worker';await mkdir(output,{recursive:true});
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const result=await page.evaluate(async()=>{
  const {Game}=await import('/pkg/solar_friends.js'),{paintTerrain}=await import('/terrain.js'),{prepareTerrain}=await import('/editor/prepare-terrain.js'),{EditorMap,loadEditorArt}=await import('/editor/map-view.js'),{terrainInputs}=await import('/editor/terrain-cache.js');
  const game=new Game(),art=await loadEditorArt(),cases=[];
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const pixels=canvas=>canvas.getContext('2d').getImageData(0,0,4096,4096).data;
  const wait=async test=>{const until=performance.now()+30000;while(!test()){if(performance.now()>until)throw Error('Landscape did not settle');await new Promise(r=>setTimeout(r,10));}};
  try{
   for(const biome of ['mata-atlantica','cerrado','caatinga'])for(const roads of [[],[[30,30],[31,30],[32,30]]]){
    const map=JSON.parse(game.generate_biome_property(biome,42));if(!roads.length)map.river=null;
    const request={map,roads,soil:[[30,30,.4,.2,.5]],seed:42};
    const expected=paintTerrain(art.terrain,roads,[],request.soil,42,map),expectedPixels=pixels(expected),expectedHash=await hash(expectedPixels);expected.width=expected.height=0;
    let last=performance.now(),maxGap=0;const interval=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;},5),start=performance.now();
    const bitmap=await prepareTerrain(request);const elapsedMs=performance.now()-start;
    clearInterval(interval);const canvas=document.createElement('canvas');canvas.width=canvas.height=4096;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    const actualPixels=pixels(canvas),actualHash=await hash(actualPixels);canvas.width=canvas.height=0;
    if(actualHash!==expectedHash){let channels=0,maxDelta=0;const bounds=[4096,4096,0,0];for(let i=0;i<actualPixels.length;i++){const delta=Math.abs(actualPixels[i]-expectedPixels[i]);if(delta){channels++;maxDelta=Math.max(maxDelta,delta);const pixel=i>>2,x=pixel%4096,y=Math.floor(pixel/4096);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}}throw Error('Worker pixels differ: '+JSON.stringify({biome,roads:roads.length,channels,maxDelta,bounds}));}
    cases.push({biome,roads:roads.length,river:map.river!==null,pixelHash:actualHash,elapsedMs,maxTimerGapMs:maxGap});
   }
   // Real interactive renderer: supersede a pending paint, accept only the
   // latest land, then undo to the already displayed terrain while painting.
   const definition=JSON.parse(game.scenario_template('sandbox'));definition.map=JSON.parse(game.generate_biome_property('mata-atlantica',42));
   const snapshotFor=d=>{const report=JSON.parse(game.load_scenario(JSON.stringify(d)));if(!report.ok)throw Error(JSON.stringify(report));return JSON.parse(game.report_state());};
   let snapshot=snapshotFor(definition);await Promise.all(snapshot.residents.map(r=>art.appearances.prepare(r.appearance)));
   const canvas=document.createElement('canvas');canvas.style.cssText='width:900px;height:600px';document.body.append(canvas);
   let ready=0;const mapView=new EditorMap(canvas,art,{action:()=>{},viewChanged:()=>{},onTerrainReady:()=>ready++});
   const start=performance.now();mapView.set(definition,snapshot);const initialSetMs=performance.now()-start;
   if(!mapView.terrainLoading||canvas.getAttribute('aria-busy')!=='true')throw Error('Initial terrain does not report pending');
   const oldTask=mapView.terrainTask,latest=structuredClone(definition);latest.map=JSON.parse(game.generate_biome_property('caatinga',77));snapshot=snapshotFor(latest);mapView.set(latest,snapshot);
   if(!oldTask.controller.signal.aborted)throw Error('Superseded paint was not aborted');
   await wait(()=>!mapView.terrainLoading);
   if(mapView.terrainError||mapView.groundKey!==terrainInputs(latest,snapshot).key||ready!==1)throw Error('Wrong landscape installed');
   const displayed=mapView.ground,oldDefinition=structuredClone(definition);mapView.set(oldDefinition,snapshotFor(oldDefinition));const undoTask=mapView.terrainTask;
   mapView.set(latest,snapshot);if(!undoTask.controller.signal.aborted||mapView.ground!==displayed||mapView.terrainLoading)throw Error('Undo did not reuse displayed ground and cancel obsolete work');
   await new Promise(r=>setTimeout(r,700));if(mapView.ground!==displayed||ready!==1)throw Error('Late obsolete terrain installed');
   const {creationThumbnail}=await import('/editor/thumbnail.js');let thumbnailGround;const render=EditorMap.prototype.render;
   EditorMap.prototype.render=function(...args){const result=render.apply(this,args);if(this.preview)thumbnailGround=this.ground;return result;};
   try{creationThumbnail(latest,snapshot,art);}finally{EditorMap.prototype.render=render;}
   if(thumbnailGround!==displayed)throw Error('Thumbnail repainted completed worker terrain');
   mapView.observer.disconnect();canvas.remove();
   const fallbackCanvas=document.createElement('canvas');fallbackCanvas.style.cssText='width:900px;height:600px';document.body.append(fallbackCanvas);
   const fallback=new EditorMap(fallbackCanvas,{...art},{action:()=>{},viewChanged:()=>{}}),WorkerClass=globalThis.Worker;
   try{globalThis.Worker=undefined;fallback.set(latest,snapshot);if(fallback.terrainLoading||!fallback.ground||fallback.groundKey!==terrainInputs(latest,snapshot).key)throw Error('Synchronous capability fallback failed');}
   finally{globalThis.Worker=WorkerClass;fallback.observer.disconnect();fallbackCanvas.remove();}
   // Request lifecycle failures: no unhandled rejection, late bitmap leak,
   // or worker surviving abort, malformed data, startup/clone error or timeout.
   const lifecycle=[];
   for(const kind of ['pre-abort','factory-abort','abort','invalid','empty-response','worker-error','message-error','clone-error','timeout']){
    const controller=new AbortController();let terminated=0,created=0,closed=0,fake;
    if(kind==='pre-abort')controller.abort();
    const workerFactory=()=>{created++;fake={terminate:()=>terminated++,postMessage:()=>{if(kind==='clone-error')throw new DOMException('Cannot clone','DataCloneError');}};if(kind==='factory-abort')controller.abort();return fake;};
    const promise=prepareTerrain({}, {signal:controller.signal,workerFactory,timeoutMs:kind==='timeout'?5:1000}).then(()=>{throw Error('Invalid painter unexpectedly succeeded');},e=>e.name);
    if(kind==='abort')controller.abort();
    if(kind==='invalid')fake.onmessage({data:{bitmap:{width:1,height:1,close:()=>closed++}}});
    if(kind==='empty-response')fake.onmessage({data:null});
    if(kind==='worker-error')fake.onerror({preventDefault(){}});
    if(kind==='message-error')fake.onmessageerror();
    await promise;
    if(kind==='abort'){fake.onmessage({data:{bitmap:{width:4096,height:4096,close:()=>closed++}}});if(closed!==1)throw Error('Late bitmap not closed');}
    if(created!==(kind==='pre-abort'?0:1)||terminated!==created)throw Error('Worker lifecycle leak: '+kind);
    if(kind==='invalid'&&closed!==1)throw Error('Invalid bitmap not closed');lifecycle.push(kind);
   }
   return {cases,interactive:{initialSetMs,supersededPaintAborted:true,latestLandInstalled:true,undoCancelsPending:true,lateResultsIgnored:true,thumbnailSharesCompletedGround:true,synchronousCapabilityFallback:true},lifecycle};
  }finally{game.free();}
 });
 assert.equal(result.cases.length,6);assert.deepEqual(errors,[]);
 result.sourceHashes=Object.fromEntries(await Promise.all(['web/terrain.js','web/terrain-paint-worker.js','web/editor/prepare-terrain.js','web/editor/terrain-cache.js','web/editor/map-view.js','web/editor/index.js'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
 await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
