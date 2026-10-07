// Pixel checks use alpha, never colour similarity as proof of artistic quality.
export function measureAlpha(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1, opaque = 0, edge = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] < 32) continue;
    opaque++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) edge++;
  }
  return { empty: !opaque, bounds: opaque ? [left, top, right, bottom] : null, edgePixels: edge,
    padding: opaque ? [left / width, top / height, (width - 1 - right) / width, (height - 1 - bottom) / height] : null };
}
export function compareAlpha(a, b) {
  let union = 0, intersection = 0;
  for (let i = 3; i < a.length; i += 4) {
    const x = a[i] >= 32, y = b[i] >= 32;
    if (x || y) union++;
    if (x && y) intersection++;
  }
  return union ? intersection / union : 1;
}
export function imageCell(image, cell, size = 256) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const [x,y,w,h] = cell;
  ctx.drawImage(image, x * image.naturalWidth, y * image.naturalHeight, w * image.naturalWidth, h * image.naturalHeight, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}
export function reviewPixels(original, candidate, sprite) {
  const cells = sprite.animation ? Array.from({length:16}, (_,i) => [i%4/4,Math.floor(i/4)/4,.25,.25]) : sprite.chicken ? [[sprite.variant/3,0,1/3,.5],[sprite.variant/3,.5,1/3,.5]] : [sprite.cell];
  const frames = cells.map((cell, i) => {
    const a = imageCell(original, cell), b = imageCell(candidate, cell);
    return { frame:i, original:measureAlpha(a,256,256), candidate:measureAlpha(b,256,256), silhouetteOverlap:compareAlpha(a,b) };
  });
  const bottoms = frames.map(f => f.candidate.bounds?.[3]).filter(n => n !== undefined);
  return { originalSize:[original.naturalWidth,original.naturalHeight], candidateSize:[candidate.naturalWidth,candidate.naturalHeight],
    sameDimensions:original.naturalWidth===candidate.naturalWidth && original.naturalHeight===candidate.naturalHeight,
    frames, baselineSpread:bottoms.length ? Math.max(...bottoms)-Math.min(...bottoms) : 0,
    note:'Bounds sampled at 256 pixels per cell, alpha ≥32. Pose changes can legitimately alter bounds; flags require visual review.' };
}
