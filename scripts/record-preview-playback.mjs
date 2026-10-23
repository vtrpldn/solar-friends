import {writeFile} from 'node:fs/promises';
// Record the public preview button, then inspect decoded samples from the video.
export async function recordPreviewPlayback(page,{prefix,duration,output,stem}){
 await page.locator(prefix+'-time').fill('0');await page.locator(prefix+'-time').dispatchEvent('input');await page.waitForFunction(prefix=>document.querySelector(prefix+'-review').dataset.ready==='true',prefix);
 const worldHash=()=>page.locator(prefix+'-review .body-review-scenes canvas').first().evaluate(async c=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',c.getContext('2d').getImageData(0,0,c.width,c.height).data))].map(n=>n.toString(16).padStart(2,'0')).join('')),firstHash=await worldHash();
 await page.evaluate(({prefix,duration})=>{
  const canvas=document.querySelector(prefix+'-review .body-review-scenes canvas'),stream=canvas.captureStream(24),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:1200000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.previewRecording={stream,recorder,chunks,prefix,duration};recorder.start();document.querySelector(prefix+'-play').click();
 },{prefix,duration});
 await page.waitForFunction(()=>{const {prefix,duration}=window.previewRecording;return document.querySelector(prefix+'-play').getAttribute('aria-pressed')==='false'&&Number(document.querySelector(prefix+'-time').value)===duration&&document.querySelector(prefix+'-review').dataset.ready==='true';});
 const lastHash=await worldHash();if(lastHash!==firstHash)throw Error('Preview did not return to its exact initial world frame.');
 const result=await page.evaluate(async()=>{
  const {stream,recorder,chunks,duration}=window.previewRecording;stream.getVideoTracks()[0].requestFrame();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:'video/webm'}),bytes=new Uint8Array(await blob.arrayBuffer()),url=URL.createObjectURL(blob),video=document.createElement('video');video.src=url;video.muted=true;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
  const count=Math.max(8,Math.ceil(duration*4)),board=document.createElement('canvas');board.width=1800;board.height=Math.ceil((count+1)/6)*166;const ctx=board.getContext('2d');ctx.fillStyle='#e3e5cd';ctx.fillRect(0,0,board.width,board.height);const samples=[];
  for(let i=0;i<=count;i++){
   const seconds=i===count?duration+.25:i*duration/count+.01;
   await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Recorded preview frame seek timed out')),10000);video.onseeked=()=>{clearTimeout(timeout);resolve();};video.currentTime=seconds;});
   const x=i%6*300,y=Math.floor(i/6)*166;ctx.drawImage(video,x,y,300,140);ctx.fillStyle='#304435';ctx.font='12px sans-serif';ctx.fillText(i===count?'Final recorded frame':seconds.toFixed(3)+' recorded seconds',x+5,y+157);samples.push(seconds);
  }
  URL.revokeObjectURL(url);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {bytes:btoa(binary),board:board.toDataURL('image/png').split(',')[1],samples};
 });
 await writeFile(output+'/'+stem+'.webm',Buffer.from(result.bytes,'base64'));await writeFile(output+'/'+stem+'-frames.png',Buffer.from(result.board,'base64'));return {duration,samples:result.samples,firstWorldSha256:firstHash,lastWorldSha256:lastHash,exactLoopReturn:true};
}
