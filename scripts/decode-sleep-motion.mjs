// Decode the recorded canvas; never paint or alter the source artwork.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const root='assets/art-direction/character-prototype-v1/sleep-body-study-v2/family-v2/motion-v1',run=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex'),recording=JSON.parse(await readFile(root+'/recording.json')),movie=root+'/sleep-transitions.webm';assert.equal(sha(await readFile(movie)),recording.videoSha256);
const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);assert.equal(metadata.streams[0].width,1000);assert.equal(metadata.streams[0].height,700);assert(Number(metadata.streams[0].nb_read_frames)>=24);assert(Number(metadata.format.duration)>=11.8);
const commands=[['-v','error','-threads','1','-i',movie,'-vf','fps=1,scale=500:350,tile=4x3','-frames:v','1','-y',root+'/overview.png']],boards=['overview.png'];
for(const night of [0,1])for(const mode of ['sleep','breathe']){
 const change=recording.changes.find(c=>c.actor===0&&c.night===night&&c.mode===mode&&(mode==='sleep'?c.key==='base:15':c.seconds>4.5));assert(change,'Missing recorded transition');const file=`${night?'night':'day'}-${mode}-transition.png`,start=Math.max(0,change.recordingMs/1000-.15).toFixed(5);boards.push(file);commands.push(['-v','error','-threads','1','-ss',start,'-i',movie,'-vf','fps=20,scale=500:350,tile=3x2','-frames:v','1','-y',root+'/'+file]);
}
for(const args of commands)await run('ffmpeg',args);
await writeFile(root+'/decoded.json',JSON.stringify({videoSha256:recording.videoSha256,recordingSha256:sha(await readFile(root+'/recording.json')),decoderSha256:sha(await readFile('scripts/decode-sleep-motion.mjs')),metadata,commands,boards:Object.fromEntries(await Promise.all(boards.map(async f=>[f,sha(await readFile(root+'/'+f))]))),scope:'Independent video decode: complete one-second samples and 20fps windows around each observed pose change. Not exhaustive display pacing or a drawn lowering/rising sequence.'},null,2)+'\n');console.log(JSON.stringify({decodedFrames:metadata.streams[0].nb_read_frames,duration:metadata.format.duration,boards}));
