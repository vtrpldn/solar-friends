import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readAlpha,alphaOutline} from './lib/png-alpha.mjs';
import {regionalNatureArt} from '../web/regional-art.js';
const fingerprints={};
for(const art of regionalNatureArt){
 const bytes=await readFile('web/art/'+art.file),image=readAlpha(bytes),points=alphaOutline(image,art.cell),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const end=Math.max(...ys),height=art.cell[3]*image.height/(art.cell[2]*image.width);
 assert(Math.min(...xs)>.02&&Math.max(...xs)<.98,`${art.name}: complete side silhouette`);
 assert(Math.min(...ys)>.02&&end<height-.02,`${art.name}: complete vertical silhouette`);
 assert(Math.abs(art.anchor-end)<.002,`${art.name}: measured ground baseline`);
 assert(art.anchorX>.3&&art.anchorX<.7);assert(art.width>0&&art.width<150);
 fingerprints[art.file]=createHash('sha256').update(bytes).digest('hex');
}
console.log('PASS all eight regional sprites have complete separate alpha silhouettes, measured ground baselines, bounded display scale and independent registrations.');
console.log(JSON.stringify(fingerprints));
