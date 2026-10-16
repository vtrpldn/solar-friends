import {paintImage} from './paint-cache.js';
// Recover complete painted poses even when source artwork crosses atlas cells.
// One scale per sheet preserves pose proportions; lower-body pivots remove layout drift.
export const RESIDENT_WIDTH = 48;
export const FRAME_ANCHOR = .95;
const cache = new WeakMap();
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];

export function locateSpriteFrames(data, width, height, columns = 4, rows = 4, referenceRow = 0) {
  const labels = new Int32Array(width * height), queue = new Uint32Array(width * height), components = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || data[start*4+3] < 32) continue;
    const id = components.length + 1;
    let head = 0, tail = 1, left = width, top = height, right = 0, bottom = 0;
    queue[0] = start; labels[start] = id;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y);
      for (const n of [x ? p-1 : -1, x < width-1 ? p+1 : -1, p-width, p+width]) {
        if (n >= 0 && n < labels.length && !labels[n] && data[n*4+3] >= 32) { labels[n] = id; queue[tail++] = n; }
      }
    }
    components.push({id, area:tail, left, top, right:right+1, bottom:bottom+1});
  }
  const count = columns * rows;
  const figures = components.filter(c => c.area > width*height/count*.02).sort((a,b)=>b.area-a.area).slice(0,count);
  if (figures.length !== count) throw new Error(`Expected ${count} separate painted sprites, found ${figures.length}.`);
  figures.sort((a,b)=>(a.top+a.bottom)-(b.top+b.bottom));
  const frames = [];
  for (let row=0;row<rows;row++) frames.push(...figures.slice(row*columns,(row+1)*columns).sort((a,b)=>(a.left+a.right)-(b.left+b.right)));
  const selected = new Set(frames.map(f=>f.id));
  // Preserve the two-pixel antialias fringe without copying an adjacent figure.
  const owners = new Int32Array(labels.length);
  for (let p=0;p<labels.length;p++) if (selected.has(labels[p])) owners[p] = labels[p];
  for (let p=0;p<labels.length;p++) {
    if (owners[p] || !data[p*4+3]) continue;
    const x=p%width,y=Math.floor(p/width);
    for (let dy=-2;dy<=2 && !owners[p];dy++) for (let dx=-2;dx<=2;dx++) {
      if (x+dx<0 || x+dx>=width || y+dy<0 || y+dy>=height) continue;
      const id=labels[(y+dy)*width+x+dx];
      if(selected.has(id)){owners[p]=id;break;}
    }
  }
  for (const f of frames) {
    const centers=[];
    for(let y=Math.ceil(f.top+(f.bottom-f.top)*.6); y<f.top+(f.bottom-f.top)*.85; y++) {
      let left=width,right=-1;
      for(let x=f.left;x<f.right;x++) if(labels[y*width+x]===f.id){left=Math.min(left,x);right=x;}
      if(right>=left) centers.push((left+right)/2);
    }
    f.pivot = centers.length ? median(centers) : (f.left+f.right)/2;
  }
  const referenceHeight=median(frames.slice(referenceRow*columns,(referenceRow+1)*columns).map(f=>f.bottom-f.top));
  const scale=Math.min(.86/referenceHeight, ...frames.map(f=>Math.min(.9/(f.bottom-f.top),.44/Math.max(f.pivot-f.left,f.right-f.pivot))));
  return {frames,owners,scale,width,height,columns,rows};
}

export function preparedFrames(image, {columns=4,rows=4,referenceRow=0} = {}) {
  if (!image?.complete || !image.naturalWidth) return null;
  const key=`${image.currentSrc || image.src}:${columns}:${rows}:${referenceRow}`;
  const cached=cache.get(image); if(cached?.key===key)return cached.frames;
  const source=document.createElement('canvas'); source.width=image.naturalWidth;source.height=image.naturalHeight;
  const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,source.width,source.height);
  const layout=locateSpriteFrames(pixels.data,source.width,source.height,columns,rows,referenceRow);
  const frames=layout.frames.map(f=>{
    const left=Math.max(0,f.left-2),top=Math.max(0,f.top-2),right=Math.min(source.width,f.right+2),bottom=Math.min(source.height,f.bottom+2);
    const cut=document.createElement('canvas');cut.width=right-left;cut.height=bottom-top;
    const cutCtx=cut.getContext('2d'),part=cutCtx.createImageData(cut.width,cut.height);
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
      const p=y*source.width+x;if(layout.owners[p]!==f.id)continue;
      const d=((y-top)*cut.width+x-left)*4;part.data.set(pixels.data.subarray(p*4,p*4+4),d);
    }
    cutCtx.putImageData(part,0,0);
    const result=document.createElement('canvas');result.width=result.height=256;
    const factor=layout.scale*256;
    result.getContext('2d').drawImage(cut,128+(left-f.pivot)*factor,FRAME_ANCHOR*256+(top-f.bottom)*factor,cut.width*factor,cut.height*factor);
    return result;
  });
  cache.set(image,{key,frames});return frames;
}
export function drawPreparedFrame(ctx,image,index,x,y,width,options) {
  const frame=preparedFrames(image,options)?.[index];
  if(frame)paintImage(ctx,frame,0,0,frame.width,frame.height,x-width/2,y-width*FRAME_ANCHOR,width,width);
}
export function animationFrameOptions(sprite) { return {referenceRow: sprite.idleAnimation || sprite.activityAnimation ? 0 : 2}; }
