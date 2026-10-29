import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/gesture-cancel`);
 const result=await page.evaluate(async()=>{
  const {EditorMap}=await import('/editor/map-view.js'),cases=[];
  const fixture=()=>{const canvas=document.createElement('canvas');document.body.append(canvas);const actions=[],views=[];const map=new EditorMap(canvas,{}, {action:a=>actions.push(a),viewChanged:v=>views.push(v)});let paints=0;map.render=()=>paints++;return {map,canvas,actions,views,paints:()=>paints,close(){map.observer.disconnect();canvas.remove();}};};
  const cancel=(tool,event)=>{const f=fixture();try{Object.assign(f.map,{drag:{pan:tool==='pan',center:[32,32]},stroke:tool==='road'?new Map([['2,2',[2,2]]]):null,strokeLast:[2,2],routeStroke:tool==='route-path'?[[2,2],[3,2]]:null});f.map.view.tool=tool;if(tool==='pan')f.map.view.center=[300,-100];f.canvas.dispatchEvent(new PointerEvent(event,{pointerId:1}));if(tool==='pan'&&JSON.stringify(f.map.view.center)!=='[32,32]')throw Error('Interrupted pan left the camera outside its starting view');f.map.up({});if(f.map.drag||f.map.stroke||f.map.routeStroke||f.map.strokeLast)throw Error('Cancellation retained pending gesture state');if(f.actions.length||f.views.length)throw Error('Cancelled pointer gesture wrote an action or view');cases.push(event+':'+tool);}finally{f.close();}};
  for(const event of ['pointercancel','lostpointercapture'])for(const tool of ['pan','road','route-path','move'])cancel(tool,event);
  const f=fixture();try{
   f.map.drag={pan:false,building:{id:'shed'}};f.map.stroke=new Map([['2,2',[2,2]]]);f.map.strokeLast=[2,2];f.map.view.selection=['shed','storage'];
   if(!f.map.cancelGesture())throw Error('Active cancellation was not acknowledged');if(f.map.cancelGesture())throw Error('Idle cancellation claimed an active gesture');if(f.paints()!==1)throw Error('Cancellation repainted unnecessarily');if(JSON.stringify(f.map.view.selection)!=='["shed","storage"]')throw Error('Gesture cancellation lost the group selection');cases.push('idempotent-selected-move');
   f.map.drag={pan:true,center:[32,32]};f.map.view.center=[200,200];f.map.setTool('select');if(JSON.stringify(f.map.view.center)!=='[32,32]'||f.views.length!==1||f.paints()!==2)throw Error('Tool switch did not atomically cancel the old pan');cases.push('tool-switch');
   if(f.actions.length)throw Error('Cancelled move committed an authoring action');
  }finally{f.close();}
  return {cases,scope:'Actual editor pointercancel/lostpointercapture listeners plus gesture/tool-switch state contracts; not a physical input or performance benchmark'};
 });assert.equal(result.cases.length,10);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
