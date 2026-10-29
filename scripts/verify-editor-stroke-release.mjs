import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/stroke-release`);
 const result=await page.evaluate(async()=>{
  const {EditorMap}=await import('/editor/map-view.js'),cases=[];
  const finish=({tool,end=[5,2],route=null,cells=[[2,2]],last=[2,2],pan=false})=>{
   const actions=[],map=Object.create(EditorMap.prototype);Object.assign(map,{view:{tool,center:[32,32]},drag:{pan},stroke:route?null:new Map(cells.map(p=>[p.join(','),p])),strokeLast:last,routeStroke:route,brushSize:3,point:e=>e,cell:()=>({x:end[0],y:end[1]}),action:a=>actions.push(a),centerAt(){},render(){}});map.up({});map.up({});return {actions,drag:map.drag,stroke:map.stroke,route:map.routeStroke};
  };
  for(const tool of ['road','meadow','river','nature','thin-nature','habitat']){
   const r=finish({tool});if(r.actions.length!==1||JSON.stringify(r.actions[0].cells)!==JSON.stringify([[2,2],[3,2],[4,2],[5,2]]))throw Error(`${tool} omitted the pointer-release endpoint`);if(r.drag||r.stroke)throw Error('Committed stroke retained gesture state');cases.push(tool);
  }
  let r=finish({tool:'route-path',route:[[2,2]],end:[5,2]});if(r.actions.length!==1||JSON.stringify(r.actions[0].cells)!==JSON.stringify([[2,2],[3,2],[4,2],[5,2]]))throw Error('Utility route omitted release endpoint');cases.push('route-path');
  r=finish({tool:'route-path',route:[[2,2],[3,2],[4,2]],end:[2,2]});if(JSON.stringify(r.actions[0].cells)!==JSON.stringify([[2,2]]))throw Error('Release backtracking did not shorten the route');cases.push('route-backtracking');
  r=finish({tool:'road',cells:[[2,2],[3,2],[4,2],[5,2]],last:[5,2]});if(r.actions[0].cells.length!==4)throw Error('Release duplicated an already sampled endpoint');cases.push('sampled-endpoint');
  r=finish({tool:'road',pan:true});if(r.actions.length)throw Error('Panning committed a paint stroke');cases.push('pan');
  r=finish({tool:'route-path',route:[[2,2]],end:[4,4]});if(JSON.stringify(r.actions[0].cells)!==JSON.stringify([[2,2],[3,2],[4,2],[4,3],[4,4]]))throw Error('Release omitted the utility corridor corner');cases.push('route-corner');
  r=finish({tool:'road',end:[1e6,2]});if(JSON.stringify(r.actions[0].cells.at(-1))!==JSON.stringify([63,2])||r.actions[0].cells.length!==62)throw Error('Outside release was not bounded to the map');cases.push('outside-brush');
  r=finish({tool:'route-path',route:[[2,2]],end:[1e6,1e6]});if(JSON.stringify(r.actions[0].cells.at(-1))!==JSON.stringify([63,63])||r.actions[0].cells.length!==123)throw Error('Outside utility release was not bounded');cases.push('outside-route');
  return {cases,scope:'Real EditorMap release-handler contract with controlled pointer samples; not a browser gesture or performance benchmark'};
 });assert.equal(result.cases.length,13);console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
