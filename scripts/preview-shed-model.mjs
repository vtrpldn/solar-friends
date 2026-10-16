import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
import {buildShedModel,projectPoint,shedCamera,shedDimensions} from './art-models/shed.js';
import {buildingSilhouettes} from '../web/building-silhouettes.js';
import {readAlpha,alphaOutline,convexHull} from './lib/png-alpha.mjs';
const day=await readFile('artifacts/isometric/shed-authored.png'),night=await readFile('artifacts/isometric/shed-authored-night.png'),A=readAlpha(day),B=readAlpha(night);assert.deepEqual(A.alpha,B.alpha,'Model lighting must preserve the complete silhouette');
const model=buildShedModel(),feet=model.feet.map(p=>projectPoint(p)),ridge=model.features.ridge.map(p=>projectPoint(p)),beam=model.features.frontBeam.map(p=>projectPoint(p));
const measurement={size:shedCamera.width,right:[[...feet[3],...feet[2]],[...ridge[0],...ridge[1]]],left:[[...feet[2],...feet[1]],[...beam[0],...beam[1]]],upright:[...projectPoint([shedDimensions.x,shedDimensions.y,shedDimensions.postHeight]),...feet[2]],rightLabels:['Left/front feet','Roof ridge axis'],leftLabels:['Front/right feet','Front crossbeam']};
let projection=await readFile('web/building-projection.js','utf8'),footprints=await readFile('web/building-footprints.js','utf8'),art=await readFile('web/building-art.js','utf8');
projection=projection.replace(/  shed:\{[^\n]+\},/,`  shed:${JSON.stringify(measurement)},`);
footprints=footprints.replace(/  shed:\[[^\n]+/,`  shed:[${shedCamera.width},${JSON.stringify([feet[3],feet[2],feet[1]])}],`);
art=art.replace("nightFile:'starter-shed.png',nightTint:'brightness(.6) saturate(.72)'","nightFile:'starter-shed-model-night.png'");
const silhouettes={...buildingSilhouettes,shed:{day:createHash('sha256').update(day).digest('hex'),night:createHash('sha256').update(night).digest('hex'),hull:convexHull([...alphaOutline(A),...alphaOutline(B)])}};
const replacements=new Map([['/art/starter-shed.png',day],['/art/starter-shed-model.png',day],['/art/starter-shed-model-night.png',night],['/building-art.js',art],['/building-projection.js',projection],['/building-footprints.js',footprints],['/building-silhouettes.js','export const buildingSilhouettes='+JSON.stringify(silhouettes)+';']]);
const server=await serve(0,{handle(req,res,url){if(!replacements.has(url))return false;res.writeHead(200,{'Content-Type':url.endsWith('.png')?'image/png':'text/javascript','Cache-Control':'no-store'}).end(replacements.get(url));return true;}}),browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await mkdir('artifacts/isometric/shed-model-review',{recursive:true});
 for(const mode of ['artwork-preview','night-preview']){await page.goto(`http://127.0.0.1:${server.address().port}/?${mode}`);await page.waitForFunction(()=>window.solarDevReloadReady);await page.screenshot({path:`artifacts/isometric/shed-model-review/${mode}.png`});}
 await page.goto(`http://127.0.0.1:${server.address().port}/artwork/projection.html`);await page.waitForFunction(()=>document.querySelector('#status')?.dataset.drift);await page.getByRole('button',{name:'Inspect Community shed',exact:true}).click();await page.locator('#focus').screenshot({path:'artifacts/isometric/shed-model-review/structure.png'});
 assert.deepEqual(errors,[]);await writeFile('artifacts/isometric/shed-model-review/geometry.json',JSON.stringify({measurement,feet,dayNightAlphaEqual:true,errors},null,2)+'\n');console.log('Captured model on real day/night terrain and through the shared projection inspector. No production assets modified.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
