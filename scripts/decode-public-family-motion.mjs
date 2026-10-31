// Decode recorded production rendering; never redraw the source sprites.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root=process.argv[2];assert(root,'Pass a public motion recording directory');
const run=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const recording=JSON.parse(await readFile(root+'/recording.json')),movie=root+'/motion.webm';
assert.equal(sha(await readFile(movie)),recording.videoSha256);assert.equal(recording.segments.length,25);
const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);
const video=metadata.streams.find(s=>s.codec_type==='video');assert(video);assert.equal(video.width,1000);assert.equal(video.height,540);assert(Number(video.nb_read_frames)>100);
const duration=Number(metadata.format.duration);assert(Number.isFinite(duration)&&duration>0);
await mkdir(root+'/decoded',{recursive:true});const boards=[];
for(const [index,segment]of recording.segments.entries()){
 const start=segment.offsetMs/1000,seconds=segment.elapsedMs/1000;
 // MediaRecorder can omit a short final tail. Require every requested sample
 // center to exist; retain the omitted interval instead of claiming full coverage.
 assert(start>=0&&seconds>0&&start+seconds*15/16<=duration,'Every requested movie sample must exist');
 const unencodedTailSeconds=Math.max(0,start+seconds-duration);
 const file=`decoded/${String(index).padStart(2,'0')}-${segment.kind}-${segment.mode}.png`;
 const args=['-v','error','-threads','1','-ss',String(start),'-i',movie,'-t',String(seconds),'-vf',`fps=${8/seconds},scale=500:270,tile=4x2`,'-frames:v','1','-y',root+'/'+file];
 await run('ffmpeg',args);const bytes=await readFile(root+'/'+file);assert(bytes.length>10000);
 boards.push({file,sha256:sha(bytes),segmentIndex:index,sampleType:'cycle',mode:segment.mode,kind:segment.kind,startSeconds:start,durationSeconds:seconds,unencodedTailSeconds,samples:8,command:args});

 if(segment.kind==='transition'){
  const available=Math.min(seconds,duration-start),times=[.04,.18,.29,seconds/2,seconds-.36,Math.min(seconds-.23,available-.16),Math.min(seconds-.12,available-.1),Math.min(seconds-.04,available-.05)];
  const directory=`decoded/frames-${String(index).padStart(2,'0')}`;await mkdir(root+'/'+directory,{recursive:true});
  // Preserve the short walk/activity entry and exit windows that evenly spaced
  // full-cycle samples can skip on slow clips.
  const commands=[];
  for(const [slot,time]of times.entries()){
   const absolute=start+time;assert(absolute>=0&&absolute<duration,'Boundary sample must exist in the movie');
   const args=['-v','error','-threads','1','-ss',String(absolute),'-i',movie,'-vf','scale=500:270','-frames:v','1','-y',`${root}/${directory}/sample-${String(slot).padStart(2,'0')}.png`];commands.push(args);await run('ffmpeg',args);
  }
  const file=`decoded/${String(index).padStart(2,'0')}-boundaries-${segment.mode}.png`,args=['-v','error','-threads','1','-framerate','1','-i',`${root}/${directory}/sample-%02d.png`,'-vf','tile=4x2','-frames:v','1','-y',root+'/'+file];await run('ffmpeg',args);
  boards.push({file,sha256:sha(await readFile(root+'/'+file)),segmentIndex:index,sampleType:'boundaries',mode:segment.mode,kind:segment.kind,startSeconds:start,durationSeconds:seconds,unencodedTailSeconds,sampleSeconds:times,samples:8,commands:[...commands,args]});
 }
}
const report={videoSha256:recording.videoSha256,recordingSha256:sha(await readFile(root+'/recording.json')),decoderSha256:sha(await readFile('scripts/decode-public-family-motion.mjs')),metadata,boards,scope:'Eight evenly spaced decoded movie samples per recorded activity/transition plus eight targeted entry/exit samples per transition, including four public custom providers and Bento in day and mirrored night. These boards are not automatic visual approval, exhaustive frame inspection, world placement or display pacing evidence.'};
await writeFile(root+'/decoded.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({decodedFrames:video.nb_read_frames,duration,boards:boards.length}));
