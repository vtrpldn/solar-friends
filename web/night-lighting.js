import {meshPoint} from './building-mesh.js';
import { cameraCalibration, drawBuildingArt } from './building-art.js';
import { placementArt } from './building-footprints.js';

// The bulb centre, measured in the street light's original 1280 px artwork.
const lampBulb = [750 / 1280, 410 / 1280];
const emissions = new WeakMap();
const clamp = x => Math.max(0, Math.min(1, x));

export function lampLightOffset(art) {
  const placement = placementArt('streetlight', art);
  const { vertical, shear } = cameraCalibration(art);
  const width = art.width * placement.scale;
  const size=art.mesh?.size||1,[u,v]=meshPoint(art.mesh,lampBulb.map(n=>n*size));
  const x = (u/size - .5) * width;
  const y = (v/size - art.anchor) * width;
  return { x: placement.x + x, y: placement.y + shear * x + vertical * y };
}

export function emissionStrength(r, g, b) {
  return clamp((r - b) / 60) * clamp((g - b) / 40) * clamp((r - 90) / 110);
}

// Keep the original painted amber windows and lanterns bright after moonlight
// shading. Cool roofs, foliage and unlit surfaces stay in the night palette.
function emissionTexture(image) {
  if (!image?.complete || !image.naturalWidth) return null;
  if (emissions.has(image)) return emissions.get(image);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i + 3] *= emissionStrength(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
  }
  ctx.putImageData(pixels, 0, 0);
  emissions.set(image, canvas);
  return canvas;
}

export function drawNightEmission(ctx, image, art, kind, x, y, scale, amount) {
  if (amount <= 0) return;
  const texture = emissionTexture(image);
  if (!texture) return;
  const placement = placementArt(kind, art);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  drawBuildingArt(ctx, texture, art, x + placement.x * scale, y + placement.y * scale, scale * placement.scale, amount * .95);
  if (kind === 'streetlight') {
    const bulb = lampLightOffset(art), radius = 28 * scale;
    ctx.translate(x + bulb.x * scale, y + bulb.y * scale);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    glow.addColorStop(0, `rgba(255,232,164,${amount * .72})`);
    glow.addColorStop(.25, `rgba(255,205,100,${amount * .32})`);
    glow.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

// Walk this layer in the same back-to-front order as the visible scene. Every
// foreground silhouette blocks earlier light, including non-emitting objects.
export function paintDepthLight(ctx,occlude,emit) {
  ctx.save();ctx.globalCompositeOperation='destination-out';occlude();ctx.restore();
  emit?.();
}
