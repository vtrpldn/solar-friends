import assert from "node:assert/strict";
import { sunlightAt } from "../web/v02/weekend/sunlight.js";
const at = (hour, cloud = 0) => sunlightAt(((hour - 9) * 60) / 0.45, cloud);
const morning = at(8),
  noon = at(12),
  evening = at(16),
  rain = at(12, 1);
assert(morning.x > 0 && evening.x < 0);
const length = (light) => Math.hypot(light.x, light.z) / light.y;
assert(length(noon) < length(morning) && length(noon) < length(evening));
assert(rain.direct < noon.direct && rain.shadow < noon.shadow);
for (const hour of [0, 5, 6, 18, 22, 24]) assert.equal(at(hour).direct, 0);
assert.deepEqual(at(12), at(36));
for (let hour = 0; hour < 24; hour += 0.1) {
  for (const cloud of [0, 0.5, 1]) {
    const light = at(hour, cloud);
    assert(Object.values(light).every(Number.isFinite));
    assert(light.shadow >= 0 && light.shadow <= 1);
    assert(light.ambient > 0 && light.direct >= 0);
    // Entire 64x64 plot fits within the light camera's depth range.
    const distance = Math.hypot(light.x, light.y, light.z);
    if (light.direct > 0) assert(distance - Math.SQRT2 * 32 > 1);
    assert(distance + Math.SQRT2 * 32 < 190);
  }
}
console.log(
  "PASS: daily orbit, projected shadow length, rain contrast, night, wrap and map coverage",
);
