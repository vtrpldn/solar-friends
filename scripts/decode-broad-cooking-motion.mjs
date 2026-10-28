// Decode evidence only; never modify painted source artwork.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const root='assets/art-direction/character-prototype-v1/body-broad-v1',run=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex'),movie=`${root}/cooking-composed-motion-v1.webm`,recording=JSON.parse(await readFile(`${root}/cooking-composed-motion-v1.json`));
assert.equal(hash(await readFile(movie)),recording.videoSha256);
const metadata=JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',movie])).stdout);
assert.equal(metadata.streams[0].width,1100);assert.equal(metadata.streams[0].height,760);assert(Number(metadata.streams[0].nb_read_frames)>100);assert(Number(metadata.format.duration)>=10);
const commands=[],boards=[];
for(const [name,start,fps]of [['loop',1,3],['enter',.65,20],['leave',8.85,20]]){
 const file=`cooking-composed-${name}-decoded-v1.png`;boards.push(file);const args=['-v','error','-threads','1','-ss',String(start),'-i',movie,'-vf',`fps=${fps},scale=550:380,tile=3x2`,'-frames:v','1','-y',`${root}/${file}`];commands.push(args);await run('ffmpeg',args);
}
await writeFile(`${root}/cooking-composed-motion-decoded-v1.json`,JSON.stringify({status:'Decoded; visual review pending',videoSha256:recording.videoSha256,decoderSha256:hash(await readFile('scripts/decode-broad-cooking-motion.mjs')),metadata,commands,boards:Object.fromEntries(await Promise.all(boards.map(async f=>[f,hash(await readFile(`${root}/${f}`))]))),scope:'Six samples of a native cooking cycle and six decoded frames around each entry/exit. Both hairstyles, right-facing day and left-facing night, 230px and48px views appear simultaneously. Samples are not exhaustive physical-display pacing or full source-art acceptance.'},null,2)+'\n');
console.log(JSON.stringify({frames:metadata.streams[0].nb_read_frames,duration:metadata.format.duration,boards}));
