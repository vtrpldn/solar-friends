// Geometry-only attachment draft; never modifies source artwork.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateAttachmentRig} from '../web/character-attachments.js';
const root='assets/art-direction/character-prototype-v1/body-broad-v1';
const read=async name=>JSON.parse(await readFile(`${root}/${name}`));
const body=await read('body-binding-v1.json'),regions=await read('body-material-regions-v2.json');
const visible=(x,y)=>({visibility:'visible',position:[x,y]});
const poses=Object.fromEntries(['base','idle','activities'].map(sheet=>[sheet,regions.sheets[sheet].regions.map(({head:[x,y,rx,ry]},index)=>{
 // Seed head/neck guides from authored head geometry. These require visual
 // correction before fitted parts; missing hands remain null, never guessed.
 if(sheet==='base'&&index===15)return {head:visible(47,110),neck:visible(85,137),nearHand:null,farHand:null};
 return {head:visible(x,y-ry*.65),neck:visible(x,y+ry*.8),nearHand:null,farHand:null};
})]));
const rig=validateAttachmentRig({schema:1,body,poses},body);
await writeFile(`${root}/attachment-rig-draft-v1.json`,JSON.stringify(rig,null,2)+'\n');
const inputs={};for(const p of ['body-binding-v1.json','body-material-regions-v2.json'])inputs[p]=createHash('sha256').update(await readFile(`${root}/${p}`)).digest('hex');
await writeFile(`${root}/attachment-rig-draft-review-v1.json`,JSON.stringify({schema:1,status:'Incomplete authoring draft, not fitted-part acceptance',why:'Bind future accessory landmarks to all48 exact body frames without reusing another anatomy rig',inputs,seededHeadNeckPairs:48,completePoses:0,remaining:['Inspect and correct head/neck geometry with actual accessory contact','Author near/far hands with explicit occlusion','Review both facings and native motion','Fit painted parts and portraits before public integration']},null,2)+'\n');
console.log('Wrote exact-bound attachment draft:48 seeded head/neck pairs; hands explicitly unrecorded.');
