import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const roots=process.argv.slice(2);assert(roots.length,'Pass motion evidence directories');
const sha=b=>createHash('sha256').update(b).digest('hex'),results=[];
for(const root of roots){
 const recordingBytes=await readFile(root+'/recording.json'),r=JSON.parse(recordingBytes),d=JSON.parse(await readFile(root+'/decoded.json')),review=JSON.parse(await readFile(root+'/review.json'));
 assert.equal(sha(await readFile(root+'/motion.webm')),r.videoSha256);assert.equal(d.videoSha256,r.videoSha256);assert.equal(d.recordingSha256,sha(recordingBytes));
 assert.equal(d.decoderSha256,sha(await readFile('scripts/decode-public-family-motion.mjs')));
 for(const [file,hash]of Object.entries(r.sources))assert.equal(sha(await readFile(file)),hash,file+' changed');
 assert.deepEqual(r.browserErrors,[]);assert.equal(r.segments.filter(s=>s.kind==='clip').length,13);assert.equal(r.segments.filter(s=>s.kind==='transition').length,12);for(const segment of r.segments.filter(s=>s.kind==='transition'))assert(new Set(segment.targetPoseKeys).size>=(segment.mode==='sleep'?1:2),'Transition must reach actual painted target poses');assert.equal(r.segments.length,25);assert.equal(d.boards.length,37);assert(r.boundsChecked>=r.checked&&r.checked>0);
 assert(r.recipes.length===4&&r.recipes.every(recipe=>recipe.assetVersion===(r.shirt?'resident-parts-v6':'resident-parts-v5')));
 for(const [index,segment]of r.segments.entries())assert.deepEqual(d.boards.filter(b=>b.segmentIndex===index).map(b=>b.sampleType).sort(),segment.kind==='transition'?['boundaries','cycle']:['cycle']);
 const files=d.boards.map(b=>b.file);assert.equal(new Set(files).size,37);
 assert.equal(new Set([...review.reviewed,...review.pending]).size,37);assert.deepEqual([...review.reviewed,...review.pending].sort(),[...files].sort());
 for(const [i,board]of d.boards.entries()){
  const segment=r.segments[board.segmentIndex];assert(segment);assert.equal(board.kind,segment.kind);assert.equal(board.mode,segment.mode);assert(['cycle','boundaries'].includes(board.sampleType));assert.equal(board.samples,8);
  const png=await readFile(root+'/'+board.file);assert.equal(sha(png),board.sha256);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),2000);assert.equal(png.readUInt32BE(20),540);
 }
 results.push({root,shirt:r.shirt,segments:r.segments.length,decodedFrames:d.metadata.streams.find(s=>s.codec_type==='video').nb_read_frames,reviewed:review.reviewed.length,pending:review.pending.length,scope:'Evidence integrity and declared inspection coverage only; no automated judgement of visual quality or physical display pacing.'});
}
console.log(JSON.stringify(results,null,2));
