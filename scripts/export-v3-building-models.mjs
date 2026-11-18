// Export one scene for each model in the desktop build catalog.
import { PROJECTS } from "../web/v02/weekend/simulation.js";
import { isBuildOption } from "../web/v02/weekend/build-categories.js";
import { compactModel, createAsset } from "../web/v02/library/catalog.js";
import { exportModels } from "./v3-model-export.mjs";

const ids = [...new Set(Object.entries(PROJECTS)
  .filter(([id, project]) => isBuildOption(id, project))
  .map(([, project]) => project.asset))].sort();

const models = ids.map((id) => {
  const model = createAsset(id);
  model.getObjectByName("optional-rooftop-solar")?.removeFromParent();
  return [id, compactModel(model)];
});
await exportModels(models, new URL("../bevy-v3/src/buildings.glb", import.meta.url));
