// Regenerate the standalone desktop game's opening models from the V2 artwork.
import { exportModels } from "./v3-model-export.mjs";
import { compactModel, createAsset } from "../web/v02/library/catalog.js";
import { createTent } from "../web/v02/library/camping.js";
import { createJimny } from "../web/v02/library/vehicles.js";
import { createResident, RESIDENT_IDS } from "../web/v02/residents/rig.js";

const models = [
  ...RESIDENT_IDS.filter((id) => id !== "resident").map((id) => [id, createResident(id)]),
  ...[0, 1].flatMap((variant) => [
    [`tent-${variant}`, createTent(variant)],
    [`car-${variant}`, createJimny(variant)],
  ]),
  ...["picnic-table", "well", "shed", "eco_toilet"].map((id) => [id, compactModel(createAsset(id))]),
];
await exportModels(models, new URL("../bevy-v3/src/opening.glb", import.meta.url));
