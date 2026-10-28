import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';
const source=await readFile('web/character-image-source.js','utf8');
const instrumented=source.replace('export async function loadCharacterImageSource','async function originalLoad')+`
export async function loadCharacterImageSource(url){
 const value=await originalLoad(url),dispose=value.dispose,record={url,image:value.image,calls:0};
 (window.sourceOwnershipRecords??=[]).push(record);
 return {...value,dispose(){record.calls++;dispose();}};
}`;
const server=await serve(0,{handle(_req,res,path){if(path!=='/facial-source-disposal')return false;res.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Facial source ownership</title>');return true;}});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.route('**/character-image-source.js',route=>route.fulfill({contentType:'text/javascript',body:instrumented}));
 await page.goto(`http://127.0.0.1:${server.address().port}/facial-source-disposal`);
 const success=await page.evaluate(async()=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');
  const library=createResidentPartLibrary(),recipe=residentPartRecipe({facialHair:'short-chestnut-v1'}),provider=await library.prepare(recipe);
  const facial=window.sourceOwnershipRecords.filter(r=>r.url.includes('/facial-short-chestnut-source-'));
  if(!facial.length||facial.some(r=>r.calls!==1||r.image.naturalWidth!==0))throw Error('Completed overlays retain decoded facial sources');
  const frame=provider.frameForPose('base',8),before=frame.getContext('2d').getImageData(0,0,256,256).data.slice();
  await library.dispose();await library.dispose();
  if(facial.some(r=>r.calls!==1))throw Error('Facial source released twice');
  const after=frame.getContext('2d').getImageData(0,0,256,256).data;if(before.some((n,i)=>n!==after[i]))throw Error('Disposal erased borrowed finished pose');
  return {releasedAfterPreparation:facial.length,borrowedPosePreserved:true};
 });assert.ok(success.releasedAfterPreparation>0);
 await page.reload();
 await page.route('**/facial-short-chestnut-v1-registration.json',async route=>{const response=await route.fetch(),owner=await response.json();owner.sources[0].sha256='0'.repeat(64);for(const pose of owner.poses)if(pose.file===owner.sources[0].file)pose.registration.source.sha256='0'.repeat(64);await route.fulfill({response,json:owner});});
 const failure=await page.evaluate(async()=>{
  const {createResidentPartLibrary}=await import('/resident-parts.js'),{residentPartRecipe}=await import('/resident-part-recipe.js');const library=createResidentPartLibrary();let refused=false;
  try{await library.prepare(residentPartRecipe({facialHair:'short-chestnut-v1'}));}catch(error){refused=/Facial-hair artwork does not match/.test(error.message);}
  const facial=window.sourceOwnershipRecords.filter(r=>r.url.includes('/facial-short-chestnut-source-'));
  if(!refused||facial.length!==1||facial.some(r=>r.calls!==1||r.image.naturalWidth!==0))throw Error('Failed registration retained decoded source');
  await library.dispose();if(facial.some(r=>r.calls!==1))throw Error('Failure source released twice');return {invalidHashRefused:true,failedSourceReleased:true};
 });console.log('PASS: '+JSON.stringify({...success,...failure}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
