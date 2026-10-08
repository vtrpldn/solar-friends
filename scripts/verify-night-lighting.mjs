import assert from 'node:assert/strict';
import { buildingArt } from '../web/building-art.js';
import { drawNightEmission, emissionStrength, lampLightOffset } from '../web/night-lighting.js';

// A lit amber window survives moonlight shading, while cool roofs, dark timber
// and leaves cannot emit. White-gold lantern centres should remain bright too.
assert(emissionStrength(245, 185, 65) > .9);
assert(emissionStrength(255, 245, 200) > .8);
for (const rgb of [[70, 95, 150], [70, 45, 25], [80, 130, 55], [220, 220, 220]]) {
  assert.equal(emissionStrength(...rgb), 0);
}

// Independent bounds from the visible bulb in the source sprite: well above
// the foundation and on the hanging lantern's side of the post.
const bulb = lampLightOffset(buildingArt.streetlight);
assert(bulb.x > 7 && bulb.x < 11);
assert(bulb.y < -35 && bulb.y > -45);

const traces = [], source = { complete: true, naturalWidth: 3, naturalHeight: 1 };
const pixels = new Uint8ClampedArray([245,185,65,255, 70,95,150,255, 245,185,65,0]);
globalThis.document = { createElement: () => ({ width:0, height:0, getContext: () => ({
  drawImage(){}, getImageData: () => ({data:pixels}), putImageData(){}
}) }) };
const ctx = {
  save(){}, restore(){}, translate(x,y){traces.push(['translate',x,y]);}, transform(){},
  drawImage(){traces.push(['paint']);}, fillRect(){traces.push(['halo']);},
  createRadialGradient(){return {addColorStop(){}};}, globalAlpha:1
};
drawNightEmission(ctx,source,buildingArt.streetlight,'streetlight',100,200,1,0);
assert.deepEqual(traces,[],'Daylight and powerless lights must not paint emissions');
drawNightEmission(ctx,source,buildingArt.streetlight,'streetlight',100,200,1,1);
assert(pixels[3] > 240);
assert.equal(pixels[7],0,'Cool surfaces must remain transparent in the emission pass');
assert.equal(pixels[11],0,'Transparent sprite padding must stay transparent');
assert(traces.some(t=>t[0]==='translate'&&t[1]>107&&t[1]<111&&t[2]<165&&t[2]>155),'Glow must follow the lantern, not the ground anchor');
assert(traces.some(t=>t[0]==='halo'));
console.log('PASS: bright painted emissions, cool surface exclusion, transparent padding, lantern alignment, and no emission without power or after dawn.');
