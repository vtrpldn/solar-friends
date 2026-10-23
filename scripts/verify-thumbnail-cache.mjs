import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const output=process.argv[2]??'/tmp/solar-thumbnail-cache';await mkdir(output,{recursive:true});const server=await serve(0);let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`);await page.waitForFunction(()=>document.body.dataset.creatorReady==='true');
 const result=await page.evaluate(async()=>{
  const {Game}=await import('/pkg/solar_friends.js'),{EditorMap,loadEditorArt}=await import('/editor/map-view.js'),{creationThumbnail,mapThumbnail}=await import('/editor/thumbnail.js'),{residentPartRecipe}=await import('/resident-part-recipe.js'),g=new Game(),art=await loadEditorArt(),render=EditorMap.prototype.render,seen=new Set(),samples=[];let probing=false,rebuilds=[];
  EditorMap.prototype.render=function(...args){const old=this.ground;try{return render.apply(this,args);}finally{if(probing){seen.add(this);rebuilds.push(old!==this.ground);}}};
  const fresh=(d,snapshot,art)=>{const canvas=document.createElement('canvas'),map=new EditorMap(canvas,art,{preview:true});map.set(d,snapshot,{center:d.map.camera,zoom:1.3,grid:false});return canvas.toDataURL('image/webp',.72);};
  const check=async(label,d,expectedRebuild,landOnly=false)=>{
   const loaded=JSON.parse(g.load_scenario(JSON.stringify(d)));if(!loaded.ok)throw Error(label+JSON.stringify(loaded));const snapshot=JSON.parse(g.report_state());await Promise.all(snapshot.residents.map(r=>art.appearances.prepare(r.appearance)));
   const sd=landOnly?{...d,start:{...d.start,buildings:[],roads:[],resource_sites:[]}}:d,ss=landOnly?{...snapshot,residents:[],village:{...snapshot.village,buildings:[],pipes:{lines:[]},power:{network:{nodes:[]}}}}:snapshot,expected=fresh(sd,ss,art);
   rebuilds=[];probing=true;let actual;try{actual=landOnly?mapThumbnail(d,snapshot,art):creationThumbnail(d,snapshot,art);}finally{probing=false;}
   if(actual!==expected)throw Error('Cached thumbnail differs from fresh '+label);if(expectedRebuild!==null&&rebuilds[0]!==expectedRebuild)throw Error('Unexpected terrain cache behavior '+label);samples.push({label,exact:true,terrainRebuilt:rebuilds[0]});return {definition:d,snapshot,image:actual};
  };
  try{
   const base=JSON.parse(g.scenario_template('sandbox'));base.map=JSON.parse(g.generate_biome_property('mata-atlantica',42));let current=structuredClone(base);const first=await check('first',current,true);
   current=structuredClone(current);current.start.funds+=100;current.title='A new title';const financial=await check('funds-and-title',current,false);if(first.image!==financial.image)throw Error('Nonvisual edit changed thumbnail');
   current.map.camera=[current.map.camera[0]+2,current.map.camera[1]];const camera=await check('camera',current,false);if(camera.image===financial.image)throw Error('Camera edit did not redraw');
   const [cx,cy]=current.map.camp;current.start.roads.push([cx+1,cy+3]);await check('road',current,true);
   current=structuredClone(current);current.map.terrain[cy*64+cx].cover=.11;await check('terrain',current,true);
   current=structuredClone(current);current.map.river=null;await check('river',current,true);
   for(const biome of ['cerrado','caatinga','mata-atlantica']){const d=structuredClone(base);d.map=JSON.parse(g.generate_biome_property(biome,42));await check('biome-'+biome,d,true);current=d;}
   current.start.residents[0].appearance=residentPartRecipe({hair:'side-part-v1',hairColour:'silver',hat:'straw-v1'});await check('custom-resident',current,false);
   await check('land-only',current,current.start.roads.length>0,true);await check('return-to-scenario',current,current.start.roads.length>0);
   if(seen.size!==1)throw Error('One art library created multiple persistent preview renderers');
   const otherArt={...art},expected=fresh(current,JSON.parse(g.report_state()),otherArt);probing=true;let second;try{second=creationThumbnail(current,JSON.parse(g.report_state()),otherArt);}finally{probing=false;}if(second!==expected||seen.size!==2)throw Error('Independent art library did not receive its own renderer');
   return {samples,oneRendererPerArtLibrary:true,separateArtLibrary:true,unchangedNonvisualPixels:true,visualCameraChange:true,image:second};
  }finally{EditorMap.prototype.render=render;g.free();}
 });assert.equal(result.samples.length,12);assert.deepEqual(errors,[]);await writeFile(output+'/thumbnail.webp',Buffer.from(result.image.split(',')[1],'base64'));delete result.image;await writeFile(output+'/report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
