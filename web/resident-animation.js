// Visual state only: saved simulation time chooses idle activities; animation
// seconds advance only while the simulation runs. No village/save mutations.
import { preparedFrames, FRAME_ANCHOR } from './sprite-frames.js';
import {residentClipTiming} from './resident-animation-profiles.js';
export const residentClips = {
  cook: { sheet: 'activities', row: 0, fps: 3, frames: [0,1,2,3,2,1], loop: true },
  water: { sheet: 'activities', row: 1, fps: 2, frames: [0,1,2,3,2,1], loop: true },
  tend: { sheet: 'activities', row: 2, fps: 3, frames: [0,1,2,3,2,1], loop: true },
  feed: { sheet: 'activities', row: 3, fps: 2, frames: [0,1,2,3,2,1], loop: true },
  walk: { sheet: 'base', row: 0, fps: 8, frames: [0, 1, 2, 3], loop: true },
  work: { sheet: 'base', row: 1, fps: 5, frames: [0, 1, 2, 3], loop: true },
  sit: { sheet: 'base', row: 3, fps: .8, frames: [0, 1, 2, 1], loop: true },
  breathe: { sheet: 'base', row: 2, fps: .8, frames: [0, 1, 2, 3], loop: true },
  sleep: { sheet: 'base', row: 3, fps: 0, frames: [3] },
  look: { sheet: 'idle', row: 0, fps: .8, frames: [0, 1, 2, 3], loop: true },
  stretch: { sheet: 'idle', row: 1, fps: 1.6, frames: [0, 1, 2, 2, 1, 0] },
  wave: { sheet: 'idle', row: 2, fps: 2, frames: [0, 2, 2, 3, 0] },
  relax: { sheet: 'idle', row: 3, fps: 1, frames: [0, 1, 2, 2, 1, 0] },
};
export const idleLabels = {
  look: 'Looking around the village', stretch: 'Taking a stretch',
  wave: 'Waving hello', relax: 'Enjoying a quiet moment', walk: 'Taking a quiet walk',
};
export function residentActivity(r, minutes) {
  if(r.trip && r.trip.phase!=='away')return 'walk';
  if (Math.hypot(r.target_x - r.x, r.target_y - r.y) > .1) return 'walk';
  if (r.task === 'sleep') return 'sleep';
  if (r.task === 'daydream') return 'sit';
  if (['birdwatch', 'stargaze', 'nature_walk'].includes(r.task)) return 'look';
  if (r.task === 'stretch') return Math.floor(minutes / 8) % 2 ? 'stretch' : 'breathe';
  if (['rest', 'eat'].includes(r.task)) return 'sit';
  if(r.task==='source'&&r.sourceCare)return 'tend';
  if(r.task==='source')return [2,3].includes(r.sourceMaterial)?'tend':'work';
  if(r.task==='outside')return 'tend';
  if (['build','building_work','craft','prepare','utility'].includes(r.task)) return 'work';
  if (r.task === 'cook') return 'cook';
  if (r.task === 'water') return 'water';
  if(r.task==='garden'&&r.worksiteKind==='goat_pasture')return 'feed';
  if (['garden', 'compost', 'restore', 'gather'].includes(r.task)) return 'tend';
  if (r.task === 'visit') {
    if (r.visitingKind === 'workshop') return 'work';
    if (r.visitingKind === 'kitchen') return 'cook';
    if (['coop','goat_pasture'].includes(r.visitingKind)) return 'feed';
    if (r.visitingKind === 'well') return 'water';
    if (['compost', 'garden', 'greenhouse', 'grove', 'orchard', 'goat_pasture', 'apiary'].includes(r.visitingKind)) return 'tend';
    if (['home', 'square'].includes(r.visitingKind)) return 'sit';
  }
  const slot = Math.floor((minutes + r.id * 29) / 24);
  if (['socialize', 'gathering'].includes(r.task)) return slot % 3 === 0 ? 'wave' : 'relax';
  if (r.task === 'idle') return ['look', 'relax', 'look', 'stretch', 'look', 'relax', 'wave', 'look'][slot % 8];
  return 'look';
}
const ease = t => t * t * (3 - 2 * t);
export function sampleResidentClip(mode, seconds, profile) {
  const clip = residentClips[mode];
  const timing=residentClipTiming(profile,mode);
  if(timing){
    const duration=timing.durations.reduce((sum,n)=>sum+n,0);
    const position=Math.max(0,seconds)%duration;let index=0,end=timing.durations[0];
    while(index<timing.durations.length-1&&position>=end){index++;end+=timing.durations[index];}
    return [{sheet:clip.sheet,row:clip.row,frame:clip.frames[index],sequenceIndex:index,weight:1}];
  }
  const position = Math.max(0, seconds * clip.fps);
  const index = clip.loop ? Math.floor(position) % clip.frames.length : Math.min(Math.floor(position), clip.frames.length - 1);
  const next = clip.loop ? (index + 1) % clip.frames.length : Math.min(index + 1, clip.frames.length - 1);
  // Keep readable key poses, then ease through the final part of each frame.
  const window = Math.min(.45, clip.fps * .09);
  const blend = window ? ease(Math.max(0, ((position % 1) - (1 - window)) / window)) : 0;
  return [
    { sheet: clip.sheet, row: clip.row, frame: clip.frames[index], sequenceIndex: index, weight: 1 - blend },
    { sheet: clip.sheet, row: clip.row, frame: clip.frames[next], sequenceIndex: next, weight: blend },
  ].filter(frame => frame.weight > 0);
}
export function advanceResidentAnimation(previous, r, minutes, delta, profile) {
  const mode = residentActivity(r, minutes);
  const changed = previous && mode !== previous.mode;
  const phase = changed ? 0 : (previous?.phase ?? r.id * .19) + delta;
  let facing = previous?.facing ?? (r.target_x - r.target_y < r.x - r.y ? -1 : 1);
  if (previous && mode === 'walk') {
    const dx = (r.x - previous.x) - (r.y - previous.y);
    if (Math.abs(dx) > .00001) facing = dx < 0 ? -1 : 1;
  }
  const transition = changed ? 0 : Math.min(.18, (previous?.transition ?? .18) + delta);
  const from = changed ? sampleResidentClip(previous.mode, previous.phase, previous.animationProfile??profile) : previous?.from;
  const mix = ease(transition / .18);
  const layers = sampleResidentClip(mode, phase, profile).map(frame => ({ ...frame, weight: frame.weight * mix }));
  if (from && mix < 1) layers.push(...from.map(frame => ({ ...frame, weight: frame.weight * (1 - mix) })));
  return { mode, phase, facing, transition, from: mix < 1 ? from : undefined, layers, animationProfile:profile,
    x: r.x, y: r.y, breath: mode === 'walk' || mode === 'work' || mode === 'sleep' ? 1 : 1 + Math.sin(phase * 1.8 + r.id) * .006 };
}

// Independently painted silhouettes cannot be spatially interpolated by opacity.
// A provider may opt into whole key poses; legacy sheets retain their blending.
export function presentedPoseLayers(layers,interpolation='crossfade') {
  if(interpolation==='crossfade')return layers;
  if(interpolation!=='keyframes')throw Error('Choose a supported resident pose presentation.');
  const poses=new Map();
  for(const pose of layers){
    if(!Number.isFinite(pose.weight)||pose.weight<=0)continue;
    const key=pose.sheet+':'+pose.row+':'+pose.frame+':'+(pose.sequenceIndex??''),previous=poses.get(key);
    if(previous)previous.weight+=pose.weight;
    else poses.set(key,{...pose});
  }
  let strongest=null;
  for(const pose of poses.values())if(!strongest||pose.weight>strongest.weight)strongest=pose;
  return strongest?[{...strongest,weight:1}]:[];
}

// Additive premultiplied blending on an isolated surface keeps overlapping
// opaque pixels opaque instead of making the whole resident flash translucent.
export function drawResidentAnimation(ctx, surface, sheets, animation, x, y, width) {
  const buffer = surface.getContext('2d');
  buffer.clearRect(0, 0, surface.width, surface.height);
  buffer.globalCompositeOperation = 'lighter';
  for (const pose of presentedPoseLayers(animation.layers,sheets.interpolation??'crossfade')) {
    if (pose.weight <= 0) continue;
    const frame = typeof sheets.frameForPose === 'function' ? sheets.frameForPose(pose.sheet,pose.row*4+pose.frame,pose) : preparedFrames(sheets[pose.sheet], {referenceRow:pose.sheet === 'base' ? 2 : 0})?.[pose.row*4+pose.frame];
    if (!frame) continue;
    buffer.globalAlpha = pose.weight;
    buffer.drawImage(frame, 0, 0, surface.width, surface.height);
  }
  buffer.globalAlpha = 1;
  buffer.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(animation.facing, animation.breath);
  ctx.drawImage(surface, -width / 2, -width * FRAME_ANCHOR, width, width);
  ctx.restore();
}
