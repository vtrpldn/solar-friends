// Export the V2 entrance portal and roadside electricity pole for V3's access road.
import { createEntrancePortal, createUtilityPole } from "../web/v02/library/entrance.js";
import { compactModel } from "../web/v02/library/catalog.js";
import { exportModels } from "./v3-model-export.mjs";

await exportModels(
  [
    ["entrance-portal", compactModel(createEntrancePortal())],
    ["entrance-electric-pole", compactModel(createUtilityPole())],
  ],
  new URL("../bevy-v3/src/entrance.glb", import.meta.url),
);
