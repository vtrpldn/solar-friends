import * as THREE from "three";
import { box, beam } from "../workshop/models.js";
import { leanRoof } from "./roof-forms.js";

// An open timber carport over the two parking spaces: 7.4 × 5.4 m of clay-tile
// lean-to roof on six posts, the same family as the basic shelter. Cars drive in from the low-numbered z side, under the high eave.
const WIDTH = 7.4, DEPTH = 5.4, FRONT = 2.45, BACK = 3;
// The parked cars sit 2 m left and 2.2 m right of the site centre.
const POSTS_X = [-3.5, 0.1, 3.5], POSTS_Z = [-2.45, 2.45];
const eave = z => FRONT + (BACK - FRONT) * (DEPTH / 2 - z) / DEPTH;
// Stage 0 sets the footings, stage 1 raises the frame, stage 2 is the roofed shelter.
export function createCarport(stage = 2) {
  const g = new THREE.Group();
  for (const x of POSTS_X)
    for (const z of POSTS_Z) box(g, 0.34, 0.12, 0.34, "stone", x, 0.06, z);
  if (stage < 1) return g;
  for (const x of POSTS_X) {
    for (const z of POSTS_Z) {
      const top = eave(z) - 0.1;
      box(g, 0.16, top, 0.16, "timber", x, top / 2, z);
    }
    // One rafter per post line carries the sheets from eave to eave.
    beam(g, [x, eave(POSTS_Z[1]) - 0.08, POSTS_Z[1] + 0.2], [x, eave(POSTS_Z[0]) - 0.08, POSTS_Z[0] - 0.2], 0.13, "timberLight");
  }
  for (const z of POSTS_Z) {
    const y = eave(z) - 0.2;
    beam(g, [POSTS_X[0], y, z], [POSTS_X[2], y, z], 0.14, "timber");
    // Knee braces on the outer posts only, clear of the car doors.
    for (const side of [0, 2]) {
      const x = POSTS_X[side], inward = side ? -0.6 : 0.6;
      beam(g, [x, y - 0.6, z], [x + inward, y, z], 0.08, "timberLight");
    }
  }
  if (stage > 1) leanRoof(g, WIDTH, DEPTH, FRONT, BACK);
  return g;
}
