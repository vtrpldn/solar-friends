// Decode review evidence only; never modify any source artwork.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const name=process.argv[2];
assert(/^[a-z0-9-]+$/.test(name??''),'Choose a versioned review collection');
const folder='assets/art-direction/character-prototype-v1/'+name;
const report=JSON.parse(await readFile(folder+'/verification-v1.json','utf8'));
const run=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),movies={};
assert(report.movies&&Object.keys(report.movies).length===2,'Expected both hairstyle recordings');
for(const [key,entry]of Object.entries(report.movies)){
 assert(/^[a-z0-9-]+$/.test(key));
 const clip=entry.clip??entry.recordings?.[0]?.clip;
 assert(['sit','look'].includes(clip));
 assert.equal(entry.recordings.length,2);
 for(const [index,segment]of entry.recordings.entries()){
  assert.equal(segment.clip,clip);assert.equal(segment.night,index);
  assert.equal(segment.facing,index?-1:1);
  assert(segment.elapsedMs>=5900&&segment.frames>0);
 }
 const movie=folder+'/'+key+'-'+clip+'.webm',bytes=await readFile(movie);
 assert.equal(sha(bytes),entry.videoSha256,'Recording changed after review');
 const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);
 assert.equal(metadata.streams[0].width,600);assert.equal(metadata.streams[0].height,320);
 assert(Number(metadata.streams[0].nb_read_frames)>=24);
 assert(Number(metadata.format.duration)>=11.8);
 const samples=key+'-decoded.png',transition=key+'-transition-decoded.png';
 const commands=[['-v','error','-threads','1','-i',movie,'-vf','fps=1,scale=300:160,tile=6x2','-frames:v','1','-y',folder+'/'+samples],['-v','error','-threads','1','-ss','1.1','-i',movie,'-vf','fps=20,scale=600:320,tile=3x2','-frames:v','1','-y',folder+'/'+transition]];
 for(const args of commands)await run('ffmpeg',args);
 movies[key]={clip,videoSha256:entry.videoSha256,metadata,recordings:entry.recordings,commands,boards:{[samples]:sha(await readFile(folder+'/'+samples)),[transition]:sha(await readFile(folder+'/'+transition))}};
}
await writeFile(folder+'/decoded-v2.json',JSON.stringify({scope:'Independently decoded full-cycle one-second samples and closer first-transition samples. Requested times are not exact native pose identities, exhaustive playback or physical display pacing evidence.',verificationSha256:sha(await readFile(folder+'/verification-v1.json')),decoderSha256:sha(await readFile('scripts/decode-mixed-clothing-motion.mjs')),movies},null,2)+'\n');
console.log('Decoded and hash-checked both hairstyle recordings and transition boards.');
